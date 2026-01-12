/**
 * Distribution Tracker
 *
 * Comprehensive tracking of BatchTransferCompleted events from DevWallet and EndowmentWallet
 *
 * Event Structure (from contracts):
 * event BatchTransferCompleted(
 *   address indexed token,      // Token address (e.g., BTC1USD)
 *   uint256 totalRecipients,    // Number of recipients in this batch
 *   uint256 totalSent,          // Total amount sent (in token decimals, e.g., 8 for BTC1USD)
 *   uint256 totalFailed         // Number of failed transfers
 * )
 */

import { PublicClient, formatUnits, Log, Address } from 'viem';
import { CONTRACT_ADDRESSES } from './contracts';

export interface DistributionEvent {
  // Event data
  token: Address;
  totalRecipients: number;
  totalSent: bigint;
  totalFailed: number;

  // Transaction metadata
  transactionHash: string;
  blockNumber: bigint;
  timestamp: number;

  // Source wallet
  source: 'dev' | 'endowment';

  // Calculated fields
  amountFormatted: number;
  successRate: number;
}

export interface DistributionSummary {
  // Totals
  totalDistributions: number;
  totalAmountDistributed: number;
  totalRecipients: number;
  totalFailed: number;

  // By source
  devDistributions: number;
  devAmount: number;
  endowmentDistributions: number;
  endowmentAmount: number;

  // Latest event
  latestDistribution: DistributionEvent | null;

  // All events
  events: DistributionEvent[];
}

// BatchTransferCompleted event ABI
const BATCH_TRANSFER_EVENT = {
  type: 'event',
  name: 'BatchTransferCompleted',
  inputs: [
    { name: 'token', type: 'address', indexed: true },
    { name: 'totalRecipients', type: 'uint256' },
    { name: 'totalSent', type: 'uint256' },
    { name: 'totalFailed', type: 'uint256' }
  ]
} as const;

/**
 * Fetch all BatchTransferCompleted events from a wallet contract
 * Uses chunked queries to work with Alchemy's free tier limits
 */
async function fetchWalletDistributions(
  publicClient: PublicClient,
  walletAddress: Address,
  source: 'dev' | 'endowment',
  fromBlock: bigint = 0n
): Promise<DistributionEvent[]> {
  console.log(`📡 Fetching ${source} wallet distributions from block ${fromBlock}...`);

  try {
    // Get current block
    const currentBlock = await publicClient.getBlockNumber();

    // Use chunked queries (10,000 blocks at a time) to work with RPC limits
    const CHUNK_SIZE = 10000n;
    let allLogs: any[] = [];
    let startBlock = fromBlock;

    while (startBlock <= currentBlock) {
      const endBlock = startBlock + CHUNK_SIZE > currentBlock
        ? currentBlock
        : startBlock + CHUNK_SIZE;

      try {
        const logs = await publicClient.getLogs({
          address: walletAddress,
          event: BATCH_TRANSFER_EVENT,
          fromBlock: startBlock,
          toBlock: endBlock
        });

        allLogs = allLogs.concat(logs);
        console.log(`  📦 Blocks ${startBlock}-${endBlock}: ${logs.length} events`);
      } catch (error: any) {
        console.warn(`⚠️ Failed to fetch blocks ${startBlock}-${endBlock}:`, error.message);
      }

      startBlock = endBlock + 1n;
    }

    const logs = allLogs;
    console.log(`✅ Found ${logs.length} distribution events from ${source} wallet`);

    // Get block timestamps for each event
    const events: DistributionEvent[] = [];

    for (const log of logs) {
      try {
        // Get block details for timestamp
        const block = await publicClient.getBlock({
          blockNumber: log.blockNumber!
        });

        if (log.args) {
          const totalRecipients = Number(log.args.totalRecipients || 0);
          const totalFailed = Number(log.args.totalFailed || 0);
          const successRate = totalRecipients > 0
            ? ((totalRecipients - totalFailed) / totalRecipients) * 100
            : 100;

          events.push({
            token: log.args.token as Address,
            totalRecipients,
            totalSent: log.args.totalSent as bigint,
            totalFailed,
            transactionHash: log.transactionHash!,
            blockNumber: log.blockNumber!,
            timestamp: Number(block.timestamp),
            source,
            amountFormatted: parseFloat(formatUnits(log.args.totalSent as bigint, 8)),
            successRate
          });
        }
      } catch (error) {
        console.warn(`⚠️ Failed to process log at block ${log.blockNumber}:`, error);
      }
    }

    // Sort by block number (oldest first)
    return events.sort((a, b) => Number(a.blockNumber - b.blockNumber));
  } catch (error: any) {
    console.error(`❌ Failed to fetch ${source} wallet distributions:`, error.message);
    return [];
  }
}

