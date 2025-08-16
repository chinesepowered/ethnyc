
import { NextResponse } from 'next/server';
import { ethers } from 'ethers';

// The ABI for the ERC-20 transfer function
const erc20Abi = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

// The address of the PayPal USD (PYUSD) token on Sepolia testnet
const tokenAddress = '0xCaC524BcA292aaade2DF8A05cC58F0a65B1B3bB9';

// --- SECURITY --- 
// A hardcoded list of approved ENS recipients. 
// For the hackathon, add the ENS names you want to allow transactions to here.
const approvedRecipients = [
  'vitalik.eth', // Example
  // Add other ENS names here e.g. 'user.eth'
];

export async function POST(request: Request) {
  try {
    const { amount, recipient } = await request.json();

    // --- VALIDATION ---
    if (!amount || !recipient || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount or recipient' }, { status: 400 });
    }

    // --- SECURITY CHECK ---
    if (!approvedRecipients.includes(recipient.toLowerCase())) {
        return NextResponse.json({ error: `Recipient '${recipient}' is not on the approved list.` }, { status: 403 });
    }

    const rpcUrl = process.env.SEPOLIA_RPC_URL;
    const privateKey = process.env.ETH_PRIVATE_KEY;

    if (!rpcUrl || !privateKey) {
      throw new Error('Server environment variables for Sepolia are not set.');
    }

    // --- ENS RESOLUTION & TRANSACTION ---
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    const recipientAddress = await provider.resolveName(recipient);

    if (!recipientAddress) {
      return NextResponse.json({ error: `Could not resolve ENS name: ${recipient}` }, { status: 404 });
    }

    const contract = new ethers.Contract(tokenAddress, erc20Abi, wallet);

    // Fetch token decimals to ensure correct amount formatting
    const decimals = await contract.decimals();
    const amountToSend = ethers.parseUnits(amount.toString(), decimals);

    // Send the transaction
    const tx = await contract.transfer(recipientAddress, amountToSend);
    console.log(`Transaction sent! Hash: ${tx.hash}`);

    // Wait for the transaction to be mined
    await tx.wait();
    console.log(`Transaction mined: ${tx.hash}`);

    return NextResponse.json({ success: true, txHash: tx.hash });

  } catch (error: any) {
    console.error("EVM Transaction Error:", error);
    // Provide a more specific error message if available
    const message = error.reason || error.message || "An unknown error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
