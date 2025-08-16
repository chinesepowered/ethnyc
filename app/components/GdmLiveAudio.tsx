"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Session } from '@google/genai';
import { createBlob, decode, decodeAudioData } from '../utils';
import { GdmLiveAudioVisuals3D } from './GdmLiveAudioVisuals3D';

export const GdmLiveAudio: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  // Audio context refs
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
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Initialize audio contexts
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      outputAudioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      
      inputNodeRef.current = inputAudioContextRef.current.createGain();
      outputNodeRef.current = outputAudioContextRef.current.createGain();
    }
  }, []);

  const updateStatus = useCallback((msg: string) => {
    setStatus(msg);
  }, []);

  const updateError = useCallback((msg: string) => {
    setError(msg);
  }, []);

  const initAudio = useCallback(() => {
    if (outputAudioContextRef.current) {
      nextStartTimeRef.current = outputAudioContextRef.current.currentTime;
    }
  }, []);

  const initSession = useCallback(async () => {
    const model = 'gemini-2.5-flash-preview-native-audio-dialog';

    try {
      if (!clientRef.current) return;

      sessionRef.current = await clientRef.current.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            updateStatus('Opened');
          },
          onmessage: async (message: LiveServerMessage) => {
            const audio = message.serverContent?.modelTurn?.parts[0]?.inlineData;

            if (audio && outputAudioContextRef.current && outputNodeRef.current) {
              nextStartTimeRef.current = Math.max(
                nextStartTimeRef.current,
                outputAudioContextRef.current.currentTime,
              );

              const audioBuffer = await decodeAudioData(
                decode(audio.data),
                outputAudioContextRef.current,
                24000,
                1,
              );
              const source = outputAudioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputNodeRef.current);
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current = nextStartTimeRef.current + audioBuffer.duration;
              sourcesRef.current.add(source);
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
            updateStatus('Close:' + e.reason);
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
    }
  }, [updateStatus, updateError]);

  const initClient = useCallback(async () => {
    initAudio();

    clientRef.current = new GoogleGenAI({
      apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY!,
    });

    if (outputNodeRef.current && outputAudioContextRef.current) {
      outputNodeRef.current.connect(outputAudioContextRef.current.destination);
    }

    initSession();
  }, [initAudio, initSession]);

  // Initialize client on mount
  useEffect(() => {
    initClient();
  }, [initClient]);

  const startRecording = useCallback(async () => {
    if (isRecording || !inputAudioContextRef.current) return;

    inputAudioContextRef.current.resume();
    updateStatus('Requesting microphone access...');

    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      updateStatus('Microphone access granted. Starting capture...');

      sourceNodeRef.current = inputAudioContextRef.current.createMediaStreamSource(
        mediaStreamRef.current,
      );
      if (inputNodeRef.current) {
        sourceNodeRef.current.connect(inputNodeRef.current);
      }

      const bufferSize = 256;
      scriptProcessorNodeRef.current = inputAudioContextRef.current.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      scriptProcessorNodeRef.current.onaudioprocess = (audioProcessingEvent) => {
        if (!isRecording) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);

        if (sessionRef.current) {
          sessionRef.current.sendRealtimeInput({ media: createBlob(pcmData) });
        }
      };

      sourceNodeRef.current.connect(scriptProcessorNodeRef.current);
      scriptProcessorNodeRef.current.connect(inputAudioContextRef.current.destination);

      setIsRecording(true);
      updateStatus('🔴 Recording... Capturing PCM chunks.');
    } catch (err: any) {
      console.error('Error starting recording:', err);
      updateStatus(`Error: ${err.message}`);
      stopRecording();
    }
  }, [isRecording, updateStatus]);

  const stopRecording = useCallback(() => {
    if (!isRecording && !mediaStreamRef.current && !inputAudioContextRef.current) return;

    updateStatus('Stopping recording...');
    setIsRecording(false);

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
  }, [isRecording, updateStatus]);

  const reset = useCallback(() => {
    sessionRef.current?.close();
    initSession();
    updateStatus('Session cleared.');
  }, [initSession, updateStatus]);

  return (
    <div className="relative w-full h-screen">
      <div className="controls fixed bottom-[10vh] left-0 right-0 z-10 flex items-center justify-center flex-col gap-2.5">
        <button
          onClick={reset}
          disabled={isRecording}
          className="outline-none border border-white/20 text-white rounded-xl bg-white/10 w-16 h-16 cursor-pointer text-2xl p-0 m-0 hover:bg-white/20 disabled:hidden"
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
          className="outline-none border border-white/20 text-white rounded-xl bg-white/10 w-16 h-16 cursor-pointer text-2xl p-0 m-0 hover:bg-white/20 disabled:hidden"
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
          className="outline-none border border-white/20 text-white rounded-xl bg-white/10 w-16 h-16 cursor-pointer text-2xl p-0 m-0 hover:bg-white/20 disabled:hidden"
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

      <div className="fixed bottom-[5vh] left-0 right-0 z-10 text-center text-white">
        {error}
      </div>

      {inputNodeRef.current && outputNodeRef.current && (
        <GdmLiveAudioVisuals3D
          inputNode={inputNodeRef.current}
          outputNode={outputNodeRef.current}
        />
      )}
    </div>
  );
};

