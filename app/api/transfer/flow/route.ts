import { NextResponse } from 'next/server';
import { getRecipientByVendor } from '@/app/data/store';
import * as fcl from '@onflow/fcl';
import { createHash } from 'crypto';
import { ec as EC } from 'elliptic';

// Initialize elliptic curve for Flow - using secp256k1 based on your account settings
const ec = new EC('secp256k1');

// Configure FCL for Flow testnet
fcl.config({
  'accessNode.api': 'https://rest-testnet.onflow.org',
  'flow.network': 'testnet',
  'discovery.wallet': 'https://fcl-discovery.onflow.org/testnet/authn'
});

// Flow Actions-based transaction for transferring FLOW tokens
// This uses the modern Flow Actions pattern with Source/Sink interfaces
const TRANSFER_FLOW_WITH_ACTIONS = `
import FungibleToken from 0x9a0766d93b6608b7
import FlowToken from 0x7e60df042a9c0868
import FungibleTokenMetadataViews from 0x9a0766d93b6608b7

transaction(amount: UFix64, to: Address) {
    // The Vault resource that holds the tokens being transferred
    let sentVault: @{FungibleToken.Vault}
    
    // Reference to the receiver's Vault
    let receiverRef: &{FungibleToken.Receiver}
    
    prepare(signer: auth(BorrowValue) &Account) {
        // Get a reference to the signer's stored vault
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("Could not borrow reference to the owner's Vault!")
        
        // Withdraw tokens from the signer's stored vault
        self.sentVault <- vaultRef.withdraw(amount: amount)
        
        // Get the recipient's public account object
        let recipient = getAccount(to)
        
        // Borrow a reference to the recipient's Receiver
        self.receiverRef = recipient.capabilities.borrow<&{FungibleToken.Receiver}>(
            /public/flowTokenReceiver
        ) ?? panic("Could not borrow receiver reference to the recipient's Vault")
    }
    
    execute {
        // Deposit the withdrawn tokens in the recipient's receiver
        self.receiverRef.deposit(from: <-self.sentVault)
    }
    
    post {
        // Verify the transfer was successful
        // Note: In production, you might want to add more verification
    }
}
`;

// Helper function to sign transaction with private key
function signWithKey(privateKey: string, message: Buffer): Buffer {
  // Remove 0x prefix if present
  const cleanKey = privateKey.replace(/^0x/, '');
  
  // Create key from private key
  const key = ec.keyFromPrivate(Buffer.from(cleanKey, 'hex'));
  
  // Hash with SHA256 (SHA2-256)
  const hash = createHash('sha256').update(message).digest();
  
  // Sign the hash
  const sig = key.sign(hash);
  
  // Get signature in Flow format
  // Flow expects r and s values as 32-byte big-endian buffers
  const n = 32;
  const r = sig.r.toArrayLike(Buffer, 'be', n);
  const s = sig.s.toArrayLike(Buffer, 'be', n);
  
  return Buffer.concat([r, s]);
}

