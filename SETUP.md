# EthNYC Hackathon Project Setup

Follow these steps to get the project running.

## 1. Environment Variables

Create a `.env.local` file by copying the sample file:

```bash
cp .env.sample .env.local
```

Now, open `.env.local` and fill in the required values.

- `NEXT_PUBLIC_GEMINI_API_KEY`: Your API key from Google AI Studio. The `NEXT_PUBLIC_` prefix is required to expose it to the browser.
- `SEPOLIA_RPC_URL`: An RPC URL for the Sepolia testnet (e.g., from Infura or Alchemy).
- `ETH_PRIVATE_KEY`: The private key of your Ethereum wallet **without the "0x" prefix**. This account needs Sepolia ETH for gas and the testnet PYUSD token.
- `FLOW_ACCESS_NODE`: This is pre-filled for the Flow testnet.
- `FLOW_ACCOUNT_ADDRESS`: Your Flow testnet account address.
- `FLOW_PRIVATE_KEY`: The private key for your Flow account.

### Getting a Flow Testnet Account

You can get a free testnet account, including an address and keys, from the [Flow Testnet Faucet](https://testnet-faucet.onflow.org/).

## 2. Install Dependencies

Install the necessary packages using npm:

```bash
npm install
```

## 3. ENS Testnet Name Setup (Bounty Requirement)

To allow transactions to be sent to you via your ENS name, you need to register a name on the Sepolia testnet and configure it for reverse resolution.

1.  **Get Sepolia ETH:** Make sure your wallet has Sepolia ETH. You can get some from a public faucet like [sepoliafaucet.com](https://sepoliafaucet.com/).
2.  **Go to the ENS App:** Navigate to [app.ens.domains](https://app.ens.domains/) and connect your wallet. Make sure the network is set to **Sepolia**.
3.  **Register a Name:** Search for an available `.eth` name and follow the prompts to register it. You will need to confirm a couple of transactions.
4.  **Set Primary Name (Crucial Step):**
    *   After registering, go to "My Account".
    *   You should see your new ENS name there.
    *   Select it from the dropdown menu for "Primary ENS Name" and save your changes. This sets up the reverse record (address -> name) which is what the app will use for lookups.

## 4. Run the Application

Once the setup is complete, you can run the development server:

```bash
npm run dev
```
