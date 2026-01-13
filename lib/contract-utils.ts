import { ethers } from "ethers";
import { CONTRACT_ADDRESSES, ABIS } from "./shared/contracts";
import { safeContractCall, safeTransactionCall, openWalletApp, withTimeout, SIGNATURE_TIMEOUT } from "./wallet-keep-alive";

export interface TransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface ApprovalStatus {
  isApproved: boolean;
  currentAllowance: string;
}

/**
 * Check if collateral token is approved for spending by the Vault
 * Uses safe contract call with automatic session retry
 */
export async function checkCollateralApproval(
  collateralAddress: string,
  userAddress: string,
  amount: string,
  provider: ethers.Provider
): Promise<ApprovalStatus> {
  try {
    const tokenContract = new ethers.Contract(
      collateralAddress,
      ABIS.ERC20,
      provider
    );

    const allowance = await safeContractCall(
      async () => tokenContract.allowance(userAddress, CONTRACT_ADDRESSES.VAULT),
      provider,
      "Check collateral allowance"
    );

    const requiredAmount = ethers.parseUnits(amount, 8);
    const isApproved = allowance >= requiredAmount;

    return {
      isApproved,
      currentAllowance: ethers.formatUnits(allowance, 8),
    };
  } catch (error: any) {
    console.error("Error checking collateral approval:", error);
    return {
      isApproved: false,
      currentAllowance: "0",
    };
  }
}

/**
 * Approve collateral token spending by the Vault
 * Uses safe transaction call with wallet wake-up
 */
export async function approveCollateral(
  collateralAddress: string,
  amount: string,
  signer: ethers.Signer
): Promise<TransactionResult> {
  try {
    const tokenContract = new ethers.Contract(
      collateralAddress,
      ABIS.ERC20,
      signer
    );

    const btcAmount = ethers.parseUnits(amount, 8);

    console.log("Approving collateral:", {
      token: collateralAddress,
      spender: CONTRACT_ADDRESSES.VAULT,
      amount: btcAmount.toString(),
    });

    // Use safe transaction call with automatic wallet wake-up
    const receipt = await safeTransactionCall(
      async () => {
        const tx = await tokenContract.approve(CONTRACT_ADDRESSES.VAULT, btcAmount);
        console.log("Approval transaction sent:", tx.hash);
        console.log("Waiting for confirmation...");
        return await tx.wait();
      },
      signer.provider!,
      signer,
      "Collateral approval"
    );

    console.log("Approval confirmed:", receipt.hash);

    return {
      success: true,
      txHash: receipt.hash,
    };
  } catch (error: any) {
    console.error("Error approving collateral:", error);
    return {
      success: false,
      error: error.reason || error.message || "Failed to approve collateral",
    };
  }
}

/**
 * Mint BTC1 tokens using Permit2 SignatureTransfer - following Uniswap Permit2 exact spec
 * Contract: Vault.mintWithPermit2(address collateral, uint256 amount, PermitTransferFrom permit, bytes signature)
 * 
 * IMPORTANT: User must first approve tokens to Permit2 contract!
 * Flow:
 * 1. Check if user has approved tokens to Permit2
 * 2. If not, request approval (one-time per token)
 * 3. Get unique nonce from Permit2 nonceBitmap
 * 4. Sign Permit2 SignatureTransfer message (EIP-712)
 * 5. Call mintWithPermit2
 */
