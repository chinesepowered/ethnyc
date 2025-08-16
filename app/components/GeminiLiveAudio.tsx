'use client';

import { GoogleGenAI, LiveServerMessage, Modality, Session } from '@google/genai';
import { useState, useEffect, useRef } from 'react';
import { createBlob, decode, decodeAudioData } from '../utils/audio';
import { Analyser } from '../utils/analyser';

export default function GeminiLiveAudio() {
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const clientRef = useRef<GoogleGenAI | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const inputNodeRef = useRef<GainNode | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const inputAnalyserRef = useRef<Analyser | null>(null);
  const outputAnalyserRef = useRef<Analyser | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);

  const updateStatus = (msg: string) => {
    setStatus(msg);
  };

  const updateError = (msg: string) => {
    setError(msg);
  };

  const initAudio = () => {
    if (outputAudioContextRef.current) {
      nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
    }
  };

  const initClient = async () => {
    initAudio();

    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      updateError('NEXT_PUBLIC_GEMINI_API_KEY not found in environment variables');
      return;
    }

    clientRef.current = new GoogleGenAI({
      apiKey: apiKey,
    });

    if (outputNodeRef.current && outputAudioContextRef.current) {
      outputNodeRef.current.connect(outputAudioContextRef.current.destination);
    }

    initSession();
  };

  const initSession = async () => {
    if (!clientRef.current) return;

    const model = 'gemini-live-2.5-flash-preview';

    try {
      sessionRef.current = await clientRef.current.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            updateStatus('Connected to Gemini AI');
            setIsConnected(true);
          },
          onmessage: async (message: LiveServerMessage) => {
            console.log('Received message:', message);
            console.log('Message type:', Object.keys(message));
            console.log('Server content:', message.serverContent);
            
            // Handle setup complete
            if (message.setupComplete) {
              console.log('Setup completed, ready to send audio');
              updateStatus('Ready to receive audio input');
            }
            
            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData;

            if (audio && outputAudioContextRef.current) {
              console.log('Processing audio response');
              nextStartTimeRef.current = Math.max(
                nextStartTimeRef.current,
                outputAudioContextRef.current.currentTime,
              );

              const audioBuffer = await decodeAudioData(
                decode(audio.data!),
                outputAudioContextRef.current,
                24000,
                1,
              );
              const source = outputAudioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              if (outputNodeRef.current) {
                source.connect(outputNodeRef.current);
              }
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current = nextStartTimeRef.current + audioBuffer.duration;
              sourcesRef.current.add(source);
              setIsPlaying(true);
              source.addEventListener('ended', () => {
                if (sourcesRef.current.size === 1) {
                  setIsPlaying(false);
                }
              });
            }

            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              for (const source of sourcesRef.current.values()) {
                source.stop();
                sourcesRef.current.delete(source);
              }
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e: ErrorEvent) => {
            updateError(e.message);
          },
          onclose: (e: CloseEvent) => {
            updateStatus('Disconnected: ' + e.reason);
            setIsConnected(false);
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Orus' } },
          },
        },
      });
    } catch (e) {
      console.error(e);
      updateError(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const startRecording = async () => {
    if (isRecording) {
      return;
    }

    if (!sessionRef.current) {
      await initSession();
    }

    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.resume();
    }

    updateStatus('Requesting microphone access...');

    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      updateStatus('Microphone access granted. Starting capture...');

      if (inputAudioContextRef.current && inputNodeRef.current) {
        sourceNodeRef.current = inputAudioContextRef.current.createMediaStreamSource(
          mediaStreamRef.current,
        );
        sourceNodeRef.current.connect(inputNodeRef.current);

        const bufferSize = 256;
        scriptProcessorNodeRef.current = inputAudioContextRef.current.createScriptProcessor(
          bufferSize,
          1,
          1,
        );

        scriptProcessorNodeRef.current.onaudioprocess = (audioProcessingEvent) => {
          console.log('Audio processing event fired, isRecording:', isRecordingRef.current);
          if (!isRecordingRef.current) return;

          const inputBuffer = audioProcessingEvent.inputBuffer;
          const pcmData = inputBuffer.getChannelData(0);
          console.log('PCM data received, length:', pcmData.length, 'sample:', pcmData[0]);

          if (sessionRef.current) {
            console.log('Sending audio chunk, size:', pcmData.length, 'max amplitude:', Math.max(...pcmData.map(Math.abs)));
            try {
              sessionRef.current.sendRealtimeInput({ media: createBlob(pcmData) });
              console.log('Audio chunk sent successfully');
            } catch (err) {
              console.error('Error sending audio:', err);
            }
          } else {
            console.log('No session available to send audio');
          }
        };

        sourceNodeRef.current.connect(scriptProcessorNodeRef.current);
        scriptProcessorNodeRef.current.connect(inputAudioContextRef.current.destination);

        setIsRecording(true);
        isRecordingRef.current = true;
        updateStatus('🔴 Recording... Capturing PCM chunks.');
      }
    } catch (err) {
      console.error('Error starting recording:', err);
      updateStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      stopRecording();
    }
  };

  const stopRecording = () => {
    if (!isRecording && !mediaStreamRef.current && !inputAudioContextRef.current)
      return;

    updateStatus('Stopping recording...');

    setIsRecording(false);
    isRecordingRef.current = false;

    if (scriptProcessorNodeRef.current && sourceNodeRef.current && inputAudioContextRef.current) {
      scriptProcessorNodeRef.current.disconnect();
      sourceNodeRef.current.disconnect();
    }

    scriptProcessorNodeRef.current = null;
    sourceNodeRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    updateStatus('Recording stopped. Click Start to begin again.');
  };

  const reset = () => {
    sessionRef.current?.close();
    initSession();
    updateStatus('Session cleared.');
  };

  useEffect(() => {
    let mounted = true;

    const initializeApp = async () => {
      if (!mounted) return;

      // Initialize audio contexts
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      outputAudioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      
      inputNodeRef.current = inputAudioContextRef.current.createGain();
      outputNodeRef.current = outputAudioContextRef.current.createGain();
      
      // Initialize analysers for audio level feedback
      inputAnalyserRef.current = new Analyser(inputNodeRef.current);
      outputAnalyserRef.current = new Analyser(outputNodeRef.current);
      
      // Start audio level monitoring
      const updateAudioLevels = () => {
        if (inputAnalyserRef.current) {
          inputAnalyserRef.current.update();
          const level = Math.max(...Array.from(inputAnalyserRef.current.data)) / 255;
          setAudioLevel(level);
        }
        animationFrameRef.current = requestAnimationFrame(updateAudioLevels);
      };
      updateAudioLevels();

      await initClient();
    };

    initializeApp();

    return () => {
      mounted = false;
      stopRecording();
      if (sessionRef.current) {
        sessionRef.current.close();
        sessionRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
             if (inputAudioContextRef.current) {
         inputAudioContextRef.current.close();
       }
       if (outputAudioContextRef.current) {
         outputAudioContextRef.current.close();
       }
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
      {/* Connection Status */}
      <div className="absolute top-6 left-6 z-10">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
          isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-400' : 'bg-red-400'
          }`} />
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      {/* Audio Level Indicator */}
      {isRecording && (
        <div className="absolute top-6 right-6 z-10">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 text-white">
            <div className="text-sm">Audio Level:</div>
            <div className="w-20 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-green-400 to-red-400 transition-all duration-75"
                style={{ width: `${audioLevel * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Playing Indicator */}
      {isPlaying && (
        <div className="absolute top-20 right-6 z-10">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/20 text-blue-400">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            AI Speaking
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="text-center text-white">
        <h1 className="text-4xl font-bold mb-4">Gemini Live Audio</h1>
        <p className="text-gray-300 mb-8">Click the red button to start talking with AI</p>
      </div>

      <div className="absolute bottom-20 left-0 right-0 z-10 flex flex-col items-center justify-center gap-4">
        <button
          onClick={reset}
          disabled={isRecording}
          className="w-16 h-16 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed outline-none cursor-pointer flex items-center justify-center transition-all"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            height="40px"
            viewBox="0 -960 960 960"
            width="40px"
            fill="#ffffff"
          >
            <path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
          </svg>
        </button>
        <button
          onClick={startRecording}
          disabled={isRecording}
          className={`w-20 h-20 rounded-full border-4 outline-none cursor-pointer flex items-center justify-center transition-all transform hover:scale-105 ${
            isRecording 
              ? 'bg-red-500 border-red-400 animate-pulse' 
              : 'bg-red-600/80 border-red-500 hover:bg-red-500'
          }`}
        >
          <svg
            viewBox="0 0 100 100"
            width="32px"
            height="32px"
            fill="#c80000"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="50" cy="50" r="50" />
          </svg>
        </button>
        <button
          onClick={stopRecording}
          disabled={!isRecording}
          className="w-16 h-16 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed outline-none cursor-pointer flex items-center justify-center transition-all"
        >
          <svg
            viewBox="0 0 100 100"
            width="32px"
            height="32px"
            fill="#000000"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="0" y="0" width="100" height="100" rx="15" />
          </svg>
        </button>
      </div>

      <div className="absolute bottom-6 left-0 right-0 z-10 text-center text-white px-4">
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg mb-2 max-w-md mx-auto">
            {error}
          </div>
        )}
        {status && (
          <div className="bg-white/10 border border-white/20 text-white px-4 py-2 rounded-lg max-w-md mx-auto">
            {status}
          </div>
        )}
      </div>
    </div>
  );
}