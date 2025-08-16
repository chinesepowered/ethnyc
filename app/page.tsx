"use client";

import { useState, useEffect, useRef } from 'react';
import { GoogleGenerativeAI, Content, Part } from "@google/generative-ai";

// Define the states for our application
type AppState = 
  | 'IDLE'
  | 'INITIALIZING'
  | 'LISTENING'
  | 'AWAITING_CONFIRMATION'
  | 'SENDING'
  | 'CONFIRMED'
  | 'ERROR';

// Define the structure for a pending transaction
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
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chatRef = useRef<any | null>(null); // Using any for chat object as type is complex

  // 1. Initialize Gemini and Media Recorder
  useEffect(() => {
    async function initialize() {
      setAppState('INITIALIZING');
      try {
        const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
        if (!apiKey) {
          throw new Error('NEXT_PUBLIC_GEMINI_API_KEY not found in environment variables.');
        }

        const genAI = new GoogleGenerativeAI(apiKey);

        const systemInstruction = `You are a voice-activated financial assistant. Your primary function is to understand and process transaction commands.
The user will say things like "Send 10 dollars to vitalik.eth" or "Transfer 5 FLOW tokens to flow-lover.find".
When you detect a clear intent to make a transaction, you must respond with a JSON object containing the following fields:
- "intent": "TRANSACTION"
- "amount": The numerical amount of the transaction.
- "currency": The currency or token name (e.g., "USD", "FLOW").
- "recipient": The recipient's name or address (e.g., "vitalik.eth", "flow-lover.find").

Example: If the user says "send 50 flow to sarah.find", you should output:
{"intent":"TRANSACTION", "amount":50, "currency":"FLOW", "recipient":"sarah.find"}

If the user gives a confirmation command like "yes", "confirm", or "go ahead", you must respond with the JSON object:
{"intent":"CONFIRMATION", "decision":"yes"}

If the user gives a cancellation command like "no" or "cancel", you must respond with the JSON object:
{"intent":"CONFIRMATION", "decision":"no"}

For any other speech, just transcribe it normally. Do not be conversational.
Only respond with the JSON objects when a clear intent is detected.`;

        const model = genAI.getGenerativeModel({
          model: "gemini-1.5-flash-latest",
          systemInstruction,
        });

        chatRef.current = model.startChat();

        // Get media stream
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // Setup MediaRecorder
        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: "video/webm" });
        
        mediaRecorderRef.current.ondataavailable = async (event) => {
          if (event.data.size > 0) {
            const blob = new Blob([event.data], { type: "video/webm" });
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = async () => {
              const base64Data = (reader.result as string).split(',')[1];
              const result = await chatRef.current.sendMessageStream([
                { inlineData: { data: base64Data, mimeType: "video/webm" } }
              ]);

              for await (const item of result.stream) {
                if (item.text) {
                  handleGeminiResponse(item.text());
                }
              }
            };
          }
        };

        mediaRecorderRef.current.start(1000); // Capture 1-second chunks
        setAppState('LISTENING');

      } catch (err: any) {
        console.error("Initialization Error:", err);
        setError(err.message || "An unknown error occurred during initialization.");
        setAppState('ERROR');
      }
    }

    initialize();

    return () => {
      mediaRecorderRef.current?.stop();
    };
  }, []);

  // 2. Handle Gemini's responses
  const handleGeminiResponse = (text: string) => {
    setTranscript(text);
    try {
      const jsonResponse = JSON.parse(text);
      if (jsonResponse.intent === 'TRANSACTION') {
        setPendingTx({
          amount: jsonResponse.amount,
          currency: jsonResponse.currency,
          recipient: jsonResponse.recipient,
        });
        setAppState('AWAITING_CONFIRMATION');
      } else if (jsonResponse.intent === 'CONFIRMATION') {
        if (appState === 'AWAITING_CONFIRMATION') {
          if (jsonResponse.decision === 'yes') {
            // User confirmed, proceed with transaction
            executeTransaction();
          } else {
            // User cancelled
            setPendingTx(null);
            setAppState('LISTENING');
          }
        }
      }
    } catch (e) {
      // Not a JSON response, just a regular transcript. Do nothing.
    }
  };

  // 3. Execute the transaction
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pendingTx),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Transaction failed');
      }

      setAppState('CONFIRMED');
      const txIdentifier = result.txHash || result.txId;
      setTranscript(`Successfully sent! Transaction ID: ${txIdentifier}`);

      // Reset after a few seconds
      setTimeout(() => {
        setPendingTx(null);
        setAppState('LISTENING');
        setTranscript('');
      }, 8000); // Longer timeout to read the tx id

    } catch (err: any) {
      console.error("Transaction Execution Error:", err);
      setError(err.message);
      setAppState('ERROR');
    }
  };


  return (
    <main style={styles.main}>
      <div style={styles.videoContainer}>
        <video ref={videoRef} autoPlay muted style={styles.video} />
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
    border: '1px solid #333'
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
  }
};