export async function mintBTC1WithPermit2(
  collateralAddress: string,
  amount: string,
  signer: ethers.Signer,
  permit2Address: string = "0x000000000022D473030F116dDEE9F6B43aC78BA3" // Uniswap Permit2 canonical address
): Promise<TransactionResult> {
  try {
    const btcAmount = ethers.parseUnits(amount, 8);
    const userAddress = await signer.getAddress();
    const provider = signer.provider!;

    console.log("Minting BTC1 with Permit2 SignatureTransfer:", {
      collateral: collateralAddress,
      amount: btcAmount.toString(),
      vault: CONTRACT_ADDRESSES.VAULT,
      user: userAddress,
      permit2: permit2Address,
    });

    // Step 1: Check and request approval to Permit2 if needed
    const tokenContract = new ethers.Contract(
      collateralAddress,
      ["function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"],
      signer
    );

    const currentAllowance = await tokenContract.allowance(userAddress, permit2Address);
    console.log("Current Permit2 allowance:", currentAllowance.toString());

    // If allowance is less than amount, request approval
    if (currentAllowance < btcAmount) {
      console.log("📝 Requesting approval to Permit2...");
      console.log("📱 Opening wallet for one-time approval");
      
      // OPTIMIZED: Open wallet before approval (industry standard)
      await openWalletApp('transaction');
      
      // Approve max uint256 for convenience (one-time approval)
      const maxApproval = ethers.MaxUint256;
      
      console.log("⏰ Waiting for approval (60s timeout)...");
      
      // Use optimized timeout (60s - industry standard for approvals)
      const approveTx = await withTimeout(
        () => tokenContract.approve(permit2Address, maxApproval),
        60000, // 60 seconds
        "Permit2 approval"
      );
      
      console.log("✅ Approval tx sent:", approveTx.hash);
      console.log("⏳ Waiting for confirmation...");
      
      await approveTx.wait();
      
      console.log("✅ Approval confirmed! You can now proceed with minting.");
    }

    // Step 2: Generate unique nonce for SignatureTransfer
    // Permit2 SignatureTransfer uses nonceBitmap: nonce = (wordPos << 8) | bitPos
    // We use timestamp-based wordPos to ensure uniqueness
    const permit2Contract = new ethers.Contract(
      permit2Address,
      [
        "function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)",
      ],
      provider
    );

    // Use current timestamp as word position to avoid collisions
    const wordPos = BigInt(Math.floor(Date.now() / 1000));
    const bitmap = await permit2Contract.nonceBitmap(userAddress, wordPos);
    
    // Find first unused bit in the bitmap (0 means unused)
    let bitPos = 0;
    const bitmapBigInt = BigInt(bitmap.toString());
    while (bitPos < 256 && (bitmapBigInt & (BigInt(1) << BigInt(bitPos))) !== BigInt(0)) {
      bitPos++;
    }
    
    // Construct nonce: wordPos in upper 248 bits, bitPos in lower 8 bits
    const nonce = (wordPos << BigInt(8)) | BigInt(bitPos);
    console.log("Permit2 nonce (SignatureTransfer):", nonce.toString(), "wordPos:", wordPos.toString(), "bitPos:", bitPos);

    // Step 3: Create deadline (30 minutes from now)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);

    // Step 4: Build permit struct for contract call (without spender - that's only for signing)
    const permit = {
      permitted: {
        token: collateralAddress,
        amount: btcAmount,
      },
      nonce: nonce,
      deadline: deadline,
    };

    // Step 5: Create EIP-712 typed data for Permit2 SignatureTransfer
    // Domain matches Permit2 contract exactly
    const chainId = (await provider.getNetwork()).chainId;
    const domain = {
      name: "Permit2",
      chainId: chainId,
      verifyingContract: permit2Address,
    };

    // EIP-712 types for PermitTransferFrom - exact Uniswap Permit2 spec
    // TypeHash: "PermitTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)"
    const types = {
      PermitTransferFrom: [
        { name: "permitted", type: "TokenPermissions" },
        { name: "spender", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
      TokenPermissions: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
      ],
    };

    // Value to sign - includes spender (Vault address)
    const value = {
      permitted: {
        token: collateralAddress,
        amount: btcAmount,
      },
      spender: CONTRACT_ADDRESSES.VAULT,
      nonce: nonce,
      deadline: deadline,
    };

    console.log("Signing Permit2 message...", {
      domain,
      types: Object.keys(types),
      value: {
        permitted: { token: value.permitted.token, amount: value.permitted.amount.toString() },
        spender: value.spender,
        nonce: value.nonce.toString(),
        deadline: value.deadline.toString(),
      }
    });

    // Step 6: Sign the permit message using EIP-712
    // OPTIMIZED: Instant signature request with reasonable timeout
    console.log("⚡ Requesting signature...");
    await openWalletApp('signature');
    
    // 45s timeout - reasonable for user to sign
    const signature = await withTimeout(
      () => signer.signTypedData(domain, types, value),
      45000, // 45s
      "Permit2 signature",
      false
    );
    
    console.log("✅ Permit2 signature obtained:", signature.slice(0, 20) + "...");

    // CRITICAL OPTIMIZATION: Keep session hot between signature and transaction
    // Pre-warm the transaction by preparing contract call immediately
    console.log("🔥 Preparing transaction immediately...");
    
    const vaultContract = new ethers.Contract(
      CONTRACT_ADDRESSES.VAULT,
      ABIS.VAULT,
      signer
    );

    // Simultaneously: Open wallet + prepare transaction (parallel execution for speed)
    console.log("📱 Opening wallet for instant transaction...");
    await Promise.all([
      openWalletApp('transaction'),
      // Keep session alive with quick ping
      (async () => {
        try {
          if (signer.provider && 'send' in signer.provider) {
            await (signer.provider as any).send("eth_chainId", []);
          }
        } catch (e) {
          console.warn("Session ping skipped:", e);
        }
      })()
    ]);

    console.log("📱 Sending transaction instantly...");

    // OPTIMIZED: Wallet already active, session warmed, send immediately
    let tx;
    try {
      tx = await vaultContract.mintWithPermit2(
        collateralAddress,
        btcAmount,
        permit,
        signature
      );
      console.log("✅ Transaction sent:", tx.hash);
    } catch (txError: any) {
      // Check for session errors
      if (txError.message?.includes("session topic") || txError.message?.includes("No matching key")) {
        console.error("❌ Session expired during transaction");
        throw new Error("Wallet session expired. Please reconnect your wallet and try again.");
      }
      throw txError;
    }
    
    // Wait for confirmation with timeout
    const receipt = await withTimeout(
      () => tx.wait(),
      90000, // 90s timeout
      "Transaction confirmation"
    ) as ethers.ContractTransactionReceipt;

    console.log("MintWithPermit2 confirmed:", receipt.hash);

    return {
      success: true,
      txHash: receipt.hash,
    };
  } catch (error: any) {
    console.error("Error minting BTC1 with Permit2:", error);
    
    // Parse common errors
    let errorMsg = error.reason || error.message || "Failed to mint BTC1";
    
    // Check for timeout errors
    if (errorMsg.includes("timed out")) {
      errorMsg = "Request timed out. Please ensure your wallet app is open and try again.";
    } else if (errorMsg.includes("0x756688fe") || errorMsg.includes("InvalidSignature")) {
      errorMsg = "Permit2 signature invalid. Please ensure you're on the correct network and try again.";
    } else if (errorMsg.includes("SignatureExpired")) {
      errorMsg = "Permit signature expired. Please try again.";
    } else if (errorMsg.includes("InvalidNonce")) {
      errorMsg = "Nonce already used. Please try again.";
    } else if (errorMsg.includes("user rejected") || errorMsg.includes("ACTION_REJECTED")) {
      errorMsg = "Transaction rejected by user";
    } else if (errorMsg.includes("insufficient")) {
      errorMsg = "Insufficient balance or allowance";
    }
    
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * DEPRECATED: Basic mint function - NOT AVAILABLE in v2BTC1 Vault contract
 * The Vault contract ONLY supports mintWithPermit2()
 * Kept for reference only - DO NOT USE
 */
export async function mintBTC1(
  collateralAddress: string,
  amount: string,
  signer: ethers.Signer
): Promise<TransactionResult> {
  console.warn("⚠️ mintBTC1() is deprecated. Vault contract only supports mintWithPermit2()");
  // Redirect to Permit2 version
  return mintBTC1WithPermit2(collateralAddress, amount, signer);
}

/**
 * Check if BTC1 token is approved for spending by the Vault (for redemption)
 * Uses safe contract call with automatic session retry
 */
export async function checkBTC1Approval(
  userAddress: string,
  amount: string,
  provider: ethers.Provider
): Promise<ApprovalStatus> {
  try {
    const btc1Contract = new ethers.Contract(
      CONTRACT_ADDRESSES.BTC1USD,
      ABIS.BTC1USD,
      provider
    );

    const allowance = await safeContractCall(
      async () => btc1Contract.allowance(userAddress, CONTRACT_ADDRESSES.VAULT),
      provider,
      "Check BTC1 allowance"
    );

    const requiredAmount = ethers.parseUnits(amount, 8);
    const isApproved = allowance >= requiredAmount;

    return {
      isApproved,
      currentAllowance: ethers.formatUnits(allowance, 8),
    };
  } catch (error: any) {
    console.error("Error checking BTC1 approval:", error);
    return {
      isApproved: false,
      currentAllowance: "0",
    };
  }
}

/**
 * Approve BTC1 token spending by the Vault (for redemption)
 * Uses safe transaction call with wallet wake-up
 */
export async function approveBTC1(
  amount: string,
  signer: ethers.Signer
): Promise<TransactionResult> {
  try {
    const btc1Contract = new ethers.Contract(
      CONTRACT_ADDRESSES.BTC1USD,
      ABIS.BTC1USD,
      signer
    );

    const btc1Amount = ethers.parseUnits(amount, 8);

    console.log("Approving BTC1:", {
      token: CONTRACT_ADDRESSES.BTC1USD,
      spender: CONTRACT_ADDRESSES.VAULT,
      amount: btc1Amount.toString(),
    });

    // Use safe transaction call with automatic wallet wake-up
    const receipt = await safeTransactionCall(
      async () => {
        const tx = await btc1Contract.approve(CONTRACT_ADDRESSES.VAULT, btc1Amount);
        console.log("BTC1 approval transaction sent:", tx.hash);
        console.log("Waiting for confirmation...");
        return await tx.wait();
      },
      signer.provider!,
      signer,
      "BTC1 approval"
    );

    console.log("BTC1 approval confirmed:", receipt.hash);

    return {
      success: true,
      txHash: receipt.hash,
    };
  } catch (error: any) {
    console.error("Error approving BTC1:", error);
    return {
      success: false,
      error: error.reason || error.message || "Failed to approve BTC1",
    };
  }
}

/**
 * Redeem BTC1 tokens for collateral using EIP-2612 Permit - following exact GitHub pattern
 * Contract: Vault.redeemWithPermit(uint256 btc1Amount, address collateral, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
 * 
 * IMPORTANT: This uses EIP-2612 permit for gasless BTC1 approval!
 * Flow:
 * 1. Get nonce from BTC1 contract
 * 2. Create EIP-2612 permit signature for BTC1 token
 * 3. Call redeemWithPermit on Vault contract
 */
export async function redeemBTC1WithPermit(
  amount: string,
  collateralAddress: string,
  signer: ethers.Signer
): Promise<TransactionResult> {
  try {
    const btc1Amount = ethers.parseUnits(amount, 8);
    const userAddress = await signer.getAddress();
    const provider = signer.provider!;

    console.log("Redeeming BTC1 with EIP-2612 Permit:", {
      btc1Amount: btc1Amount.toString(),
      collateral: collateralAddress,
      vault: CONTRACT_ADDRESSES.VAULT,
      user: userAddress,
    });

    // Step 1: Get nonce from BTC1 contract
    const btc1Contract = new ethers.Contract(
      CONTRACT_ADDRESSES.BTC1USD,
      ABIS.BTC1USD,
      provider
    );

    const nonce = await btc1Contract.nonces(userAddress);
    console.log("BTC1 nonce:", nonce.toString());

    // Step 2: Create deadline (30 minutes from now)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);

    // Step 3: Get domain separator for BTC1 token (EIP-2612)
    const chainId = (await provider.getNetwork()).chainId;
    const domain = {
      name: "BTC1USD",
      version: "1",
      chainId: chainId,
      verifyingContract: CONTRACT_ADDRESSES.BTC1USD,
    };

    // Step 4: EIP-2612 Permit types
    // TypeHash: "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    // Step 5: Value to sign - permit Vault to spend BTC1
    const value = {
      owner: userAddress,
      spender: CONTRACT_ADDRESSES.VAULT,
      value: btc1Amount,
      nonce: nonce,
      deadline: deadline,
    };

    console.log("Signing EIP-2612 Permit...", {
      domain,
      types: Object.keys(types),
      value: {
        owner: value.owner,
        spender: value.spender,
        value: value.value.toString(),
        nonce: value.nonce.toString(),
        deadline: value.deadline.toString(),
      },
    });

    // Step 6: Sign the permit message using EIP-712
    // OPTIMIZED: Instant signature request with reasonable timeout
    console.log("⚡ Requesting EIP-2612 signature...");
    await openWalletApp('signature');
    
    // 45s timeout - reasonable for user to sign
    const signature = await withTimeout(
      () => signer.signTypedData(domain, types, value),
      45000, // 45s
      "EIP-2612 signature",
      false
    );
    
    console.log("✅ EIP-2612 signature obtained:", signature.slice(0, 20) + "...");

    // CRITICAL OPTIMIZATION: Keep session hot between signature and transaction
    // Pre-warm the transaction by preparing contract call immediately
    console.log("🔥 Preparing transaction immediately...");

    // Step 7: Split signature into v, r, s components
    const sig = ethers.Signature.from(signature);
    console.log("Signature components:", {
      v: sig.v,
      r: sig.r,
      s: sig.s,
    });

    // Step 8: Call redeemWithPermit on Vault contract
    const vaultContract = new ethers.Contract(
      CONTRACT_ADDRESSES.VAULT,
      ABIS.VAULT,
      signer
    );

    // Simultaneously: Open wallet + prepare transaction (parallel execution for speed)
    console.log("📱 Opening wallet for instant transaction...");
    await Promise.all([
      openWalletApp('transaction'),
      // Keep session alive with quick ping
      (async () => {
        try {
          if (signer.provider && 'send' in signer.provider) {
            await (signer.provider as any).send("eth_chainId", []);
          }
        } catch (e) {
          console.warn("Session ping skipped:", e);
        }
      })()
    ]);

    console.log("📱 Sending transaction instantly...");

    // OPTIMIZED: Wallet already active, session warmed, send immediately
    let tx;
    try {
      tx = await vaultContract.redeemWithPermit(
        btc1Amount,
        collateralAddress,
        deadline,
        sig.v,
        sig.r,
        sig.s
      );
      console.log("✅ Transaction sent:", tx.hash);
    } catch (txError: any) {
      // Check for session errors
      if (txError.message?.includes("session topic") || txError.message?.includes("No matching key")) {
        console.error("❌ Session expired during transaction");
        throw new Error("Wallet session expired. Please reconnect your wallet and try again.");
      }
      throw txError;
    }
    
    // Wait for confirmation with timeout
    const receipt = await withTimeout(
      () => tx.wait(),
      90000, // 90s timeout
      "Transaction confirmation"
    ) as ethers.ContractTransactionReceipt;

    console.log("RedeemWithPermit confirmed:", receipt.hash);

    return {
      success: true,
      txHash: receipt.hash,
    };
  } catch (error: any) {
    console.error("Error redeeming BTC1 with Permit:", error);

    // Parse common errors
    let errorMsg = error.reason || error.message || "Failed to redeem BTC1";

    // Check for timeout errors
    if (errorMsg.includes("timed out")) {
      errorMsg = "Request timed out. Please ensure your wallet app is open and try again.";
    } else if (errorMsg.includes("PERMIT_DEADLINE_EXPIRED")) {
      errorMsg = "Permit signature expired. Please try again.";
    } else if (errorMsg.includes("INVALID_SIGNER") || errorMsg.includes("InvalidSignature")) {
      errorMsg = "Invalid permit signature. Please ensure you're on the correct network.";
    } else if (errorMsg.includes("user rejected") || errorMsg.includes("ACTION_REJECTED")) {
      errorMsg = "Transaction rejected by user";
    } else if (errorMsg.includes("insufficient")) {
      errorMsg = "Insufficient BTC1 balance";
    }

    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * DEPRECATED: Basic redeem function - NOT AVAILABLE in v2BTC1 Vault contract
 * The Vault contract ONLY supports redeemWithPermit()
 * Kept for reference only - DO NOT USE
 */
export async function redeemBTC1(
  amount: string,
  collateralAddress: string,
  signer: ethers.Signer
): Promise<TransactionResult> {
  try {
    const vaultContract = new ethers.Contract(
      CONTRACT_ADDRESSES.VAULT,
      ABIS.VAULT,
      signer
    );

    const btc1Amount = ethers.parseUnits(amount, 8);
    const userAddress = await signer.getAddress();

    console.log("Redeeming BTC1:", {
      btc1Amount: btc1Amount.toString(),
      collateral: collateralAddress,
      vault: CONTRACT_ADDRESSES.VAULT,
      user: userAddress,
    });

    // Use safe transaction call with automatic wallet wake-up
    const receipt = await safeTransactionCall(
      async () => {
        const tx = await vaultContract.redeem(btc1Amount, collateralAddress);
        console.log("Redeem transaction sent:", tx.hash);
        console.log("Waiting for confirmation...");
        return await tx.wait();
      },
      signer.provider!,
      signer,
      "Redeem BTC1"
    );

    console.log("Redeem confirmed:", receipt.hash);

    return {
      success: true,
      txHash: receipt.hash,
    };
  } catch (error: any) {
    console.error("Error redeeming BTC1:", error);
    return {
      success: false,
      error: error.reason || error.message || "Failed to redeem BTC1",
    };
  }
}

/**
 * Format transaction hash for display
 */
export function formatTxHash(hash: string): string {
  if (!hash || hash.length < 10) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

/**
 * Get transaction URL for block explorer
 */
export function getTxUrl(hash: string, isTestnet: boolean = true): string {
  const baseUrl = isTestnet
    ? "https://sepolia.basescan.org"
    : "https://basescan.org";
  return `${baseUrl}/tx/${hash}`;
}

/**
 * Claim rewards from MerkleDistributor
 * Contract: MerkleDistributor.claim(uint256 distributionId, uint256 index, address account, uint256 amount, bytes32[] merkleProof)
 * 
 * Based on v2BTC1 web app: https://github.com/btc1usd/v2BTC1
 * 
 * @param distributionId - The distribution round ID
 * @param index - User's index in the merkle tree
 * @param account - User's wallet address
 * @param amount - Reward amount (human-readable, will be converted to 8 decimals)
 * @param proof - Merkle proof array from Supabase
 * @param signer - User's wallet signer
 * @returns Transaction result with success status and tx hash
 */
export async function claimRewards(
  distributionId: number,
  index: number,
  account: string,
  amount: string,
  proof: string[],
  signer: ethers.Signer
): Promise<TransactionResult> {
  try {
    // Convert amount to 8 decimals (BTC1 token decimals)
    const amountWei = ethers.parseUnits(amount, 8);
    
    console.log("🎁 Claiming rewards:", {
      distributionId,
      index,
      account,
      amount: amountWei.toString(),
      proofLength: proof.length,
    });

    // Create contract instance
    const distributorContract = new ethers.Contract(
      CONTRACT_ADDRESSES.MERKLE_DISTRIBUTOR,
      ABIS.MERKLE_DISTRIBUTOR,
      signer
    );

    console.log("📱 Opening wallet for claim...");
    
    // Open wallet before transaction (non-blocking)
    await openWalletApp('transaction');
    
    console.log("⏰ Sending claim transaction...");
    
    // Use safe transaction call with built-in timeout and retry
    const receipt = await safeTransactionCall(
      async () => {
        // Call claim function with exact parameters
        const tx = await distributorContract.claim(
          distributionId,
          index,
          account,
          amountWei,
          proof
        );
        
        console.log("✅ Claim tx sent:", tx.hash);
        console.log("⏳ Waiting for confirmation...");
        
        return await tx.wait();
      },
      signer.provider!,
      signer,
      "Reward claim"
    );

    console.log("✅ Claim confirmed:", receipt.hash);

    return {
      success: true,
      txHash: receipt.hash,
    };
  } catch (error: any) {
    console.error("❌ Claim error:", error);
    
    // Parse common errors
    let errorMessage = "Failed to claim rewards";
    
    if (error.message?.includes("already claimed")) {
      errorMessage = "Reward already claimed";
    } else if (error.message?.includes("Invalid proof")) {
      errorMessage = "Invalid merkle proof";
    } else if (error.message?.includes("user rejected")) {
      errorMessage = "Transaction rejected by user";
    } else if (error.message?.includes("timeout")) {
      errorMessage = "Transaction timeout - please try again";
    } else if (error.reason) {
      errorMessage = error.reason;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return {
      success: false,
      error: errorMessage,
    };
  }
}
