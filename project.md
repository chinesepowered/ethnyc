# Vitalik - AI Shopping Assistant for Smart Glasses

## Project Overview
This is a hackathon project that implements a voice-activated AI shopping assistant designed for smart glasses. The system uses visual recognition through a camera feed and responds entirely through voice, simulating an AR glasses experience with real blockchain payments on Arbitrum Sepolia and Flow testnet.

## Core Features

### 1. Wake Word Activation
- Responds only to commands starting with "okay vitalik" or "hey vitalik"
- Ignores all other audio input to prevent accidental activation

### 2. Visual Object Recognition
- Real-time video capture and analysis using Gemini 2.5 Live Flash
- Identifies products visible in camera feed (sodas, chargers, bottles, etc.)
- Matches visible items against store inventory

### 3. Voice-Controlled Shopping
- **Item Lookup**: Identifies visible objects and retrieves pricing
- **Inventory Query**: Can list all available items on request
- **Purchase Flow**: 
  - Identifies item and announces price/vendor
  - Requests voice confirmation ("say yes to confirm, no to cancel")
  - Processes payment upon verbal confirmation

### 4. Cryptocurrency Payments
- **PYUSD Transfers**: Real PayPal USD transfers on Arbitrum Sepolia testnet
- **Flow Token Transfers**: Real Flow blockchain transactions on testnet
- **Authorized Recipients Only**: Hardcoded vendor list for security
- **ENS Resolution**: L2 optimistic ENS resolution for Arbitrum Sepolia addresses
- **Transaction Explorer Links**: Direct links to Arbiscan and Flowscan for verification
- **Confirmation Dialog**: Persistent transaction confirmation with close button

### 5. Emergency System
- Activates when user says "help" or appears distressed
- Logs emergency with timestamp and reason
- Could integrate with real emergency services in production

## Technical Architecture

### Frontend
- **Framework**: Next.js with React
- **AI Integration**: Gemini 2.5 Live Flash API via @google/genai SDK
- **Media Capture**: WebRTC for simultaneous audio/video streaming
- **UI Philosophy**: Minimal visual feedback (simulating smart glasses HUD)

### Key Components
- `GeminiLiveAudio.tsx`: Main component handling all AI interactions
  - Video capture at 320x240, 2fps (optimized for real-time processing)
  - Audio streaming with 16kHz sample rate
  - Tool calling for all assistant functions
  - Voice activity detection for confirmation flow

### Backend APIs
- `/api/transfer/pyusd`: Handles PYUSD transfers on Arbitrum Sepolia
- `/api/transfer/flow`: Handles Flow token transfers with ECDSA_secp256k1 signing
- `/api/ens/resolve`: L2 optimistic ENS resolution (L1 Sepolia + L2 Arbitrum)
- `/api/emergency`: Emergency help system endpoint

### Store System
- Hardcoded inventory with 11 items from 4 vendors
- Flexible item matching algorithm for natural language queries
- Authorized recipient list with wallet addresses
- Updated vendor addresses: 0xe3B24b93C18eD1B7eEa9e07b3B03D03259f3942e (PYUSD)
- Flow addresses: 0xecb8d6f1b3a8639f

## AI Model Configuration

### Gemini 2.5 Live Flash
- **Model**: gemini-live-2.5-flash-preview
- **Input**: Audio (voice commands) + Video (camera feed)
- **Output**: Audio (voice responses)
- **Voice**: Orus voice preset

### Available Tools
1. `lookup_item`: Find items based on visual/verbal description
2. `list_items`: Return full inventory list
3. `purchase_item`: Initiate purchase flow
4. `confirm_purchase`: Process voice confirmation (yes/no)
5. `emergency_help`: Trigger emergency assistance
6. `transfer_flow`: Execute Flow token transfers

## User Experience Flow

1. **Activation**: User says "okay vitalik" to wake the assistant
2. **Visual Recognition**: User shows item to camera or describes it
3. **Price Query**: Assistant identifies item and announces price
4. **Purchase Intent**: User requests to buy the item
5. **Voice Confirmation**: Assistant asks for verbal confirmation
6. **Payment**: Upon "yes", payment is processed to authorized vendor
7. **Confirmation**: Transaction details announced via voice

## Development Setup

### Environment Variables Required
```
NEXT_PUBLIC_GEMINI_API_KEY=       # Gemini API access
WALLET_PRIVATE_KEY=                # For PYUSD transfers
FLOW_PRIVATE_KEY=                  # For Flow transfers (secp256k1)
FLOW_ACCOUNT_ADDRESS=              # Flow sender account
FLOW_KEY_INDEX=                    # Optional: Key index (default 0)
ARBITRUM_SEPOLIA_RPC_URL=          # Arbitrum testnet RPC
SEPOLIA_RPC_URL=                   # L1 Sepolia for ENS (uses drpc.org)
NEXT_PUBLIC_URL=                   # App URL for internal API calls
```

### Key Dependencies
- `@google/genai`: Gemini AI SDK
- `ethers`: Ethereum/L2 interactions
- `viem`: Ethereum utilities

## Recent Improvements
- **Duplicate Purchase Prevention**: 10-second cooldown for same item, prevents concurrent purchases
- **Persistent Confirmation Dialog**: Stays open until user manually closes
- **Transaction Explorer Integration**: Direct links to view transactions on-chain
- **ENS L2 Support**: Proper L2 optimistic resolution with 10-second timeout
- **Flow Signature Fix**: Using correct secp256k1 curve and SHA2-256 hashing
- **Reliable RPC Endpoints**: Using drpc.org for Sepolia to avoid 522 errors

## Security Considerations
- Private keys never exposed to frontend
- Authorized recipients only (no arbitrary addresses)
- Wake word prevents accidental purchases
- Duplicate purchase prevention with state tracking
- Transaction verification through block explorers

## Known Issues & Solutions
- **Flow Signing**: Must use secp256k1 (not P256) and SHA2-256 (not SHA3-256)
- **ENS on L2**: Requires both L1 and L2 providers for proper resolution
- **Sepolia RPC**: Using drpc.org instead of rpc.sepolia.org to avoid 522 errors
- **Multiple Orders**: Fixed with purchase state tracking and cooldowns

## Future Enhancements (Post-Hackathon)
- Dynamic vendor registration
- Multi-language support
- Purchase history and receipts
- Real emergency service integration
- Biometric voice authentication
- Support for more cryptocurrencies
- Production-ready ENS integration