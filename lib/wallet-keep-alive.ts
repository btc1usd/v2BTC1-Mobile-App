import { ethers } from "ethers";
import { AppState, AppStateStatus, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Centralized Wallet Keep-Alive Utility
 * 
 * Ensures WalletConnect sessions remain active by:
 * 1. Periodically sending keep-alive requests
 * 2. Detecting and recovering from expired sessions
 * 3. Waking wallet before critical operations
 * 
 * Compatible with ethers v6 + WalletConnect on React Native
 */

// Track last successful wallet interaction
let lastWalletActivity = Date.now();
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
let appStateListener: any = null;

// Configuration - Optimized for mobile DeFi apps (Uniswap/Aave standards)
export const KEEP_ALIVE_INTERVAL = 30000; // 30 seconds
export const SESSION_TIMEOUT = 120000; // 2 minutes
export const MAX_RETRY_ATTEMPTS = 1;
export const TRANSACTION_TIMEOUT = 60000; // 60 seconds for transaction approval (faster UX)
export const SIGNATURE_TIMEOUT = 45000; // 45 seconds for signature approval (faster UX)
export const WALLET_OPEN_DELAY = 300; // 300ms delay after opening wallet (industry standard)

/**
 * Execute operation with timeout
 * Prevents indefinite hanging if wallet doesn't respond
 * Optimized timeouts following industry standards (Uniswap: 45s signatures, 60s transactions)
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  operationName: string = "operation",
  showWalletReminder: boolean = true
): Promise<T> {
  // Set up reminder timeout (show after 10s of waiting - industry standard)
  const reminderDelay = 10000;
  let reminderTimeout: ReturnType<typeof setTimeout> | null = null;
  
  if (showWalletReminder && timeoutMs > reminderDelay) {
    reminderTimeout = setTimeout(() => {
      console.log(`⏳ Still waiting for ${operationName}... Please check your wallet app.`);
    }, reminderDelay);
  }

  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`${operationName} timed out after ${timeoutMs / 1000}s. Please ensure your wallet app is open and connected.`)),
          timeoutMs
        )
      ),
    ]);
  } finally {
    if (reminderTimeout) {
      clearTimeout(reminderTimeout);
    }
  }
}

/**
 * Open wallet app via deep link to ensure user can approve transaction
 * Optimized for famous DeFi mobile apps (Uniswap, Aave, Curve patterns)
 * - Instant wallet opening with no unnecessary delays
 * - Proper deep linking with app return detection
 */
export async function openWalletApp(action: 'connect' | 'transaction' | 'signature' = 'transaction'): Promise<void> {
  try {
    // Get the preferred wallet from storage
    const preferredWallet = await AsyncStorage.getItem("wc_preferred_wallet");
    
    if (!preferredWallet) {
      console.log("⚠️ No preferred wallet found, skipping wallet open");
      return;
    }

    // Wallet deep link schemes with WalletConnect fallback
    const walletSchemes: Record<string, { deepLink: string; wcLink?: string }> = {
      metamask: { 
        deepLink: "metamask://wc",
        wcLink: "https://metamask.app.link/wc"
      },
      rainbow: { deepLink: "rainbow://" },
      trust: { deepLink: "trust://" },
      coinbase: { deepLink: "cbwallet://" },
      zerion: { deepLink: "zerion://" },
      omni: { deepLink: "omni://" },
    };

    const walletConfig = walletSchemes[preferredWallet];
    if (walletConfig) {
      console.log(`📱 Opening ${preferredWallet} for ${action}...`);
      
      // Try deep link first (instant)
      try {
        await Linking.openURL(walletConfig.deepLink);
        console.log(`✅ ${preferredWallet} opened via deep link`);
      } catch (deepLinkError: any) {
        console.warn(`⚠️ Deep link failed: ${deepLinkError.message}`);
        
        // Try WalletConnect universal link as fallback
        if (walletConfig.wcLink) {
          try {
            console.log(`🔄 Trying WalletConnect universal link...`);
            await Linking.openURL(walletConfig.wcLink);
            console.log(`✅ ${preferredWallet} opened via universal link`);
          } catch (wcError: any) {
            console.warn(`⚠️ Universal link also failed: ${wcError.message}`);
            // User will need to manually open wallet
          }
        }
      }
      
      // Reduced delay - only 100ms since we're not waiting for response
      // Just enough time for OS to switch apps
      await new Promise(resolve => setTimeout(resolve, 100));
    } else {
      console.log("⚠️ Unknown wallet, cannot open app");
    }
  } catch (error: any) {
    console.warn("⚠️ Failed to open wallet app:", error.message);
    // Don't throw - this is a best-effort operation
  }
}

/**
 * Detect when app returns to foreground after wallet action
 * Used for optimizing transaction flows in famous DeFi apps
 */
export function onAppReturnFromWallet(callback: () => void): () => void {
  const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
    if (nextAppState === "active") {
      console.log("📱 App returned from wallet");
      callback();
    }
  });

  // Return cleanup function
  return () => {
    subscription?.remove();
  };
}

