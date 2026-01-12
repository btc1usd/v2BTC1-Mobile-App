import { createClient } from '@supabase/supabase-js';

// Supabase connection configuration
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase credentials not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your .env file');
}

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Database Types - Updated to match actual Supabase schema
 */
export interface Distribution {
  id: number;
  merkle_root: string;
  total_rewards: string;
  claims: any; // JSONB field containing all user claims: { "0xaddress": { index, amount, proof } }
  metadata: any; // JSONB field for additional metadata
  created_at: string;
}

export interface MerkleClaim {
  id: number; // distribution id
  distribution_id: number;
  index: number;
  account: string;
  amount: string;
  proof: string[]; // JSON array of merkle proof hashes
  claimed: boolean;
  created_at: string;
}

export interface DistributionStats {
  distribution_id: number;
  total_tokens: string;
  total_claimed: string;
  percentage_claimed: number;
  total_claimers: number;
  total_claimed_count: number;
}

/**
 * Fetch user's merkle proof and claim data for a specific distribution
 * Distribution data contains embedded claims JSONB field
 */
export async function fetchUserMerkleProof(
  address: string,
  distributionId: number
): Promise<MerkleClaim | null> {
  try {
    const { data, error } = await supabase
      .from('merkle_distributions_dev')
      .select('*')
      .eq('id', distributionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    // Parse claims JSONB field
    if (data && data.claims) {
      const userAddress = address.toLowerCase();
      const userClaim = data.claims[userAddress];
      
      if (userClaim) {
        return {
          id: data.id,
          distribution_id: data.id,
          index: userClaim.index,
          account: userAddress,
          amount: userClaim.amount,
          proof: userClaim.proof || [],
          claimed: false, // Check on-chain if needed
          created_at: data.created_at,
        };
      }
    }

    return null;
  } catch (error: any) {
    console.error('Error fetching merkle proof:', error.message || error);
    return null;
  }
}

/**
 * Fetch all unclaimed rewards for a user across all distributions
 * Parses embedded claims JSONB from distribution records
 * ALWAYS verifies on-chain to ensure accuracy
 */
export async function fetchUserUnclaimedRewards(
  address: string,
  provider?: any // ethers provider for on-chain verification (REQUIRED for accuracy)
): Promise<MerkleClaim[]> {
  try {
    const { data, error } = await supabase
      .from('merkle_distributions_dev')
      .select('*')
      .order('id', { ascending: false });

    if (error) throw error;

    console.log('[fetchUserUnclaimedRewards] Found distributions:', data?.length || 0);

    // Parse claims from each distribution (ignore 'claimed' flag initially)
    const allUserClaims: MerkleClaim[] = [];
    const userAddress = address.toLowerCase();

    for (const dist of data || []) {
      if (dist.claims) {
        const userClaim = dist.claims[userAddress];
        
        // Include ALL user claims (we'll verify on-chain)
        if (userClaim) {
          allUserClaims.push({
            id: dist.id,
            distribution_id: dist.id,
            index: userClaim.index,
            account: userAddress,
            amount: userClaim.amount,
            proof: userClaim.proof || [],
            claimed: false, // Will verify on-chain
            created_at: dist.created_at,
          });
        }
      }
    }

    console.log('[fetchUserUnclaimedRewards] Total user claims found:', allUserClaims.length);

    // CRITICAL: Always verify on-chain (this is the source of truth)
    if (!provider) {
      console.warn('[fetchUserUnclaimedRewards] ⚠️ No provider - cannot verify claims on-chain!');
      // Filter by Supabase flag only (less reliable)
      return allUserClaims.filter(claim => {
        const distData = data?.find(d => d.id === claim.distribution_id);
        return distData?.claims?.[userAddress]?.claimed !== true;
      });
    }

    try {
      console.log('[fetchUserUnclaimedRewards] Verifying on-chain (authoritative)...');
      const { ethers } = await import('ethers');
      const { CONTRACT_ADDRESSES, ABIS } = await import('./shared/contracts');
      
      const distributorContract = new ethers.Contract(
        CONTRACT_ADDRESSES.MERKLE_DISTRIBUTOR,
        ABIS.MERKLE_DISTRIBUTOR,
        provider
      );

      // Verify ALL claims on-chain in parallel (fast)
      const verificationPromises = allUserClaims.map(async (claim) => {
        try {
          // Timeout for each verification (3 seconds)
          const timeoutPromise = new Promise<boolean>((_, reject) => {
            setTimeout(() => reject(new Error('Verification timeout')), 3000);
          });
          
          const claimCheckPromise = distributorContract.isClaimed(
            claim.distribution_id,
            claim.index
          );
          
          const isClaimed = await Promise.race([claimCheckPromise, timeoutPromise]) as boolean;
          
          // Update Supabase if status changed
          if (isClaimed) {
            const distData = data?.find(d => d.id === claim.distribution_id);
            const dbClaimedFlag = distData?.claims?.[userAddress]?.claimed;
            
            if (!dbClaimedFlag) {
              console.warn(`[Sync] Dist ${claim.distribution_id} claimed on-chain but not in DB - updating...`);
              await markClaimAsClaimed(claim.distribution_id, claim.account);
            }
            
            console.log(`[Verification] Dist ${claim.distribution_id}, Index ${claim.index}: CLAIMED`);
            return null; // Filter out
          }
          
          console.log(`[Verification] Dist ${claim.distribution_id}, Index ${claim.index}: UNCLAIMED`);
          return claim;
        } catch (err: any) {
          console.warn(`[Verification] Failed for ${claim.distribution_id}/${claim.index}:`, err.message);
          // On timeout/error, check Supabase flag as fallback
          const distData = data?.find(d => d.id === claim.distribution_id);
          const dbClaimedFlag = distData?.claims?.[userAddress]?.claimed;
          return dbClaimedFlag === true ? null : claim;
        }
      });

      const verifiedResults = await Promise.all(verificationPromises);
      
      // Filter out null values (claimed rewards)
      const unclaimedOnly = verifiedResults.filter(claim => claim !== null) as MerkleClaim[];
      console.log(`[fetchUserUnclaimedRewards] ✅ Verified: ${unclaimedOnly.length} unclaimed out of ${allUserClaims.length} total`);
      return unclaimedOnly;
    } catch (contractError: any) {
      console.error('[fetchUserUnclaimedRewards] ❌ On-chain verification failed:', contractError.message);
      // Fallback to Supabase flags only
      return allUserClaims.filter(claim => {
        const distData = data?.find(d => d.id === claim.distribution_id);
        return distData?.claims?.[userAddress]?.claimed !== true;
      });
    }
  } catch (error: any) {
    console.error('[fetchUserUnclaimedRewards] Error:', error.message || error);
    return [];
  }
}

/**
 * Fetch all claims (claimed and unclaimed) for a user
 * Parses embedded claims JSONB from distribution records
 */
export async function fetchUserAllClaims(
  address: string
): Promise<MerkleClaim[]> {
  try {
    const { data, error } = await supabase
      .from('merkle_distributions_dev')
      .select('*')
      .order('id', { ascending: false });

    if (error) throw error;

    // Parse claims from each distribution
    const userClaims: MerkleClaim[] = [];
    const userAddress = address.toLowerCase();

    for (const dist of data || []) {
      if (dist.claims) {
        const userClaim = dist.claims[userAddress];
        
        if (userClaim) {
          userClaims.push({
            id: dist.id,
            distribution_id: dist.id,
            index: userClaim.index,
            account: userAddress,
            amount: userClaim.amount,
            proof: userClaim.proof || [],
            claimed: false, // Would need to check on-chain
            created_at: dist.created_at,
          });
        }
      }
    }

    return userClaims;
  } catch (error: any) {
    console.error('Error fetching all claims:', error.message || error);
    return [];
  }
}

/**
 * Fetch distribution info by distribution ID
 */
export async function fetchDistribution(
  distributionId: number
): Promise<Distribution | null> {
  try {
    const { data, error } = await supabase
      .from('merkle_distributions_dev')
      .select('*')
      .eq('id', distributionId)  // Use 'id' instead of 'distribution_id' for dev table
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  } catch (error: any) {
    console.error('Error fetching distribution:', error.message || error);
    return null;
  }
}

/**
 * Fetch all distributions (for history)
 */
export async function fetchAllDistributions(): Promise<Distribution[]> {
  try {
    const { data, error } = await supabase
      .from('merkle_distributions_dev')
      .select('*')
      .order('id', { ascending: false });  // Use 'id' instead of 'distribution_id'

    if (error) throw error;

    return data || [];
  } catch (error: any) {
    console.error('Error fetching distributions:', error.message || error);
    return [];
  }
}

/**
 * Fetch latest/current distribution
 */
export async function fetchCurrentDistribution(): Promise<Distribution | null> {
  try {
    const { data, error } = await supabase
      .from('merkle_distributions_dev')
      .select('*')
      .order('id', { ascending: false })  // Use 'id' instead of 'distribution_id'
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  } catch (error: any) {
    console.error('Error fetching current distribution:', error.message || error);
    return null;
  }
}

/**
 * Fetch distribution statistics
 */
export async function fetchDistributionStats(
  distributionId: number
): Promise<DistributionStats | null> {
  try {
    const { data, error } = await supabase
      .from('distribution_stats')
      .select('*')
      .eq('distribution_id', distributionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  } catch (error: any) {
    console.error('Error fetching distribution stats:', error.message || error);
    return null;
  }
}

/**
 * Mark a claim as claimed in Supabase after successful on-chain claim
 * Updates the claims JSONB field to add a 'claimed' flag
 */
export async function markClaimAsClaimed(
  distributionId: number,
  address: string
): Promise<boolean> {
  try {
    console.log('[markClaimAsClaimed] Marking claim:', { distributionId, address });
    
    // Fetch the current distribution
    const { data: dist, error: fetchError } = await supabase
      .from('merkle_distributions_dev')
      .select('claims')
      .eq('id', distributionId)
      .single();

    if (fetchError) throw fetchError;
    if (!dist || !dist.claims) {
      console.warn('[markClaimAsClaimed] No distribution or claims found');
      return false;
    }

    const userAddress = address.toLowerCase();
    const claims = dist.claims;

    // Update the specific user's claim to mark as claimed
    if (claims[userAddress]) {
      claims[userAddress].claimed = true;
      claims[userAddress].claimed_at = new Date().toISOString();

      // Update the distribution with modified claims
      const { error: updateError } = await supabase
        .from('merkle_distributions_dev')
        .update({ claims })
        .eq('id', distributionId);

      if (updateError) throw updateError;

      console.log('[markClaimAsClaimed] Successfully marked as claimed');
      return true;
    } else {
      console.warn('[markClaimAsClaimed] User claim not found in distribution');
      return false;
    }
  } catch (error: any) {
    console.error('[markClaimAsClaimed] Error:', error.message || error);
    return false;
  }
}

/**
 * Check if user has any unclaimed rewards (quick check)
 * Checks if user has claims in any distribution's JSONB field
 */
export async function hasUnclaimedRewards(address: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('merkle_distributions_dev')
      .select('claims')
      .limit(10); // Check recent distributions

    if (error) throw error;

    const userAddress = address.toLowerCase();
    
    // Check if user has any claims in any distribution
    for (const dist of data || []) {
      if (dist.claims && dist.claims[userAddress]) {
        return true;
      }
    }

    return false;
  } catch (error: any) {
    console.error('Error checking unclaimed rewards:', error.message || error);
    return false;
  }
}

/**
 * Fetch total rewards earned by user (sum of all claimed amounts)
 * Parses claims from distribution JSONB
 */
export async function fetchTotalRewardsEarned(address: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('merkle_distributions_dev')
      .select('claims')
      .order('id', { ascending: false });

    if (error) throw error;

    const userAddress = address.toLowerCase();
    let total = BigInt(0);

    // Sum all user claims across distributions
    for (const dist of data || []) {
      if (dist.claims) {
        const userClaim = dist.claims[userAddress];
        
        if (userClaim && userClaim.amount) {
          total += BigInt(userClaim.amount);
        }
      }
    }

    return total.toString();
  } catch (error: any) {
    console.error('Error fetching total rewards:', error.message || error);
    return '0';
  }
}

/**
 * Subscribe to real-time updates for new distributions
 */
export function subscribeToDistributions(
  callback: (distribution: Distribution) => void
) {
  const subscription = supabase
    .channel('distributions_channel')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'merkle_distributions_dev',  // Use dev table name
      },
      (payload: any) => {
        callback(payload.new as Distribution);
      }
    )
    .subscribe();

  return subscription;
}

/**
 * Subscribe to real-time claim updates for a specific user
 */
export function subscribeToUserClaims(
  address: string,
  callback: (claim: MerkleClaim) => void
) {
  const subscription = supabase
    .channel(`user_claims_${address}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'merkle_distributions_dev',  // Use dev table name
        filter: `account=eq.${address.toLowerCase()}`,
      },
      (payload: any) => {
        callback(payload.new as MerkleClaim);
      }
    )
    .subscribe();

  return subscription;
}
