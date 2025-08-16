import { NextResponse } from 'next/server';
import { getRecipientByVendor } from '@/app/data/store';

// For Flow blockchain integration
// This is a simplified version - in production you'd use @onflow/fcl
export async function POST(request: Request) {
  try {
    const { amount, recipient } = await request.json();
    
    // Get recipient details
    const recipientData = getRecipientByVendor(recipient);
    if (!recipientData) {
      return NextResponse.json(
        { error: 'Unauthorized recipient' },
        { status: 403 }
      );
    }
    
    // Get private key from environment
    const privateKey = process.env.FLOW_PRIVATE_KEY;
    if (!privateKey) {
      console.error('FLOW_PRIVATE_KEY not found in environment');
      return NextResponse.json(
        { error: 'Flow wallet not configured' },
        { status: 500 }
      );
    }
    
    console.log(`Transferring ${amount} FLOW to ${recipient} (${recipientData.flowAddress})`);
    
    // TODO: Implement actual Flow transfer using Flow SDK
    // For hackathon demo, we'll simulate the transfer
    
    // In production, you would:
    // 1. Import Flow SDK (@onflow/fcl)
    // 2. Configure FCL with testnet settings
    // 3. Create and sign transaction
    // 4. Send transaction to Flow blockchain
    // 5. Wait for confirmation
    
    // Simulated response for demo
    const mockTxId = '0x' + Math.random().toString(16).substring(2, 18);
    
    // Try to resolve ENS name for the recipient address (if they have one)
    let ensName = null;
    try {
      // Note: Flow addresses don't have ENS directly, but we could check if the vendor has an associated Ethereum address
      const ensResponse = await fetch(`${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/ens/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          address: recipientData.pyusdAddress, // Use PYUSD address for ENS lookup
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
      message: `Successfully transferred ${amount} FLOW to ${recipient}`,
      transactionId: mockTxId,
      recipient: recipientData.flowAddress,
      ensName: ensName,
      // In production, would include actual Flow transaction details
      note: 'Demo mode - actual Flow transfer not implemented'
    });
    
  } catch (error: any) {
    console.error('Flow transfer error:', error);
    return NextResponse.json(
      { 
        error: 'Transfer failed',
        details: error.message 
      },
      { status: 500 }
    );
  }
}