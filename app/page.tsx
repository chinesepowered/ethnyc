"use client";

import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Session } from '@google/genai';

// --- Helper function to create a WAV Blob ---
const createWavBlob = (pcmData: Float32Array, sampleRate: number): Blob => {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  view.setUint32(0, 1380533830, false); // "RIFF"
  view.setUint32(4, 36 + pcmData.length * 2, true);
  view.setUint32(8, 1463899717, false); // "WAVE"
  view.setUint32(12, 1718449184, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 1684108385, false); // "data"
  view.setUint32(40, pcmData.length * 2, true);
  const pcm16 = new Int16Array(pcmData.length);
  for (let i = 0; i < pcmData.length; i++) {
    const s = Math.max(-1, Math.min(1, pcmData[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return new Blob([view, pcm16], { type: 'audio/wav' });
};

// --- React Component ---

type AppState =
  | 'IDLE'
  | 'INITIALIZING'
  | 'LISTENING'
  | 'AWAITING_CONFIRMATION'
  | 'SENDING'
  | 'CONFIRMED'
  | 'ERROR';

interface PendingTransaction {
  amount: number;
  currency: string;
  recipient: string;
}

export default function Home() {
  const [appState, setAppState] = useState<AppState>('IDLE');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingTx, setPendingTx] = useState<PendingTransaction | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    async function initialize() {
      setAppState('INITIALIZING');
      try {
        const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
        if (!apiKey) {
          throw new Error('NEXT_PUBLIC_GEMINI_API_KEY not found.');
        }

        const client = new GoogleGenAI({ apiKey });

        const systemInstruction = `You are a voice-activated financial assistant. Your primary function is to understand and process transaction commands based on audio and video context.
When you detect a clear intent to make a transaction, you must respond with a JSON object containing:
- "intent": "TRANSACTION"
- "amount": The numerical amount.
- "currency": The currency or token name (e.g., "USD", "FLOW").
- "recipient": The recipient's name (e.g., "vitalik.eth", "user.find").

Example: If the user says "send 50 flow to sarah.find", you must output:
{"intent":"TRANSACTION", "amount":50, "currency":"FLOW", "recipient":"sarah.find"}

If the user gives a confirmation command like "yes" or "confirm", you must respond with:
{"intent":"CONFIRMATION", "decision":"yes"}

If the user gives a cancellation command like "no" or "cancel", you must respond with:
{"intent":"CONFIRMATION", "decision":"no"}

For any other speech, just provide a direct transcript. Do not be conversational.
Only respond with JSON when a clear intent is detected.`;

        sessionRef.current = await client.live.connect({
          model: 'gemini-2.5-flash-preview-native-audio-dialog', // Note: Model may need to change for video
          config: {
            requestModalities: [Modality.AUDIO, Modality.VIDEO],
            responseModalities: [Modality.TEXT],
            speechConfig: { languageCode: 'en-US' },
            systemInstruction: { parts: [{ text: systemInstruction }] },
          },
          callbacks: {
            onmessage: (message: LiveServerMessage) => {
              const text = message.serverContent?.modelTurn?.parts[0]?.text;
              if (text) {
                handleGeminiResponse(text);
              }
            },
            onerror: (e: Error) => {
              console.error('Live API Error:', e);
              setError('An API error occurred. Please check the console.');
              setAppState('ERROR');
            },
            onclose: () => {
              console.log('Live API session closed.');
            },
          },
        });

        // --- Audio & Video Processing Setup ---
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { sampleRate: 16000, channelCount: 1 },
          video: { width: 640, height: 480, frameRate: 5 } // Lower frame rate for performance
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // --- Audio Processor ---
        const context = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        audioContextRef.current = context;
        const source = context.createMediaStreamSource(stream);
        mediaStreamSourceRef.current = source;
        const processor = context.createScriptProcessor(1024, 1, 1);
        scriptProcessorNodeRef.current = processor;
        processor.onaudioprocess = (audioProcessingEvent) => {
          if (sessionRef.current?.connectionState !== 'OPEN') return;
          const inputBuffer = audioProcessingEvent.inputBuffer;
          const pcmData = inputBuffer.getChannelData(0);
          const mediaBlob = createWavBlob(pcmData, context.sampleRate);
          sessionRef.current?.sendRealtimeInput({ media: mediaBlob });
        };
        source.connect(processor);
        processor.connect(context.destination);
        
        // --- Video Processor ---
        videoIntervalRef.current = setInterval(() => {
          if (sessionRef.current?.connectionState !== 'OPEN' || !videoRef.current || !canvasRef.current) {
            return;
          }
          const canvas = canvasRef.current;
          const video = videoRef.current;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
              if (blob && sessionRef.current?.connectionState === 'OPEN') {
                sessionRef.current?.sendRealtimeInput({ media: blob });
              }
            }, 'image/jpeg', 0.7);
          }
        }, 200); // 5 fps (1000ms / 5)

        setAppState('LISTENING');

      } catch (err: any) {
        console.error("Initialization Error:", err);
        setError(err.message || "An unknown error occurred during initialization.");
        setAppState('ERROR');
      }
    }

    initialize();

    return () => {
      if (videoIntervalRef.current) {
        clearInterval(videoIntervalRef.current);
      }
      mediaStreamSourceRef.current?.disconnect();
      scriptProcessorNodeRef.current?.disconnect();
      audioContextRef.current?.close();
      sessionRef.current?.close();
    };
  }, []);

  const handleGeminiResponse = (text: string) => {
    setTranscript(text);
    try {
      const jsonResponse = JSON.parse(text);
      if (jsonResponse.intent === 'TRANSACTION' && appState !== 'AWAITING_CONFIRMATION') {
        setPendingTx({
          amount: jsonResponse.amount,
          currency: jsonResponse.currency,
          recipient: jsonResponse.recipient,
        });
        setAppState('AWAITING_CONFIRMATION');
      } else if (jsonResponse.intent === 'CONFIRMATION') {
        if (appState === 'AWAITING_CONFIRMATION') {
          if (jsonResponse.decision === 'yes') {
            executeTransaction();
          } else {
            setPendingTx(null);
            setAppState('LISTENING');
          }
        }
      }
    } catch (e) {
      // Not a JSON response
    }
  };

  const executeTransaction = async () => {
    if (!pendingTx) return;
    setAppState('SENDING');
    setTranscript(`Sending ${pendingTx.amount} ${pendingTx.currency} to ${pendingTx.recipient}...`);
    try {
      const endpoint = pendingTx.currency.toUpperCase().includes('USD') ? '/api/transact/evm' : '/api/transact/flow';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingTx),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Transaction failed');
      }
      setAppState('CONFIRMED');
      const txIdentifier = result.txHash || result.txId;
      setTranscript(`Success! Tx: ${txIdentifier.substring(0, 10)}...`);
      setTimeout(() => {
        setPendingTx(null);
        setAppState('LISTENING');
        setTranscript('');
      }, 8000);
    } catch (err: any) {
      console.error("Transaction Execution Error:", err);
      setError(err.message);
      setAppState('ERROR');
    }
  };

  return (
    <main style={styles.main}>
      <div style={styles.videoContainer}>
        <video ref={videoRef} autoPlay muted playsInline style={styles.video} />
        <canvas ref={canvasRef} width="640" height="480" style={{ display: 'none' }} />
        <div style={styles.overlay}>
          <div style={styles.statusBox}>
            <p style={styles.statusText}><strong>STATUS:</strong> {appState}</p>
          </div>
          <div style={styles.transcriptBox}>
            <p>{transcript}</p>
          </div>
        </div>
      </div>

      {appState === 'AWAITING_CONFIRMATION' && pendingTx && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h2>Confirm Transaction</h2>
            <p style={styles.confirmationText}>
              Send <span style={styles.highlight}>{pendingTx.amount} {pendingTx.currency}</span> to <span style={styles.highlight}>{pendingTx.recipient}</span>?
            </p>
            <p><em>(Say "Yes" to confirm or "No" to cancel)</em></p>
          </div>
        </div>
      )}

      {(appState === 'CONFIRMED' || appState === 'SENDING') && (
         <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h2>{appState === 'SENDING' ? 'Sending...' : 'Transaction Confirmed!'}</h2>
            <p>{transcript}</p>
          </div>
        </div>
      )}

      {appState === 'ERROR' && (
         <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h2>Error</h2>
            <p>{error}</p>
            <button onClick={() => window.location.reload()} style={styles.button}>Retry</button>
          </div>
        </div>
      )}
    </main>
  );
}

