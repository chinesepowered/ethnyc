import { NextResponse } from 'next/server';
import { ethers } from 'ethers';

// Universal Resolver address on Sepolia
const UNIVERSAL_RESOLVER = '0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe';

// Universal Resolver ABI for reverse resolution
const RESOLVER_ABI = [
  'function reverse(bytes lookupAddress, uint256 coinType) view returns (string, address, address)'
];

// Convert EVM chain ID to ENSIP-11 coin type
function evmChainIdToCoinType(chainId: number): number {
  // Ethereum mainnet, sepolia, holesky use coin type 60
  if ([1, 11155111, 17000].includes(chainId)) return 60;
  // L2 chains use formula: (0x80000000 | chainId) >>> 0
  return (0x80000000 | chainId) >>> 0;
}

export async function POST(request: Request) {
  try {
    const { address, chainId = 421614 } = await request.json(); // Default to Arbitrum Sepolia
    
    if (!address) {
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      );
    }
    
    // Connect to Sepolia for ENS resolution (ENS is on L1)
    const provider = new ethers.JsonRpcProvider(
      process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org'
    );
    
    // Create contract instance
    const resolver = new ethers.Contract(UNIVERSAL_RESOLVER, RESOLVER_ABI, provider);
    
    // Get coin type for the chain
    const coinType = evmChainIdToCoinType(chainId);
    
    try {
      // Resolve the primary name
      const result = await resolver.reverse(address, coinType);
      const primaryName = result[0];
      
      if (!primaryName) {
        return NextResponse.json({
          success: false,
          message: 'No ENS name found for this address'
        });
      }
      
      return NextResponse.json({
        success: true,
        ensName: primaryName,
        address,
        chainId,
        coinType
      });
      
    } catch (resolverError: any) {
      console.log('ENS resolution failed:', resolverError.message);
      
      // Return null if no ENS name found
      return NextResponse.json({
        success: false,
        message: 'No ENS name found for this address',
        details: resolverError.message
      });
    }
    
  } catch (error: any) {
    console.error('ENS resolve error:', error);
    return NextResponse.json(
      { 
        error: 'ENS resolution failed',
        details: error.message 
      },
      { status: 500 }
    );
  }
}