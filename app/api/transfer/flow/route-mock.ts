import { NextResponse } from 'next/server';
import { getRecipientByVendor } from '@/app/data/store';

// Simple mock for Flow transfers during hackathon
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
    
    // Ensure Flow address is provided
    if (!recipientData.flowAddress) {
      return NextResponse.json(
        { error: 'Recipient does not have a Flow address configured' },
        { status: 400 }
      );
    }
    
    console.log(`Mock Flow transfer: ${amount} FLOW to ${recipient} (${recipientData.flowAddress})`);
    
    // For hackathon demo, return mock success
    // In production, this would use proper Flow SDK integration
    const mockTransactionId = '0x' + Math.random().toString(16).substr(2, 64);
    
    return NextResponse.json({
      success: true,
      message: `Successfully transferred ${amount} FLOW to ${recipient}`,
      transactionId: mockTransactionId,
      recipient: recipientData.flowAddress,
      blockId: 'mock-block-' + Date.now(),
      status: 'SEALED',
      statusCode: 0,
      method: 'Mock Flow Transfer (Hackathon Demo)',
      note: 'This is a mock transaction for demonstration purposes'
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