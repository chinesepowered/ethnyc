"use client";

import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Session } from '@google/genai';

// --- Helper function to create a WAV Blob ---
// This is a simplified version of what a utility library might provide.
// It creates a WAV file header and combines it with the raw PCM data.
const createWavBlob = (pcmData: Float32Array, sampleRate: number): Blob => {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // RIFF identifier
  view.setUint32(0, 1380533830, false); // "RIFF"
  // file length
  view.setUint32(4, 36 + pcmData.length * 2, true);
  // RIFF type
  view.setUint32(8, 1463899717, false); // "WAVE"
  // format chunk identifier
  view.setUint32(12, 1718449184, false); // "fmt "
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  view.setUint32(36, 1684108385, false); // "data"
  // data chunk length
  view.setUint32(40, pcmData.length * 2, true);

  // Convert PCM to 16-bit
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

  useEffect(() => {
    async function initialize() {
      setAppState('INITIALIZING');
      try {
        const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
        if (!apiKey) {
          throw new Error('NEXT_PUBLIC_GEMINI_API_KEY not found.');
        }

        const client = new GoogleGenAI({ apiKey });

        const systemInstruction = `You are a voice-activated financial assistant. Your primary function is to understand and process transaction commands.
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
          model: 'gemini-2.5-flash-preview-native-audio-dialog',
          config: {
            // Request text responses, not audio
            responseModalities: [Modality.TEXT],
            speechConfig: {
              languageCode: 'en-US',
            },
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
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

        // --- Audio Processing Setup ---
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        
        const context = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        audioContextRef.current = context;

        const source = context.createMediaStreamSource(stream);
        mediaStreamSourceRef.current = source;

        const processor = context.createScriptProcessor(1024, 1, 1);
        scriptProcessorNodeRef.current = processor;

        processor.onaudioprocess = (audioProcessingEvent) => {
          const inputBuffer = audioProcessingEvent.inputBuffer;
          const pcmData = inputBuffer.getChannelData(0);
          const mediaBlob = createWavBlob(pcmData, context.sampleRate);
          sessionRef.current?.sendRealtimeInput({ media: mediaBlob });
        };

        source.connect(processor);
        processor.connect(context.destination);

        setAppState('LISTENING');

      } catch (err: any) {
        console.error("Initialization Error:", err);
        setError(err.message || "An unknown error occurred during initialization.");
        setAppState('ERROR');
      }
    }

    initialize();

    return () => {
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
      // Not a JSON response, just a regular transcript.
    }
  };

  const executeTransaction = async () => {
    if (!pendingTx) return;
    setAppState('SENDING');
    setTranscript(`Sending ${pendingTx.amount} ${pendingTx.currency} to ${pendingTx.recipient}...`);
    try {
      let endpoint = '';
      const currency = pendingTx.currency.toUpperCase();
      if (currency === 'USD' || currency === 'PYUSD') {
        endpoint = '/api/transact/evm';
      } else if (currency === 'FLOW') {
        endpoint = '/api/transact/flow';
      } else {
        throw new Error(`Unsupported currency: ${pendingTx.currency}`);
      }
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
        {/* The video element is no longer used for streaming to Gemini, but can be a visual element */}
        <video autoPlay muted playsInline style={styles.video} />
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
    opacity: 0.5, // Video is just for show now
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