/**
 * Fetch all distributions from both Dev and Endowment wallets
 */
export async function fetchAllDistributions(
  publicClient: PublicClient,
  fromBlock: bigint = 0n
): Promise<DistributionSummary> {
  console.log('🚀 Fetching all distribution events...');

  // Fetch from both wallets in parallel
  const [devEvents, endowmentEvents] = await Promise.all([
    fetchWalletDistributions(
      publicClient,
      CONTRACT_ADDRESSES.DEV_WALLET as Address,
      'dev',
      fromBlock
    ),
    fetchWalletDistributions(
      publicClient,
      CONTRACT_ADDRESSES.ENDOWMENT_WALLET as Address,
      'endowment',
      fromBlock
    )
  ]);

  // Combine all events
  const allEvents = [...devEvents, ...endowmentEvents].sort(
    (a, b) => Number(a.blockNumber - b.blockNumber)
  );

  // Calculate totals
  const devAmount = devEvents.reduce((sum, e) => sum + e.amountFormatted, 0);
  const endowmentAmount = endowmentEvents.reduce((sum, e) => sum + e.amountFormatted, 0);
  const totalRecipients = allEvents.reduce((sum, e) => sum + e.totalRecipients, 0);
  const totalFailed = allEvents.reduce((sum, e) => sum + e.totalFailed, 0);

  const summary: DistributionSummary = {
    totalDistributions: allEvents.length,
    totalAmountDistributed: devAmount + endowmentAmount,
    totalRecipients,
    totalFailed,

    devDistributions: devEvents.length,
    devAmount,
    endowmentDistributions: endowmentEvents.length,
    endowmentAmount,

    latestDistribution: allEvents.length > 0 ? allEvents[allEvents.length - 1] : null,
    events: allEvents
  };

  console.log('📊 Distribution Summary:');
  console.log(`   Total Distributions: ${summary.totalDistributions}`);
  console.log(`   Total Amount: ${summary.totalAmountDistributed.toFixed(8)} BTC1USD`);
  console.log(`   Dev Wallet: ${summary.devDistributions} distributions, ${summary.devAmount.toFixed(8)} BTC1USD`);
  console.log(`   Endowment: ${summary.endowmentDistributions} distributions, ${summary.endowmentAmount.toFixed(8)} BTC1USD`);
  console.log(`   Total Recipients: ${summary.totalRecipients}`);
  console.log(`   Failed Transfers: ${summary.totalFailed}`);

  return summary;
}

/**
 * Get distribution statistics for a specific time period
 */
export async function getDistributionsInPeriod(
  publicClient: PublicClient,
  startTimestamp: number,
  endTimestamp: number
): Promise<DistributionEvent[]> {
  const allDistributions = await fetchAllDistributions(publicClient);

  return allDistributions.events.filter(
    event => event.timestamp >= startTimestamp && event.timestamp <= endTimestamp
  );
}

/**
 * Get distribution by transaction hash
 */
export async function getDistributionByTxHash(
  publicClient: PublicClient,
  txHash: string
): Promise<DistributionEvent | null> {
  const allDistributions = await fetchAllDistributions(publicClient);

  return allDistributions.events.find(
    event => event.transactionHash.toLowerCase() === txHash.toLowerCase()
  ) || null;
}

/**
 * Format distribution event for display
 */
export function formatDistributionEvent(event: DistributionEvent): string {
  const date = new Date(event.timestamp * 1000).toLocaleString();
  const source = event.source === 'dev' ? 'Dev Wallet' : 'Endowment Wallet';

  return `
[${date}] ${source}
  Amount: ${event.amountFormatted.toFixed(8)} BTC1USD
  Recipients: ${event.totalRecipients} (${event.totalFailed} failed)
  Success Rate: ${event.successRate.toFixed(2)}%
  Tx: ${event.transactionHash}
  Block: ${event.blockNumber}
  `.trim();
}

/**
 * Export distributions to CSV format
 */
export function exportDistributionsToCSV(events: DistributionEvent[]): string {
  const headers = [
    'Date',
    'Source',
    'Token',
    'Amount',
    'Recipients',
    'Failed',
    'Success Rate (%)',
    'Transaction Hash',
    'Block Number'
  ].join(',');

  const rows = events.map(event => {
    const date = new Date(event.timestamp * 1000).toISOString();
    return [
      date,
      event.source,
      event.token,
      event.amountFormatted.toFixed(8),
      event.totalRecipients,
      event.totalFailed,
      event.successRate.toFixed(2),
      event.transactionHash,
      event.blockNumber
    ].join(',');
  });

  return [headers, ...rows].join('\n');
}