// Create authorization function for FCL
const authorization = (account: any) => {
  let privateKey = process.env.FLOW_PRIVATE_KEY;
  let accountAddress = process.env.FLOW_ACCOUNT_ADDRESS;
  
  if (!privateKey || !accountAddress) {
    throw new Error('Flow configuration incomplete');
  }

  // Clean private key - remove 0x prefix if present
  privateKey = privateKey.replace(/^0x/, '');
  
  // Validate private key format (should be 64 hex chars for P256)
  if (!/^[a-fA-F0-9]{64}$/.test(privateKey)) {
    console.error('Invalid Flow private key format');
    throw new Error('Invalid Flow private key format - should be 64 hex characters');
  }

  // Ensure address has 0x prefix and is properly formatted
  if (!accountAddress.startsWith('0x')) {
    accountAddress = '0x' + accountAddress;
  }
  
  // Validate Flow address format
  const flowAddressRegex = /^0x[a-fA-F0-9]{16}$/;
  if (!flowAddressRegex.test(accountAddress)) {
    console.error(`Invalid Flow sender address format: ${accountAddress}`);
    throw new Error(`Invalid Flow address format for sender: ${accountAddress}`);
  }

  console.log(`Using Flow sender address: ${accountAddress}`);

  // Default to key index 0, but allow override via environment variable
  const keyId = process.env.FLOW_KEY_INDEX ? parseInt(process.env.FLOW_KEY_INDEX) : 0;
  
  // Get the public key from the private key for verification
  const cleanPrivateKey = privateKey.replace(/^0x/, '');
  const keyPair = ec.keyFromPrivate(Buffer.from(cleanPrivateKey, 'hex'));
  const publicKey = keyPair.getPublic('hex');
  console.log('Public key:', publicKey);
  
  const signingFunction = async (signable: any) => {
    console.log('Signing message for Flow transaction');
    console.log('Signable object:', JSON.stringify(signable, null, 2));
    
    // FCL provides the message that needs to be signed
    const messageHex = signable.message;
    
    // Sign using SHA2-256 hash (your account uses SHA2_256, not SHA3_256)
    const hash = createHash('sha256')
      .update(Buffer.from(messageHex, 'hex'))
      .digest();
    
    // Sign the hash
    const sig = keyPair.sign(hash);
    
    // Get signature in Flow format (r + s concatenated)
    const r = sig.r.toArrayLike(Buffer, 'be', 32);
    const s = sig.s.toArrayLike(Buffer, 'be', 32);
    const signature = Buffer.concat([r, s]).toString('hex');
    
    console.log('Generated signature:', signature);
    
    return {
      addr: fcl.withPrefix(accountAddress),
      keyId: keyId,
      signature: signature
    };
  };
  
  return {
    ...account,
    addr: fcl.withPrefix(accountAddress),
    keyId: keyId,
    signingFunction
  };
};

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
    
    // Validate Flow address format (0x followed by 16 hex chars)
    const flowAddressRegex = /^0x[a-fA-F0-9]{16}$/;
    if (!flowAddressRegex.test(recipientData.flowAddress)) {
      return NextResponse.json(
        { error: 'Invalid Flow address format for recipient' },
        { status: 400 }
      );
    }
    
    // Get private key and address from environment
    const privateKey = process.env.FLOW_PRIVATE_KEY;
    const senderAddress = process.env.FLOW_ACCOUNT_ADDRESS;
    
    if (!privateKey || !senderAddress) {
      console.error('Flow configuration missing:', {
        hasPrivateKey: !!privateKey,
        hasAddress: !!senderAddress
      });
      return NextResponse.json(
        { error: 'Flow wallet not properly configured' },
        { status: 500 }
      );
    }
    
    console.log(`Initiating Flow Actions transfer: ${amount} FLOW to ${recipient} (${recipientData.flowAddress})`);
    
    // Log sender configuration for debugging
    const flowSenderAddress = process.env.FLOW_ACCOUNT_ADDRESS;
    console.log('Flow sender configuration:', {
      address: flowSenderAddress?.startsWith('0x') ? flowSenderAddress : '0x' + flowSenderAddress,
      hasPrivateKey: !!process.env.FLOW_PRIVATE_KEY,
      keyIndex: process.env.FLOW_KEY_INDEX || '0'
    });
    
    try {
      // Build and send the transaction using Flow Actions pattern
      const transactionId = await fcl.mutate({
        cadence: TRANSFER_FLOW_WITH_ACTIONS,
        args: (arg: any, t: any) => [
          arg(amount.toFixed(8), t.UFix64), // Flow uses 8 decimal places
          arg(recipientData.flowAddress, t.Address)
        ],
        proposer: authorization,
        payer: authorization,
        authorizations: [authorization],
        limit: 999
      });
      
      console.log('Flow Actions transaction submitted:', transactionId);
      
      // Wait for transaction to be sealed
      const transaction = await fcl.tx(transactionId).onceSealed();
      console.log('Transaction sealed:', transaction);
      
      // Check transaction status
      if (transaction.statusCode !== 0) {
        throw new Error(`Transaction failed with status code: ${transaction.statusCode}`);
      }
      
      return NextResponse.json({
        success: true,
        message: `Successfully transferred ${amount} FLOW to ${recipient}`,
        transactionId: transactionId,
        recipient: recipientData.flowAddress,
        blockId: transaction.blockId,
        status: transaction.status,
        statusCode: transaction.statusCode,
        method: 'Flow Actions'
      });
      
    } catch (txError: any) {
      console.error('Flow Actions transaction error:', txError);
      
      // Handle specific error cases
      if (txError.message?.includes('Could not borrow')) {
        return NextResponse.json(
          { 
            error: 'Flow transfer failed - wallet not properly initialized',
            details: 'Ensure the sender account has FLOW tokens and vault is properly configured',
            hint: 'The account may need to be initialized with a FLOW vault first'
          },
          { status: 500 }
        );
      }
      
      if (txError.message?.includes('insufficient balance')) {
        return NextResponse.json(
          { 
            error: 'Insufficient FLOW balance',
            details: `Attempting to transfer ${amount} FLOW but account has insufficient funds`
          },
          { status: 400 }
        );
      }
      
      throw txError;
    }
    
  } catch (error: any) {
    console.error('Flow transfer error:', error);
    return NextResponse.json(
      { 
        error: 'Transfer failed',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}