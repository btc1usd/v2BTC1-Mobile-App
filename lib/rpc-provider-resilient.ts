/**
 * Production-Grade Resilient RPC Provider
 * 
 * Industry patterns from:
 * - Uniswap: Multi-RPC fallback with automatic failover
 * - Aave: Circuit breaker pattern for failed RPCs
 * - Curve: Exponential backoff with jitter
 * - 1inch: Request deduplication and caching
 */

import { ethers } from "ethers";

// ─────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────

const RPC_ENDPOINTS = {
  BASE_SEPOLIA: [
    "https://sepolia.base.org",
    "https://base-sepolia.blockpi.network/v1/rpc/public",
    "https://base-sepolia-rpc.publicnode.com",
    "https://base-sepolia.gateway.tenderly.co",
  ],
  BASE_MAINNET: [
    "https://mainnet.base.org",
    "https://base-rpc.publicnode.com",
    "https://base.llamarpc.com",
    "https://base.drpc.org",
    "https://base.meowrpc.com",
  ],
};

const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 500, // ms
  maxDelay: 5000, // ms
  timeout: 10000, // 10s per request
};

const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 3, // failures before opening circuit
  resetTimeout: 30000, // 30s before attempting to close circuit
};

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface RPCStatus {
  url: string;
  failures: number;
  lastFailure: number;
  circuitOpen: boolean;
}

interface CachedRequest {
  promise: Promise<any>;
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────
// CIRCUIT BREAKER & HEALTH TRACKING
// ─────────────────────────────────────────────────────────────

class RPCHealthTracker {
  private status = new Map<string, RPCStatus>();

  constructor(private endpoints: string[]) {
    endpoints.forEach(url => {
      this.status.set(url, {
        url,
        failures: 0,
        lastFailure: 0,
        circuitOpen: false,
      });
    });
  }

  recordSuccess(url: string) {
    const status = this.status.get(url);
    if (status) {
      status.failures = 0;
      status.circuitOpen = false;
    }
  }

  recordFailure(url: string) {
    const status = this.status.get(url);
    if (!status) return;

    status.failures++;
    status.lastFailure = Date.now();

    if (status.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
      status.circuitOpen = true;
      console.warn(`🔴 Circuit OPEN for RPC: ${url}`);
      
      // Auto-reset after timeout
      setTimeout(() => {
        if (status.circuitOpen) {
          status.circuitOpen = false;
          status.failures = 0;
          console.log(`🟢 Circuit CLOSED (auto-reset) for RPC: ${url}`);
        }
      }, CIRCUIT_BREAKER_CONFIG.resetTimeout);
    }
  }

  getHealthyEndpoints(): string[] {
    const now = Date.now();
    return this.endpoints.filter(url => {
      const status = this.status.get(url);
      if (!status) return true;
      
      // Circuit open = unhealthy
      if (status.circuitOpen) return false;
      
      // Recent failures = lower priority
      return true;
    }).sort((a, b) => {
      const statusA = this.status.get(a)!;
      const statusB = this.status.get(b)!;
      return statusA.failures - statusB.failures;
    });
  }

  getStatus() {
    return Array.from(this.status.values());
  }
}

// ─────────────────────────────────────────────────────────────
// REQUEST DEDUPLICATION
// ─────────────────────────────────────────────────────────────

class RequestCache {
  private cache = new Map<string, CachedRequest>();
  private readonly cacheTTL = 1000; // 1s deduplication window

  getCacheKey(method: string, params: any[]): string {
    return `${method}:${JSON.stringify(params)}`;
  }

  get(method: string, params: any[]): Promise<any> | null {
    const key = this.getCacheKey(method, params);
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.promise;
    }
    
    return null;
  }

  set(method: string, params: any[], promise: Promise<any>) {
    const key = this.getCacheKey(method, params);
    this.cache.set(key, { promise, timestamp: Date.now() });
    
    // Auto-cleanup
    setTimeout(() => this.cache.delete(key), this.cacheTTL);
  }
}

// ─────────────────────────────────────────────────────────────
// RESILIENT PROVIDER
// ─────────────────────────────────────────────────────────────

export class ResilientRPCProvider {
  private healthTracker: RPCHealthTracker;
  private requestCache = new RequestCache();
  private providers: ethers.JsonRpcProvider[];
  private currentProviderIndex = 0;

  constructor(private chainId: number) {
    const endpoints = chainId === 84532 
      ? RPC_ENDPOINTS.BASE_SEPOLIA 
      : RPC_ENDPOINTS.BASE_MAINNET; // Default to Base Mainnet for all non-Sepolia chains
    
    this.healthTracker = new RPCHealthTracker(endpoints);
    this.providers = endpoints.map(url => 
      new ethers.JsonRpcProvider(url)
    );

    console.log(`🔌 Initialized ResilientRPC for chain ${chainId} with ${endpoints.length} endpoints`);
  }