/**
 * Check if session might be expired based on inactivity
 */
export function isSessionLikelyExpired(): boolean {
  const timeSinceLastActivity = Date.now() - lastWalletActivity;
  return timeSinceLastActivity > SESSION_TIMEOUT;
}

/**
 * Update last activity timestamp
 */
export function recordWalletActivity(): void {
  lastWalletActivity = Date.now();
}

/**
 * Check if error indicates expired/timeout session
 */
export function isExpiredSessionError(error: any): boolean {
  if (!error) return false;
  
  const message = error.message?.toLowerCase() || error.shortMessage?.toLowerCase() || "";
  const code = error.code?.toLowerCase() || "";
  
  return (
    message.includes("request expired") ||
    message.includes("timeout") ||
    message.includes("session not found") ||
    message.includes("session closed") ||
    message.includes("session expired") ||
    message.includes("connection closed") ||
    code === "timeout" ||
    code === "request_timeout"
  );
}

/**
 * Send silent keep-alive ping to maintain WalletConnect session
 * Uses eth_accounts which doesn't trigger wallet popup
 */
export async function sendKeepAlivePing(provider: ethers.Provider | null): Promise<boolean> {
  if (!provider) {
    console.log("⏭️ Keep-alive skipped: no provider");
    return false;
  }

  try {
    // Use eth_accounts - doesn't trigger wallet popup
    // Cast to JsonRpcProvider to access send method
    if ('send' in provider && typeof provider.send === 'function') {
      await (provider as ethers.JsonRpcProvider).send("eth_accounts", []);
      recordWalletActivity();
      console.log("✅ Keep-alive ping successful");
      return true;
    } else {
      console.warn("⚠️ Provider doesn't support send method");
      return false;
    }
  } catch (error: any) {
    console.warn("⚠️ Keep-alive ping failed:", error.message);
    return false;
  }
}

/**
 * Ensure wallet session is active before operations
 * Attempts to wake wallet if session seems expired
 */
export async function ensureWalletActive(
  provider: ethers.Provider | null,
  signer?: ethers.Signer | null
): Promise<{ active: boolean; error?: string }> {
  if (!provider) {
    return { active: false, error: "Provider not available" };
  }

  console.log("🔍 Checking wallet session...");

  // If we have recent activity, assume session is active
  if (!isSessionLikelyExpired()) {
    console.log("✅ Session appears active (recent activity)");
    return { active: true };
  }

  console.log("⚠️ Session may be expired, attempting wake-up...");

  try {
    // Try keep-alive ping first
    const pingSuccess = await sendKeepAlivePing(provider);
    if (pingSuccess) {
      return { active: true };
    }

    // If ping failed and we have a signer, try getAddress (more forceful)
    if (signer) {
      console.log("🔓 Attempting wallet wake via signer.getAddress()...");
      await signer.getAddress();
      recordWalletActivity();
      console.log("✅ Wallet woken successfully");
      return { active: true };
    }

    return { active: false, error: "Unable to wake wallet session" };
  } catch (error: any) {
    console.error("❌ Failed to ensure wallet active:", error.message);
    return { active: false, error: error.message };
  }
}

