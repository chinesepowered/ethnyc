import { NextResponse } from 'next/server';
import { ethers } from 'ethers';

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
    
    // For L2 ENS resolution, we need both L1 and L2 providers
    const l1Provider = new ethers.JsonRpcProvider(
      process.env.SEPOLIA_RPC_URL || 'https://sepolia.drpc.org'
    );
    
    const l2Provider = new ethers.JsonRpcProvider(
      process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc'
    );
    
    // Set a 10-second timeout for ENS resolution
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('ENS resolution timeout')), 10000)
    );
    
    try {
      // Get coin type for Arbitrum Sepolia
      const coinType = evmChainIdToCoinType(chainId);
      const reverseNamespace = `${coinType.toString(16)}.reverse`;
      
      console.log(`Resolving ENS for ${address} on L2 chain ${chainId}, namespace: ${reverseNamespace}`);
      
      // Try to get the reverse resolver for the L2 chain from L1
      const chainReverseResolver = await Promise.race([
        l1Provider.getResolver(reverseNamespace),
        timeoutPromise
      ]) as any;
      
      if (!chainReverseResolver || chainReverseResolver.address === ethers.ZeroAddress) {
        console.log('No reverse resolver found for L2 chain');
        
        // Fallback: Try standard ENS resolution on L1
        const ensName = await Promise.race([
          l1Provider.lookupAddress(address),
          timeoutPromise
        ]) as string | null;
        
        if (ensName) {
          return NextResponse.json({
            success: true,
            ensName: ensName,
            address,
            chainId,
            method: 'l1-fallback'
          });
        }
        
        return NextResponse.json({
          success: false,
          message: 'No ENS name found'
        });
      }
      
      // Get the L2 registrar address
      try {
        const l2RegistrarABI = ['function l2Registrar() view returns (address)'];
        const l1ResolverContract = new ethers.Contract(
          chainReverseResolver.address, 
          l2RegistrarABI, 
          l1Provider
        );
        
        const l2Registrar = await Promise.race([
          l1ResolverContract.l2Registrar(),
          timeoutPromise
        ]) as string;
        
        if (l2Registrar && l2Registrar !== ethers.ZeroAddress) {
          // Read the name from L2
          const nameForAddrABI = ['function nameForAddr(address) view returns (string)'];
          const l2Contract = new ethers.Contract(l2Registrar, nameForAddrABI, l2Provider);
          
          const reverseName = await Promise.race([
            l2Contract.nameForAddr(address),
            timeoutPromise
          ]) as string;
          
          if (reverseName && reverseName !== '') {
            // Verify forward resolution matches using L1
            const forwardAddr = await Promise.race([
              l1Provider.resolveName(reverseName),
              timeoutPromise
            ]) as string | null;
            
            if (forwardAddr && forwardAddr.toLowerCase() === address.toLowerCase()) {
              return NextResponse.json({
                success: true,
                ensName: reverseName,
                address,
                chainId,
                coinType,
                method: 'l2-optimistic'
              });
            }
          }
        }
      } catch (l2Error) {
        console.log('L2 registrar lookup failed:', l2Error);
      }
      
      // Final fallback: Try standard L1 resolution
      const ensName = await Promise.race([
        l1Provider.lookupAddress(address),
        timeoutPromise
      ]) as string | null;
      
      if (ensName) {
        return NextResponse.json({
          success: true,
          ensName: ensName,
          address,
          chainId,
          method: 'l1-direct'
        });
      }
      
      return NextResponse.json({
        success: false,
        message: 'No ENS name found for this address'
      });
      
    } catch (resolverError: any) {
      console.log('ENS resolution failed:', resolverError.message);
      
      // If timeout, return quickly
      if (resolverError.message === 'ENS resolution timeout') {
        return NextResponse.json({
          success: false,
          message: 'ENS resolution timed out'
        });
      }
      
      return NextResponse.json({
        success: false,
        message: 'No ENS name found',
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