// Basic inline styles for layout
const styles: { [key: string]: React.CSSProperties } = {
  main: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    color: 'white',
    fontFamily: 'monospace'
  },
  videoContainer: {
    position: 'relative',
    width: '80%',
    maxWidth: '960px',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    border: '1px solid #333',
    backgroundColor: '#111'
  },
  video: {
    width: '100%',
    display: 'block',
  },
  overlay: {
    position: 'absolute',
    bottom: '0',
    left: '0',
    width: '100%',
    padding: '20px',
    boxSizing: 'border-box',
    background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%)',
  },
  statusBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: '8px',
    padding: '5px 15px',
    marginBottom: '10px',
    width: 'fit-content',
    border: '1px solid #444'
  },
  statusText: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 'bold',
    textTransform: 'uppercase'
  },
  transcriptBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: '8px',
    padding: '15px',
    minHeight: '50px',
    border: '1px solid #444',
    fontSize: '1.2rem'
  },
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    padding: '40px',
    borderRadius: '16px',
    textAlign: 'center',
    boxShadow: '0 5px 20px rgba(0,0,0,0.5)',
    border: '1px solid #555',
    maxWidth: '80%',
  },
  confirmationText: {
    fontSize: '1.5rem',
    margin: '20px 0',
  },
  highlight: {
    color: '#4dff94',
    fontWeight: 'bold',
  },
  button: {
    marginTop: '20px',
    padding: '10px 20px',
    borderRadius: '8px',
    border: '1px solid #555',
    backgroundColor: '#333',
    color: 'white',
    cursor: 'pointer',
    fontSize: '1rem'
  }
};
