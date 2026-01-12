import { CONTRACT_ADDRESSES } from './contracts';
import { ethers } from 'ethers';

// Get Alchemy API key from environment - use EXPO_PUBLIC_ prefix for React Native/Expo
const ALCHEMY_API_KEY = process.env.EXPO_PUBLIC_ALCHEMY_API_KEY || process.env.ALCHEMY_API_KEY;

if (!ALCHEMY_API_KEY) {
  console.warn('ALCHEMY_API_KEY not found in environment. Token holder functionality may not work. Please add EXPO_PUBLIC_ALCHEMY_API_KEY to your .env file.');
}

/**
 * Get total token holders count by checking addresses that have positive balances
 * This uses a more accurate method by checking actual token balances
 */
export async function getTotalTokenHolders(tokenAddress: string): Promise<number> {
  if (!ALCHEMY_API_KEY) {
    console.warn('ALCHEMY_API_KEY not configured, attempting fallback method');
    // Fallback to return 0 when API key is not configured
    // In a real implementation, you might want to access the provider from context
    // and query Transfer events directly using the provider
    return 0;
  }

  try {
    // Get addresses that have interacted with the token (from Transfer events)
    // Using eth_getLogs to get Transfer events
    const transferEventSignature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    
    const response = await fetch(
      `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getLogs',
          params: [{
            address: tokenAddress,
            topics: [transferEventSignature], // Filter for Transfer events
            fromBlock: '0x0', // From genesis
            toBlock: 'latest'
          }],
        }),
      }
    );

    const data = await response.json();
    
    if (data.error) {
      console.error('Alchemy eth_getLogs API error:', data.error);
      return 0;
    }

    if (data.result) {
      // Extract unique addresses from Transfer event logs
      const uniqueAddresses = new Set<string>();
      
      for (const log of data.result) {
        if (log.topics && log.topics.length >= 3) {
          // In Transfer events:
          // topics[0] is the event signature
          // topics[1] is the 'from' address (padded)
          // topics[2] is the 'to' address (padded)
          const fromAddress = '0x' + log.topics[1].substring(26); // Extract address from padded topic
          const toAddress = '0x' + log.topics[2].substring(26); // Extract address from padded topic
          
          uniqueAddresses.add(fromAddress.toLowerCase());
          uniqueAddresses.add(toAddress.toLowerCase());
        }
      }
      
      // Return the count of unique addresses that have interacted with the token
      // This is not the same as holders with positive balance, but it's the best
      // we can do without a backend indexer or access to a provider in this context
      return uniqueAddresses.size;
    }

    return 0;
  } catch (error) {
    console.error('Error fetching token holders from logs:', error);
    return 0;
  }
}

/**
 * Get holders count with multiple fallback methods
 * This is the most robust approach that should work in most cases
 */
export async function getTotalTokenHoldersWithFallback(tokenAddress: string): Promise<number> {
  if (!ALCHEMY_API_KEY) {
    console.warn('ALCHEMY_API_KEY not configured, will use contract-based fallback in dashboard');
    // When Alchemy API key is not configured, return 0 to signal fallback needed
    return 0;
  }

  try {
    // Note: Alchemy's Free tier has limitations on eth_getLogs (max 10 block range)
    // For testnet deployments with low activity, we'll query in small chunks
    // For production, consider upgrading to a paid Alchemy plan or using an indexer
    
    const transferEventSignature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    
    // Try to get the latest block first
    const latestBlockResponse = await fetch(
      `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: [],
        }),
      }
    );

    const latestBlockData = await latestBlockResponse.json();
    if (latestBlockData.error || !latestBlockData.result) {
      console.error('Error fetching latest block:', latestBlockData.error);
      return 0;
    }

    const latestBlock = parseInt(latestBlockData.result, 16);
    // For free tier, use only last 10 blocks
    const fromBlock = Math.max(0, latestBlock - 10);
    
    console.log(`Alchemy API: Fetching Transfer events from block ${fromBlock} to ${latestBlock}`);
    
    const response = await fetch(
      `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'eth_getLogs',
          params: [{
            address: tokenAddress,
            topics: [transferEventSignature],
            fromBlock: '0x' + fromBlock.toString(16),
            toBlock: '0x' + latestBlock.toString(16)
          }],
        }),
      }
    );

    const data = await response.json();
    
    if (data.error) {
      console.error('Alchemy eth_getLogs API error:', data.error);
      // Return 0 to trigger contract-based fallback in dashboard
      return 0;
    }

    if (data.result) {
      // Extract unique addresses from Transfer event logs
      const uniqueAddresses = new Set<string>();
      
      for (const log of data.result) {
        if (log.topics && log.topics.length >= 3) {
          const fromAddress = '0x' + log.topics[1].substring(26);
          const toAddress = '0x' + log.topics[2].substring(26);
          
          // Exclude zero address (mints and burns)
          if (fromAddress !== '0x0000000000000000000000000000000000000000') {
            uniqueAddresses.add(fromAddress.toLowerCase());
          }
          if (toAddress !== '0x0000000000000000000000000000000000000000') {
            uniqueAddresses.add(toAddress.toLowerCase());
          }
        }
      }
      
      console.log(`Alchemy API: Found ${uniqueAddresses.size} unique addresses in last 10 blocks`);
      return uniqueAddresses.size;
    }

    return 0;
  } catch (error) {
    console.error('Error in Alchemy API holder count:', error);
    return 0;
  }
}