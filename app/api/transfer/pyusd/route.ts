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
    
    // Validate recipient address
    if (!ethers.isAddress(recipientData.pyusdAddress)) {
      return NextResponse.json(
        { error: 'Invalid recipient address format' },
        { status: 400 }
      );
    }
    
    // Get private key from environment
    const privateKey = process.env.ETH_PRIVATE_KEY || process.env.WALLET_PRIVATE_KEY;
    if (!privateKey) {
      console.error('ETH_PRIVATE_KEY not found in environment');
      return NextResponse.json(
        { error: 'Wallet not configured' },
        { status: 500 }
      );
    }
    
    // Add 0x prefix if not present
    const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
    
    // Connect to Arbitrum Sepolia testnet
    const provider = new ethers.JsonRpcProvider(
      process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc'
    );
    
    const wallet = new ethers.Wallet(formattedPrivateKey, provider);
    
    // Verify we're on Arbitrum Sepolia (chainId: 421614)
    const network = await provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
    
    if (network.chainId !== 421614n) {
      console.warn(`Warning: Expected Arbitrum Sepolia (421614) but connected to chainId ${network.chainId}`);
    }
    
    // Log wallet address for debugging
    console.log(`Wallet address: ${wallet.address}`);
    
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
    
    // Estimate gas to ensure transaction will succeed
    try {
      const gasEstimate = await pyusdContract.transfer.estimateGas(
        recipientData.pyusdAddress, 
        amountInUnits
      );
      console.log(`Gas estimate: ${gasEstimate.toString()}`);
    } catch (gasError: any) {
      console.error('Gas estimation failed:', gasError);
      return NextResponse.json(
        { 
          error: 'Transaction would fail',
          details: 'Gas estimation failed - likely insufficient balance or invalid recipient',
          gasError: gasError.message
        },
        { status: 400 }
      );
    }
    
    // Execute transfer with gas limit buffer
    const tx = await pyusdContract.transfer(recipientData.pyusdAddress, amountInUnits, {
      gasLimit: 100000 // Set reasonable gas limit for ERC20 transfer on L2
    });
    
    console.log(`Transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    
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
    
    // Handle specific error cases
    if (error.code === 'INSUFFICIENT_FUNDS') {
      return NextResponse.json(
        { 
          error: 'Insufficient ETH for gas fees',
          details: 'Your wallet needs ETH on Arbitrum Sepolia to pay for transaction fees'
        },
        { status: 400 }
      );
    }
    
    if (error.code === 'CALL_EXCEPTION') {
      return NextResponse.json(
        { 
          error: 'Contract call failed',
          details: 'The PYUSD contract rejected the transaction. Check token balance and allowance.'
        },
        { status: 400 }
      );
    }
    
    if (error.code === 'NETWORK_ERROR') {
      return NextResponse.json(
        { 
          error: 'Network connection failed',
          details: 'Could not connect to Arbitrum Sepolia RPC endpoint'
        },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Transfer failed',
        details: error.message,
        code: error.code
      },
      { status: 500 }
    );
  }
}