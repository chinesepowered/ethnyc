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
    
    // For hackathon demo, skip ENS resolution if it's taking too long
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    // For L2 optimistic resolution, we need both L1 and L2 providers
    // Use a more reliable Sepolia RPC endpoint
    const l1Provider = new ethers.JsonRpcProvider(
      process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia.publicnode.com'
    );
    
    const l2Provider = new ethers.JsonRpcProvider(
      process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc'
    );
    
    // Get coin type for the chain
    const coinType = evmChainIdToCoinType(chainId);
    
    try {
      // First, try to get the reverse resolver for the L2 chain
      const reverseNamespace = `${coinType.toString(16)}.reverse`;
      
      // Use L1 provider to resolve the reverse resolver
      const chainReverseResolver = await l1Provider.resolveName(reverseNamespace);
      
      if (!chainReverseResolver || chainReverseResolver === ethers.ZeroAddress) {
        // Fallback: Try direct resolution on L2
        const l2ReverseRegistrar = '0xa0E1cBa4FE786118c0abb1Dbeb32f007234f692d'; // Arbitrum Sepolia reverse registrar
        
        try {
          const nameForAddrABI = ['function nameForAddr(address) view returns (string)'];
          const l2Contract = new ethers.Contract(l2ReverseRegistrar, nameForAddrABI, l2Provider);
          const reverseName = await l2Contract.nameForAddr(address);
          
          if (reverseName && reverseName !== '') {
            // Verify forward resolution matches
            const forwardAddr = await l1Provider.resolveName(reverseName);
            
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
        } catch (l2Error) {
          console.log('L2 reverse resolution failed:', l2Error);
        }
      } else {
        // Get the L2 registrar address from the L1 resolver
        const l2RegistrarABI = ['function l2Registrar() view returns (address)'];
        const l1ResolverContract = new ethers.Contract(chainReverseResolver, l2RegistrarABI, l1Provider);
        
        try {
          const l2Registrar = await l1ResolverContract.l2Registrar();
          
          if (l2Registrar && l2Registrar !== ethers.ZeroAddress) {
            // Read the name from L2
            const nameForAddrABI = ['function nameForAddr(address) view returns (string)'];
            const l2Contract = new ethers.Contract(l2Registrar, nameForAddrABI, l2Provider);
            const reverseName = await l2Contract.nameForAddr(address);
            
            if (reverseName && reverseName !== '') {
              // Verify forward resolution matches
              const forwardAddr = await l1Provider.resolveName(reverseName);
              
              if (forwardAddr && forwardAddr.toLowerCase() === address.toLowerCase()) {
                return NextResponse.json({
                  success: true,
                  ensName: reverseName,
                  address,
                  chainId,
                  coinType,
                  method: 'l2-optimistic-resolver'
                });
              }
            }
          }
        } catch (resolverError) {
          console.log('L1 resolver lookup failed:', resolverError);
        }
      }
      
      // If all L2 methods fail, try standard L1 resolution as fallback
      const primaryName = await l1Provider.lookupAddress(address);
      
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
        coinType,
        method: 'l1-fallback'
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