/**
 * Execute a contract call with automatic retry on session expiry
 * 
 * @param operation - The contract call function
 * @param provider - Ethers provider
 * @param signer - Optional signer for write operations
 * @returns Operation result
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  provider: ethers.Provider | null,
  signer?: ethers.Signer | null
): Promise<T> {
  let attempts = 0;

  while (attempts <= MAX_RETRY_ATTEMPTS) {
    try {
      // Ensure session is active before attempt
      if (attempts > 0) {
        console.log(`🔄 Retry attempt ${attempts}/${MAX_RETRY_ATTEMPTS}`);
        const wakeResult = await ensureWalletActive(provider, signer);
        if (!wakeResult.active) {
          throw new Error(wakeResult.error || "Wallet session inactive");
        }
      }

      // Execute the operation
      const result = await operation();
      recordWalletActivity();
      return result;
    } catch (error: any) {
      console.error(`❌ Operation failed (attempt ${attempts + 1}):`, error.message);

      // Check if it's a session expiry error
      if (isExpiredSessionError(error) && attempts < MAX_RETRY_ATTEMPTS) {
        console.log("🔄 Detected expired session, will retry...");
        attempts++;
        continue;
      }

      // Not a session error or max retries reached
      throw error;
    }
  }

  throw new Error("Operation failed after retries");
}

/**
 * Start background keep-alive mechanism
 * Sends periodic pings to maintain WalletConnect session
 */
export function startKeepAlive(provider: ethers.Provider | null): void {
  if (keepAliveInterval) {
    console.log("⚠️ Keep-alive already running");
    return;
  }

  console.log("🚀 Starting wallet keep-alive mechanism");

  // Set up periodic keep-alive pings
  keepAliveInterval = setInterval(() => {
    sendKeepAlivePing(provider);
  }, KEEP_ALIVE_INTERVAL);

  // Listen to app state changes
  appStateListener = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
    if (nextAppState === "active") {
      console.log("📱 App foregrounded, sending keep-alive ping");
      sendKeepAlivePing(provider);
    }
  });

  // Send initial ping
  sendKeepAlivePing(provider);
}

/**
 * Stop keep-alive mechanism
 */
export function stopKeepAlive(): void {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log("🛑 Keep-alive stopped");
  }

  if (appStateListener) {
    appStateListener.remove();
    appStateListener = null;
  }
}

/**
 * Wrapper for read-only contract calls
 * Automatically handles session expiry and retries
 */
export async function safeContractCall<T>(
  contractMethod: () => Promise<T>,
  provider: ethers.Provider | null,
  operationName: string = "contract call"
): Promise<T> {
  console.log(`📞 Safe ${operationName}...`);
  
  return executeWithRetry(
    async () => {
      const result = await contractMethod();
      console.log(`✅ ${operationName} successful`);
      return result;
    },
    provider
  );
}

/**
 * Wrapper for write transactions (requires signer)
 * Optimized for mobile DeFi apps - instant wallet opening and quick return
 * Pattern from Uniswap, Aave, Curve mobile apps
 */
export async function safeTransactionCall<T>(
  transactionMethod: () => Promise<T>,
  provider: ethers.Provider | null,
  signer: ethers.Signer,
  operationName: string = "transaction",
  actionType: 'transaction' | 'signature' = 'transaction'
): Promise<T> {
  console.log(`🔐 Safe ${operationName}...`);

  // OPTIMIZED: Open wallet app instantly (no wake-up first)
  // Industry pattern: Open wallet → Execute → Return to app
  console.log("📱 Opening wallet app for approval...");
  await openWalletApp(actionType);

  // Quick validation that signer is available
  const address = await signer.getAddress();
  console.log(`✅ Wallet ready: ${address.slice(0, 6)}...${address.slice(-4)}`);
  recordWalletActivity();

  return executeWithRetry(
    async () => {
      const result = await transactionMethod();
      console.log(`✅ ${operationName} successful`);
      return result;
    },
    provider,
    signer
  );
}
