# 🥽 Vitalik - Personal Smart Glasses Assistant

Transform your smart glasses into an AI-powered shopping assistant that understands what you're looking at and handles cryptocurrency payments with just your voice.

## 🎯 What is Vitalik?

Vitalik is a cutting-edge AI shopping assistant designed for the next generation of AR/smart glasses. Simply look at any product, say "Hey Vitalik," and instantly get prices, make purchases, and complete transactions using cryptocurrency - all through natural voice commands.

### See It. Ask About It. Buy It. 
No screens. No typing. Just natural conversation.

## ✨ Key Features

### 👁️ Visual Intelligence
- **Real-time object recognition** - Identifies products just by looking at them
- **Context-aware responses** - Understands what you're looking at and provides relevant information
- **Multi-item detection** - Can identify multiple products in your field of view

### 🎙️ Voice-First Experience
- **Wake word activation** - "Hey Vitalik" or "Okay Vitalik" to start
- **Natural language processing** - Speak naturally, no rigid commands
- **Audio-only feedback** - Designed for screenless interaction

### 💰 Instant Crypto Payments
- **PYUSD on Arbitrum** - Lightning-fast stablecoin transactions
- **Flow blockchain** - Support for Flow tokens and NFTs
- **One-voice checkout** - Confirm purchases with a simple "yes"
- **On-chain verification** - Every transaction is real and verifiable

### 🔐 Enterprise-Grade Security
- **Authorized vendors only** - Curated list of trusted merchants
- **Voice confirmation required** - No accidental purchases
- **Duplicate protection** - Smart detection prevents double-charging
- **Blockchain transparency** - All transactions on public testnets

## 🚀 Live Demo

Experience the future of shopping:

1. **Enable camera and microphone** when prompted
2. **Say "Hey Vitalik"** to activate
3. **Show any product** to the camera (try a Coke can, phone charger, or water bottle)
4. **Ask about pricing** - "What does this cost?"
5. **Make a purchase** - "I want to buy this"
6. **Confirm with voice** - Say "yes" to complete the transaction

## 🛠️ Technology Stack

- **AI Vision**: Google Gemini 2.5 Flash for real-time visual analysis
- **Blockchain**: Arbitrum Sepolia (PYUSD) & Flow Testnet
- **Voice Processing**: WebRTC streaming with live transcription
- **ENS Integration**: L2 optimistic name resolution
- **Framework**: Next.js with React

## 💡 Use Cases

### Retail Shopping
Walk through stores and instantly get product information and prices without pulling out your phone.

### Vending Machines
Look at items in a vending machine and purchase with voice commands - no physical interaction needed.

### Museum & Gallery Tours
Get information about artifacts and artwork, with optional donation or purchase capabilities.

### Accessibility
Empowers visually impaired users with voice-guided shopping and audio confirmations.

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Smart Glasses │────▶│   Gemini AI     │────▶│   Blockchain    │
│   Camera + Mic  │     │  Vision + Voice  │     │  Arbitrum/Flow  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                        │
         │                       ▼                        │
         │              ┌─────────────────┐              │
         └─────────────▶│   Voice Output   │◀─────────────┘
                        │   Confirmation   │
                        └─────────────────┘
```

## 🌍 Real Transactions

Every purchase is a real blockchain transaction:
- **Arbitrum Sepolia**: [View on Arbiscan](https://sepolia.arbiscan.io/tx/0x4a9d83dc310aa24d10e4dd8f8c1f582f9b84f18815c25d09e422061520658fb3)
- **Flow Testnet**: [View on Flowscan](https://testnet.flowscan.io/tx/2567a49b676a132231497a0db10bd6bc53a49a91982f715387a5258411f98b1a)

## 🔮 The Future of Commerce

Vitalik represents the convergence of:
- **Augmented Reality** - Information overlaid on the real world
- **Artificial Intelligence** - Understanding context and intent
- **Blockchain Technology** - Instant, global, programmable money
- **Voice Computing** - The most natural human interface

## 🚦 Getting Started

### Prerequisites
- Node.js 18+
- Camera and microphone access
- Wallet with testnet PYUSD or Flow tokens

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/vitalik

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local

# Run the development server
pnpm dev
```

### Environment Variables

```env
NEXT_PUBLIC_GEMINI_API_KEY=       # Google AI Studio
WALLET_PRIVATE_KEY=                # For PYUSD transfers
FLOW_PRIVATE_KEY=                  # For Flow transfers
FLOW_ACCOUNT_ADDRESS=              # Your Flow account
ARBITRUM_SEPOLIA_RPC_URL=          # Arbitrum RPC endpoint
```

## 📊 Supported Products

Currently recognizes and sells:
- **Beverages**: Coca-Cola, Pepsi, Sprite, Energy Drinks, Water
- **Electronics**: USB-C Chargers, Phone Chargers, Laptop Chargers
- **Digital Goods**: Flow NFT Packs, Collectibles

## 🌟 Vision

We believe the future of shopping is:
- **Frictionless** - No apps, no cards, no checkout lines
- **Intuitive** - As natural as asking a friend
- **Transparent** - Every transaction on-chain
- **Accessible** - Voice-first for everyone

**Vitalik** is more than a shopping assistant - it's a glimpse into a world where technology disappears into the background, leaving only natural human interaction with instant, global, programmable money.
