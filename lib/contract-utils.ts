import { ethers } from "ethers";
import { CONTRACT_ADDRESSES, ABIS } from "./shared/contracts";

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
 * READ: Uses direct RPC provider
 */
export async function checkCollateralApproval(
  collateralAddress: string,
  userAddress: string,
  amount: string,
  provider: ethers.Provider
): Promise<ApprovalStatus> {
  try {
    const tokenContract = new ethers.Contract(collateralAddress, ABIS.ERC20, provider);
    const allowance = await tokenContract.allowance(userAddress, CONTRACT_ADDRESSES.VAULT);

    const requiredAmount = ethers.parseUnits(amount, 8);
    return {
      isApproved: allowance >= requiredAmount,
      currentAllowance: ethers.formatUnits(allowance, 8),
    };
  } catch (error: any) {
    console.error("Error checking collateral approval:", error);
    return { isApproved: false, currentAllowance: "0" };
  }
}

/**
 * Approve collateral token spending by the Vault
 * WRITE: Uses Thirdweb signer
 */
export async function approveCollateral(
  collateralAddress: string,
  amount: string,
  signer: ethers.Signer
): Promise<TransactionResult> {
  try {
    const btcAmount = ethers.parseUnits(amount, 8);
    const tokenContract = new ethers.Contract(collateralAddress, ABIS.ERC20, signer);

    console.log("Approving collateral...");
    const tx = await tokenContract.approve(CONTRACT_ADDRESSES.VAULT, btcAmount);
    console.log("Approval tx sent:", tx.hash);
    
    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (error: any) {
    console.error("Error approving collateral:", error);
    return handleTransactionError(error);
  }
}

/**
 * Mint BTC1 tokens using Permit2 SignatureTransfer
 * OPTIMIZED: READ/WRITE separation, Thirdweb v5 signing.
 */
export async function mintBTC1WithPermit2(
  collateralAddress: string,
  amount: string,
  signer: ethers.Signer,
  permit2Address: string = "0x000000000022D473030F116dDEE9F6B43aC78BA3"
): Promise<TransactionResult> {
  try {
    const btcAmount = ethers.parseUnits(amount, 8);
    const provider = signer.provider!;
    const wordPos = BigInt(Math.floor(Date.now() / 1000));
    
    const tokenContract = new ethers.Contract(
      collateralAddress,
      ["function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"],
      signer
    );
    
    const permit2Contract = new ethers.Contract(
      permit2Address,
      ["function nonceBitmap(address owner, uint256 wordPos) view returns (uint256)"],
      provider
    );

    console.log("⚡ Fetching network data...");
    const [userAddress, network, currentAllowance, bitmap] = await Promise.all([
      signer.getAddress(),
      provider.getNetwork(),
      tokenContract.allowance(await signer.getAddress(), permit2Address),
      permit2Contract.nonceBitmap(await signer.getAddress(), wordPos)
    ]);

    // Handle Approval (if needed)
    if (currentAllowance < btcAmount) {
      console.log("📝 Requesting Permit2 approval...");
      const approveTx = await tokenContract.approve(permit2Address, ethers.MaxUint256);
      await approveTx.wait();
    }

    // Calculate Nonce
    let bitPos = 0;
    const bitmapBigInt = BigInt(bitmap.toString());
    while (bitPos < 256 && (bitmapBigInt & (BigInt(1) << BigInt(bitPos))) !== BigInt(0)) {
      bitPos++;
    }
    const nonce = (wordPos << BigInt(8)) | BigInt(bitPos);

    // Prepare Signing Data
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
    const domain = { name: "Permit2", chainId: network.chainId, verifyingContract: permit2Address };
    
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

    const value = {
      permitted: { token: collateralAddress, amount: btcAmount },
      spender: CONTRACT_ADDRESSES.VAULT,
      nonce: nonce,
      deadline: deadline,
    };

    const permit = {
      permitted: { token: collateralAddress, amount: btcAmount },
      nonce: nonce,
      deadline: deadline,
    };

    console.log("⚡ Requesting Permit2 signature...");
    const signature = await signer.signTypedData(domain, types, value);

    console.log("🚀 Broadcasting transaction...");
    const vaultContract = new ethers.Contract(CONTRACT_ADDRESSES.VAULT, ABIS.VAULT, signer);
    const tx = await vaultContract.mintWithPermit2(collateralAddress, btcAmount, permit, signature);

    console.log("✅ Transaction sent:", tx.hash);
    const receipt = await tx.wait();

    return { success: true, txHash: receipt.hash };

  } catch (error: any) {
    console.error("Error minting BTC1:", error);
    return handleTransactionError(error);
  }
}

/**
 * Redeem BTC1 tokens for collateral using EIP-2612 Permit
 */
export async function redeemBTC1WithPermit(
  amount: string,
  collateralAddress: string,
  signer: ethers.Signer
): Promise<TransactionResult> {
  try {
    const btc1Amount = ethers.parseUnits(amount, 8);
    const provider = signer.provider!;
    const btc1Contract = new ethers.Contract(CONTRACT_ADDRESSES.BTC1USD, ABIS.BTC1USD, provider);

    console.log("⚡ Fetching account data...");
    const [userAddress, network, nonce] = await Promise.all([
      signer.getAddress(),
      provider.getNetwork(),
      btc1Contract.nonces(await signer.getAddress())
    ]);

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
    const domain = {
      name: "BTC1USD",
      version: "1",
      chainId: network.chainId,
      verifyingContract: CONTRACT_ADDRESSES.BTC1USD,
    };

    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const value = {
      owner: userAddress,
      spender: CONTRACT_ADDRESSES.VAULT,
      value: btc1Amount,
      nonce: nonce,
      deadline: deadline,
    };

    console.log("⚡ Requesting EIP-2612 signature...");
    const signature = await signer.signTypedData(domain, types, value);
    const sig = ethers.Signature.from(signature);

    console.log("🚀 Broadcasting redeem...");
    const vaultContract = new ethers.Contract(CONTRACT_ADDRESSES.VAULT, ABIS.VAULT, signer);
    const tx = await vaultContract.redeemWithPermit(btc1Amount, collateralAddress, deadline, sig.v, sig.r, sig.s);

    console.log("✅ Redeem sent:", tx.hash);
    const receipt = await tx.wait();

    return { success: true, txHash: receipt.hash };

  } catch (error: any) {
    console.error("Error redeeming BTC1:", error);
    return handleTransactionError(error);
  }
}

/**
 * Claim rewards from MerkleDistributor
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
    const amountWei = ethers.parseUnits(amount, 8);
    const distributorContract = new ethers.Contract(
      CONTRACT_ADDRESSES.MERKLE_DISTRIBUTOR,
      ABIS.MERKLE_DISTRIBUTOR,
      signer
    );

    console.log("🎁 Claiming rewards...");
    const tx = await distributorContract.claim(distributionId, index, account, amountWei, proof);
    console.log("Claim tx sent:", tx.hash);
    
    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (error: any) {
    console.error("❌ Claim error:", error);
    return handleTransactionError(error, "Failed to claim rewards");
  }
}

// --- Helper Utilities ---

function handleTransactionError(error: any, defaultMsg: string = "Transaction failed"): TransactionResult {
  let errorMsg = error.reason || error.message || defaultMsg;
  
  if (errorMsg.includes("timed out")) {
    errorMsg = "Request timed out. Please ensure your wallet app is open.";
  } else if (errorMsg.includes("SignatureExpired") || errorMsg.includes("PERMIT_DEADLINE_EXPIRED")) {
    errorMsg = "Signature expired. Please try again.";
  } else if (errorMsg.includes("user rejected") || errorMsg.includes("ACTION_REJECTED")) {
    errorMsg = "Transaction rejected by user";
  } else if (errorMsg.includes("insufficient")) {
    errorMsg = "Insufficient balance or allowance";
  }
  
  return { success: false, error: errorMsg };
}

// Deprecated functions kept for compatibility
export async function mintBTC1(collateralAddress: string, amount: string, signer: ethers.Signer) {
  return mintBTC1WithPermit2(collateralAddress, amount, signer);
}

export async function redeemBTC1(amount: string, collateralAddress: string, signer: ethers.Signer) {
  try {
    const vaultContract = new ethers.Contract(CONTRACT_ADDRESSES.VAULT, ABIS.VAULT, signer);
    const tx = await vaultContract.redeem(ethers.parseUnits(amount, 8), collateralAddress);
    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (e: any) { return handleTransactionError(e); }
}

export async function checkBTC1Approval(userAddress: string, amount: string, provider: ethers.Provider): Promise<ApprovalStatus> {
  try {
    const btc1Contract = new ethers.Contract(CONTRACT_ADDRESSES.BTC1USD, ABIS.BTC1USD, provider);
    const allowance = await btc1Contract.allowance(userAddress, CONTRACT_ADDRESSES.VAULT);
    return { isApproved: allowance >= ethers.parseUnits(amount, 8), currentAllowance: ethers.formatUnits(allowance, 8) };
  } catch (e) { return { isApproved: false, currentAllowance: "0" }; }
}

export async function approveBTC1(amount: string, signer: ethers.Signer): Promise<TransactionResult> {
  try {
    const contract = new ethers.Contract(CONTRACT_ADDRESSES.BTC1USD, ABIS.BTC1USD, signer);
    const tx = await contract.approve(CONTRACT_ADDRESSES.VAULT, ethers.parseUnits(amount, 8));
    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (e: any) { return handleTransactionError(e); }
}

export function formatTxHash(hash: string): string {
  if (!hash || hash.length < 10) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

export function getTxUrl(hash: string, isTestnet: boolean = true): string {
  const baseUrl = isTestnet ? "https://sepolia.basescan.org" : "https://basescan.org";
  return `${baseUrl}/tx/${hash}`;
}
