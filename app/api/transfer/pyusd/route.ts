import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { getRecipientByVendor } from '@/app/data/store';

// PYUSD contract ABI (minimal for transfer)
const PYUSD_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

// PYUSD contract address on Arbitrum Sepolia testnet
const PYUSD_CONTRACT_ADDRESS = '0x637A1259C6afd7E3AdF63993cA7E58BB438aB1B1';

export async function POST(request: Request) {
  try {
    const { amount, recipient, currency } = await request.json();
    
    if (currency !== 'PYUSD') {
      return NextResponse.json(
        { error: 'This endpoint only handles PYUSD transfers' },
        { status: 400 }
      );
    }
    
    // Get recipient details
    const recipientData = getRecipientByVendor(recipient);
    if (!recipientData) {
      return NextResponse.json(
        { error: 'Unauthorized recipient' },
        { status: 403 }
      );
    }
    
    // Get private key from environment
    const privateKey = process.env.WALLET_PRIVATE_KEY;
    if (!privateKey) {
      console.error('WALLET_PRIVATE_KEY not found in environment');
      return NextResponse.json(
        { error: 'Wallet not configured' },
        { status: 500 }
      );
    }
    
    // Connect to Arbitrum Sepolia testnet
    const provider = new ethers.JsonRpcProvider(
      process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc'
    );
    
    const wallet = new ethers.Wallet(privateKey, provider);
    
    // Create contract instance
    const pyusdContract = new ethers.Contract(PYUSD_CONTRACT_ADDRESS, PYUSD_ABI, wallet);
    
    // Get decimals
    const decimals = await pyusdContract.decimals();
    
    // Convert amount to proper units
    const amountInUnits = ethers.parseUnits(amount.toString(), decimals);
    
    // Check balance
    const balance = await pyusdContract.balanceOf(wallet.address);
    if (balance < amountInUnits) {
      return NextResponse.json(
        { error: 'Insufficient PYUSD balance' },
        { status: 400 }
      );
    }
    
    console.log(`Transferring ${amount} PYUSD to ${recipient} (${recipientData.pyusdAddress})`);
    
    // Execute transfer
    const tx = await pyusdContract.transfer(recipientData.pyusdAddress, amountInUnits);
    const receipt = await tx.wait();
    
    // Try to resolve ENS name for the recipient address
    let ensName = null;
    try {
      const ensResponse = await fetch(`${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/ens/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          address: recipientData.pyusdAddress,
          chainId: 421614 // Arbitrum Sepolia
        })
      });
      const ensData = await ensResponse.json();
      if (ensData.success) {
        ensName = ensData.ensName;
      }
    } catch (error) {
      console.log('ENS resolution failed, continuing without ENS name');
    }
    
    return NextResponse.json({
      success: true,
      message: `Successfully transferred ${amount} PYUSD to ${recipient}`,
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      recipient: recipientData.pyusdAddress,
      ensName: ensName
    });
    
  } catch (error: any) {
    console.error('PYUSD transfer error:', error);
    return NextResponse.json(
      { 
        error: 'Transfer failed',
        details: error.message 
      },
      { status: 500 }
    );
  }
}