  /**
   * Get current healthy provider
   */
  private getProvider(): ethers.JsonRpcProvider {
    const healthyEndpoints = this.healthTracker.getHealthyEndpoints();
    
    if (healthyEndpoints.length === 0) {
      console.warn('⚠️ No healthy RPCs, using first endpoint anyway');
      return this.providers[0];
    }

    // Round-robin through healthy endpoints
    const endpoint = healthyEndpoints[this.currentProviderIndex % healthyEndpoints.length];
    this.currentProviderIndex++;
    
    const index = this.providers.findIndex(p => 
      (p as any)._getConnection?.()?.url === endpoint
    );
    
    return this.providers[index >= 0 ? index : 0];
  }

  /**
   * Execute with exponential backoff and failover
   */
  private async executeWithRetry<T>(
    operation: (provider: ethers.JsonRpcProvider) => Promise<T>,
    attempt = 0
  ): Promise<T> {
    const provider = this.getProvider();
    const url = (provider as any)._getConnection?.()?.url || 'unknown';

    try {
      // Add timeout to prevent hanging requests
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('RPC timeout')), RETRY_CONFIG.timeout)
      );
      
      const result = await Promise.race([
        operation(provider),
        timeoutPromise
      ]) as T;

      this.healthTracker.recordSuccess(url);
      return result;
    } catch (error: any) {
      this.healthTracker.recordFailure(url);
      
      const isRetryable = 
        error.code === 'NETWORK_ERROR' ||
        error.code === 'TIMEOUT' ||
        error.code === 'SERVER_ERROR' ||
        error.message?.includes('timeout') ||
        error.message?.includes('missing revert data') ||
        error.message?.includes('no backend') ||
        error.message?.includes('failed to bootstrap network detection') ||
        error.message?.includes('network not detected');

      if (isRetryable && attempt < RETRY_CONFIG.maxRetries) {
        // Exponential backoff with jitter
        const delay = Math.min(
          RETRY_CONFIG.baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
          RETRY_CONFIG.maxDelay
        );
        
        console.log(`🔄 Retry ${attempt + 1}/${RETRY_CONFIG.maxRetries} after ${delay}ms for ${url}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.executeWithRetry(operation, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Call contract method with deduplication
   */
  async call(contract: ethers.Contract, method: string, params: any[] = []): Promise<any> {
    // Check cache for duplicate requests
    const cached = this.requestCache.get(`${contract.target}.${method}`, params);
    if (cached) {
      return cached;
    }

    const operation = async (provider: ethers.JsonRpcProvider) => {
      const connectedContract = contract.connect(provider);
      return await connectedContract[method](...params);
    };

    const promise = this.executeWithRetry(operation);
    this.requestCache.set(`${contract.target}.${method}`, params, promise);
    
    return promise;
  }

  /**
   * Batch multiple calls efficiently
   */
  async batchCall(calls: Array<{
    contract: ethers.Contract;
    method: string;
    params?: any[];
  }>): Promise<any[]> {
    return Promise.all(
      calls.map(({ contract, method, params = [] }) =>
        this.call(contract, method, params).catch(err => {
          // Suppress common reverts (empty vault, not initialized, etc.)
          const isCommonRevert = 
            err.message.includes('no data present') ||
            err.message.includes('require(false)') ||
            err.message.includes('execution reverted') ||
            err.message.includes('could not decode result data') ||
            err.message.includes('BAD_DATA') ||
            err.message.includes('0x');
          
          if (isCommonRevert) {
            console.warn(`⚠️ Contract call ${method} returned no data (likely empty state or not initialized)`);
            // Return a default value for specific methods that commonly fail
            if (method === 'decimals') {
              // Default to 18 decimals for most tokens if the call fails
              return 18;
            }
            return null;
          } else {
            console.error(`❌ Batch call failed for ${method}:`, err.message);
            return null;
          }
        })
      )
    );
  }

  /**
   * Get provider for direct use (legacy compatibility)
   */
  getDirectProvider(): ethers.JsonRpcProvider {
    return this.getProvider();
  }

  /**
   * Health status for debugging
   */
  getHealthStatus() {
    return this.healthTracker.getStatus();
  }
}

// ─────────────────────────────────────────────────────────────
// SINGLETON INSTANCES
// ─────────────────────────────────────────────────────────────

const instances = new Map<number, ResilientRPCProvider>();

export function getResilientProvider(chainId: number): ResilientRPCProvider {
  if (!instances.has(chainId)) {
    instances.set(chainId, new ResilientRPCProvider(chainId));
  }
  return instances.get(chainId)!;
}
