export interface ProtocolParameters {
  // Vault parameters
  minCollateralRatio: number // e.g., 1.1 for 110%
  distributionMinRatio: number // e.g., 1.12 for 112%
  stressRedemptionFactor: number // e.g., 0.9 for 90%

  // Mint fees
  devFeeMint: number // e.g., 0.01 for 1%
  endowmentFeeMint: number // e.g., 0.001 for 0.1%

  // Redeem fees
  devFeeRedeem: number // e.g., 0.001 for 0.1%

  // Distribution fees (per token)
  merklFeePerToken: number // e.g., 0.00001
  endowmentFeePerToken: number // e.g., 0.0001
  devFeePerToken: number // e.g., 0.001

  // Reward tiers (sorted by minRatio ascending)
  rewardTiers: Array<{ minRatio: number; reward: number }>
}

export interface ProtocolState {
  btcPrice: number
  totalSupply: number
  collateralBalances: {
    wbtc: number
    cbbtc: number
    tbtc: number
  }
  devWallet: number
  endowmentWallet: number
  contractAddresses: {
    btc1usd: string
    vault: string
    priceOracle: string
    weeklyDistribution: string
    merkleDistributor: string
    endowmentManager: string
    protocolGovernance: string
    wbtc: string
    cbbtc: string
    tbtc: string
  }
}

export interface MintResult {
  tokensToMint: number
  btcRequired: number
  devFee: number
  endowmentFee: number
  mintPrice: number
}

export interface RedeemResult {
  btcToReceive: number
  devFee: number
  effectivePrice: number
  isStressMode: boolean
}

export interface DistributionResult {
  rewardPerToken: number
  totalRewards: number
  merklFee: number
  endowmentFee: number
  developerFee: number
  totalMinted: number
  canDistribute: boolean
  tier: string
}

export class ProtocolMath {
  // Default parameters (fallback values matching current contract deployment)
  private static readonly DEFAULT_PARAMS: ProtocolParameters = {
    minCollateralRatio: 1.2,
    distributionMinRatio: 1.12,
    stressRedemptionFactor: 0.9,
    devFeeMint: 0.01,
    endowmentFeeMint: 0.001,
    devFeeRedeem: 0.001,
    merklFeePerToken: 0.00001,
    endowmentFeePerToken: 0.0001,
    devFeePerToken: 0.001,
    rewardTiers: [
      { minRatio: 1.12, reward: 0.01 },
      { minRatio: 1.22, reward: 0.02 },
      { minRatio: 1.32, reward: 0.03 },
      { minRatio: 1.42, reward: 0.04 },
      { minRatio: 1.52, reward: 0.05 },
      { minRatio: 1.62, reward: 0.06 },
      { minRatio: 1.72, reward: 0.07 },
      { minRatio: 1.82, reward: 0.08 },
      { minRatio: 1.92, reward: 0.09 },
      { minRatio: 2.02, reward: 0.1 },
    ],
  }

  /**
   * Calculate current collateral ratio
   * R = Total Collateral USD Value ÷ Total Token Supply
   */
  static calculateCollateralRatio(state: ProtocolState, realVaultBalances?: { wbtc: number; cbbtc: number; tbtc: number }, realCollateralValue?: number): number {
    // Use real collateral value if provided, otherwise calculate from balances
    if (realCollateralValue !== undefined) {
      // Fix: Return 0 instead of infinity when totalSupply is 0
      if (state.totalSupply === 0) return 0
      
      return realCollateralValue / state.totalSupply
    }
    
    // Use real vault balances if provided, otherwise use mock values
    const totalCollateralBTC = realVaultBalances
      ? realVaultBalances.wbtc + realVaultBalances.cbbtc + realVaultBalances.tbtc
      : state.collateralBalances.wbtc + state.collateralBalances.cbbtc + state.collateralBalances.tbtc

    const totalCollateralUSD = totalCollateralBTC * state.btcPrice

    // Fix: Return 0 instead of infinity when totalSupply is 0
    if (state.totalSupply === 0) return 0

    return totalCollateralUSD / state.totalSupply
  }

  /**
   * Calculate mint price and fees
   * Mint Price = max(MIN_COLLATERAL_RATIO, current_ratio) USD of BTC
   */
  static calculateMint(
    state: ProtocolState,
    usdAmount: number,
    params: ProtocolParameters = this.DEFAULT_PARAMS,
    realCollateralValue?: number
  ): MintResult {
    const currentRatio = this.calculateCollateralRatio(state, undefined, realCollateralValue)
    // Fix: Use minimum collateral ratio when currentRatio is 0 (zero supply)
    const mintPrice = currentRatio > 0 ? Math.max(params.minCollateralRatio, currentRatio) : params.minCollateralRatio

    const tokensToMint = usdAmount / mintPrice
    const btcRequired = usdAmount / state.btcPrice

    // Calculate fees in tokens
    const devFee = tokensToMint * params.devFeeMint
    const endowmentFee = tokensToMint * params.endowmentFeeMint

    return {
      tokensToMint,
      btcRequired,
      devFee,
      endowmentFee,
      mintPrice,
    }
  }

  /**
   * Calculate redemption value
   * Healthy Mode (R ≥ MIN_COLLATERAL_RATIO): 1 BTC1USD → $1 of BTC (minus dev fee)
   * Stress Mode (R < MIN_COLLATERAL_RATIO): 1 BTC1USD → STRESS_REDEMPTION_FACTOR × R USD of BTC (minus fee)
   */
  static calculateRedeem(
    state: ProtocolState,
    tokenAmount: number,
    params: ProtocolParameters = this.DEFAULT_PARAMS,
    realCollateralValue?: number
  ): RedeemResult {
    const currentRatio = this.calculateCollateralRatio(state, undefined, realCollateralValue)
    // Fix: Handle zero ratio case (initial state)
    const isStressMode = currentRatio > 0 ? currentRatio < params.minCollateralRatio : false

    let effectivePrice: number

    if (isStressMode) {
      effectivePrice = params.stressRedemptionFactor * currentRatio
    } else {
      effectivePrice = 1.0 // $1 per token
    }

    const grossBtcValue = (tokenAmount * effectivePrice) / state.btcPrice
    const devFee = grossBtcValue * params.devFeeRedeem
    const btcToReceive = grossBtcValue - devFee

    return {
      btcToReceive,
      devFee,
      effectivePrice,
      isStressMode,
    }
  }

  /**
   * Calculate weekly distribution rewards
   * Based on collateral ratio tiers from contract parameters
   */
  static calculateDistribution(
    state: ProtocolState,
    params: ProtocolParameters = this.DEFAULT_PARAMS,
    realCollateralValue?: number
  ): DistributionResult {
    const currentRatio = this.calculateCollateralRatio(state, undefined, realCollateralValue)
    // Fix: Handle zero ratio case
    const canDistribute = currentRatio > 0 ? currentRatio >= params.distributionMinRatio : false

    if (!canDistribute) {
      return {
        rewardPerToken: 0,
        totalRewards: 0,
        merklFee: 0,
        endowmentFee: 0,
        developerFee: 0,
        totalMinted: 0,
        canDistribute: false,
        tier: "No Reward",
      }
    }

    // Determine reward tier (iterate from highest to lowest)
    let rewardPerToken = 0
    let tier = "No Reward"

    // Sort tiers by minRatio descending to check from highest to lowest
    const sortedTiers = [...params.rewardTiers].sort((a, b) => b.minRatio - a.minRatio)

    for (const tierConfig of sortedTiers) {
      if (currentRatio >= tierConfig.minRatio) {
        rewardPerToken = tierConfig.reward
        const percentage = (tierConfig.minRatio * 100).toFixed(0)
        tier = `Tier (≥${percentage}%)`
        break
      }
    }

    const totalRewards = state.totalSupply * rewardPerToken

    // Calculate protocol fees using contract parameters
    const merklFee = state.totalSupply * params.merklFeePerToken
    const endowmentFee = state.totalSupply * params.endowmentFeePerToken
    const developerFee = state.totalSupply * params.devFeePerToken

    const totalMinted = totalRewards + merklFee + endowmentFee + developerFee

    // Safety check: ensure distribution doesn't breach minimum ratio
    const newTotalSupply = state.totalSupply + totalMinted
    const newRatio = this.calculateCollateralRatio({
      ...state,
      totalSupply: newTotalSupply,
    }, undefined, realCollateralValue)

    if (newRatio < params.minCollateralRatio) {
      // Scale down distribution to maintain minimum ratio
      const maxAllowedSupply =
        ((state.collateralBalances.wbtc + state.collateralBalances.cbbtc + state.collateralBalances.tbtc) *
          state.btcPrice) /
        params.minCollateralRatio

      const maxMintable = maxAllowedSupply - state.totalSupply
      const scaleFactor = maxMintable / totalMinted

      return {
        rewardPerToken: rewardPerToken * scaleFactor,
        totalRewards: totalRewards * scaleFactor,
        merklFee: merklFee * scaleFactor,
        endowmentFee: endowmentFee * scaleFactor,
        developerFee: developerFee * scaleFactor,
        totalMinted: maxMintable,
        canDistribute: true,
        tier: `${tier} (Scaled)`,
      }
    }

    return {
      rewardPerToken,
      totalRewards,
      merklFee,
      endowmentFee,
      developerFee,
      totalMinted,
      canDistribute: true,
      tier,
    }
  }

  /**
   * Calculate system health metrics using contract parameters
   */
  static calculateHealthMetrics(
    state: ProtocolState,
    params: ProtocolParameters = this.DEFAULT_PARAMS,
    realVaultBalances?: { wbtc: number; cbbtc: number; tbtc: number },
    realCollateralValue?: number // USD value with 8 decimals
  ) {
    const currentRatio = this.calculateCollateralRatio(state, realVaultBalances, realCollateralValue)
    // Use real collateral value if provided, otherwise calculate from balances
    let totalCollateralUSD: number;
    let totalCollateralBTC: number;
    if (realCollateralValue !== undefined) {
      totalCollateralUSD = realCollateralValue;
      totalCollateralBTC = state.btcPrice > 0 ? totalCollateralUSD / state.btcPrice : 0;
    } else {
      // Use real vault balances if provided, otherwise use mock values
      totalCollateralBTC = realVaultBalances
        ? realVaultBalances.wbtc + realVaultBalances.cbbtc + realVaultBalances.tbtc
        : state.collateralBalances.wbtc + state.collateralBalances.cbbtc + state.collateralBalances.tbtc
      totalCollateralUSD = totalCollateralBTC * state.btcPrice
    }

    return {
      collateralRatio: currentRatio,
      // Fix: Handle zero ratio case
      isHealthy: currentRatio > 0 ? currentRatio >= params.minCollateralRatio : false,
      // Fix: Handle zero ratio case
      canDistribute: currentRatio > 0 ? currentRatio >= params.distributionMinRatio : false,
      totalCollateralBTC,
      totalCollateralUSD,
      // Fix: Handle zero ratio case
      excessCollateral: currentRatio > 0 ? Math.max(0, totalCollateralUSD - state.totalSupply * params.minCollateralRatio) : 0,
      // Fix: Handle zero ratio case
      bufferToMinimum: currentRatio > 0 ? currentRatio - params.minCollateralRatio : -params.minCollateralRatio,
      // Fix: Handle zero ratio case
      bufferToDistribution: currentRatio > 0 ? currentRatio - params.distributionMinRatio : -params.distributionMinRatio,
    }
  }

  /**
   * Simulate BTC price impact on system using contract parameters
   */
  static simulatePriceImpact(
    state: ProtocolState,
    newBtcPrice: number,
    params: ProtocolParameters = this.DEFAULT_PARAMS,
    realCollateralValue?: number
  ) {
    const newState = { ...state, btcPrice: newBtcPrice }
    const newRatio = this.calculateCollateralRatio(newState, undefined, realCollateralValue)
    const oldRatio = this.calculateCollateralRatio(state, undefined, realCollateralValue)

    return {
      newRatio,
      ratioChange: newRatio - oldRatio,
      priceChange: (newBtcPrice - state.btcPrice) / state.btcPrice,
      // Fix: Handle zero ratio case
      wouldTriggerStress: newRatio > 0 ? newRatio < params.minCollateralRatio : false,
      // Fix: Handle zero ratio case
      wouldStopDistributions: newRatio > 0 ? newRatio < params.distributionMinRatio : false,
    }
  }

  /**
   * Calculate arbitrage opportunities using contract parameters
   */
  static calculateArbitrage(
    state: ProtocolState,
    marketPrice = 1.0,
    params: ProtocolParameters = this.DEFAULT_PARAMS,
    realCollateralValue?: number
  ) {
    const mintResult = this.calculateMint(state, 1000, params, realCollateralValue) // $1000 mint
    const redeemResult = this.calculateRedeem(state, 1000, params, realCollateralValue) // 1000 tokens redeem

    const mintArbitrage = marketPrice - mintResult.mintPrice
    const redeemArbitrage = redeemResult.btcToReceive * state.btcPrice - 1000 * marketPrice

    return {
      mintArbitrage,
      redeemArbitrage,
      shouldMint: mintArbitrage > 0,
      shouldRedeem: redeemArbitrage > 0,
      mintPrice: mintResult.mintPrice,
      redeemPrice: redeemResult.effectivePrice,
    }
  }
}

/**
 * Fetch protocol parameters from deployed smart contracts
 * Returns contract constants converted to JavaScript numbers
 *
 * @param provider - ethers provider (from wagmi/viem or ethers.js)
 * @param contractAddresses - Contract addresses object
 * @returns ProtocolParameters object with all values from contracts
 */
export async function fetchProtocolParameters(
  provider: any, // ethers.Provider or wagmi PublicClient
  contractAddresses?: {
    vault?: string
    weeklyDistribution?: string
  }
): Promise<ProtocolParameters> {
  try {
    // Lazy import ethers to avoid bundling issues
    const { ethers } = await import('ethers')

    // Use default addresses if not provided
    const addresses = {
      vault: contractAddresses?.vault || process.env.NEXT_PUBLIC_VAULT_CONTRACT || "0xF9f46a648F0cd71B627db7b03Cd3d61b00e581ac",
      weeklyDistribution: contractAddresses?.weeklyDistribution || process.env.NEXT_PUBLIC_WEEKLY_DISTRIBUTION_CONTRACT || "0xc9eE2ee2a9a3073531A620e0BBA23198Eb5F4308",
    }

    // Vault contract ABI (public constants)
    const vaultAbi = [
      "function MIN_COLLATERAL_RATIO() view returns (uint256)",
      "function STRESS_REDEMPTION_FACTOR() view returns (uint256)",
      "function DEV_FEE_MINT() view returns (uint256)",
      "function DEV_FEE_REDEEM() view returns (uint256)",
      "function ENDOWMENT_FEE_MINT() view returns (uint256)",
    ]

    // WeeklyDistribution contract ABI (public constants)
    const weeklyDistributionAbi = [
      "function TIER_1_MIN() view returns (uint256)",
      "function TIER_1_REWARD() view returns (uint256)",
      "function TIER_2_MIN() view returns (uint256)",
      "function TIER_2_REWARD() view returns (uint256)",
      "function TIER_3_MIN() view returns (uint256)",
      "function TIER_3_REWARD() view returns (uint256)",
      "function TIER_4_MIN() view returns (uint256)",
      "function TIER_4_REWARD() view returns (uint256)",
      "function TIER_5_MIN() view returns (uint256)",
      "function TIER_5_REWARD() view returns (uint256)",
      "function TIER_6_MIN() view returns (uint256)",
      "function TIER_6_REWARD() view returns (uint256)",
      "function TIER_7_MIN() view returns (uint256)",
      "function TIER_7_REWARD() view returns (uint256)",
      "function TIER_8_MIN() view returns (uint256)",
      "function TIER_8_REWARD() view returns (uint256)",
      "function TIER_9_MIN() view returns (uint256)",
      "function TIER_9_REWARD() view returns (uint256)",
      "function TIER_10_MIN() view returns (uint256)",
      "function TIER_10_REWARD() view returns (uint256)",
      "function MERKL_FEE() view returns (uint256)",
      "function ENDOWMENT_FEE() view returns (uint256)",
      "function DEV_FEE() view returns (uint256)",
    ]

    // Create contract instances
    const vault = new ethers.Contract(addresses.vault, vaultAbi, provider)
    const weeklyDistribution = new ethers.Contract(addresses.weeklyDistribution, weeklyDistributionAbi, provider)

    // Fetch all values in parallel
    const [
      minCollateralRatioRaw,
      stressRedemptionFactorRaw,
      devFeeMintRaw,
      devFeeRedeemRaw,
      endowmentFeeMintRaw,
      tier1MinRaw,
      tier1RewardRaw,
      tier2MinRaw,
      tier2RewardRaw,
      tier3MinRaw,
      tier3RewardRaw,
      tier4MinRaw,
      tier4RewardRaw,
      tier5MinRaw,
      tier5RewardRaw,
      tier6MinRaw,
      tier6RewardRaw,
      tier7MinRaw,
      tier7RewardRaw,
      tier8MinRaw,
      tier8RewardRaw,
      tier9MinRaw,
      tier9RewardRaw,
      tier10MinRaw,
      tier10RewardRaw,
      merklFeeRaw,
      endowmentFeeRaw,
      devFeeRaw,
    ] = await Promise.all([
      vault.MIN_COLLATERAL_RATIO(),
      vault.STRESS_REDEMPTION_FACTOR(),
      vault.DEV_FEE_MINT(),
      vault.DEV_FEE_REDEEM(),
      vault.ENDOWMENT_FEE_MINT(),
      weeklyDistribution.TIER_1_MIN(),
      weeklyDistribution.TIER_1_REWARD(),
      weeklyDistribution.TIER_2_MIN(),
      weeklyDistribution.TIER_2_REWARD(),
      weeklyDistribution.TIER_3_MIN(),
      weeklyDistribution.TIER_3_REWARD(),
      weeklyDistribution.TIER_4_MIN(),
      weeklyDistribution.TIER_4_REWARD(),
      weeklyDistribution.TIER_5_MIN(),
      weeklyDistribution.TIER_5_REWARD(),
      weeklyDistribution.TIER_6_MIN(),
      weeklyDistribution.TIER_6_REWARD(),
      weeklyDistribution.TIER_7_MIN(),
      weeklyDistribution.TIER_7_REWARD(),
      weeklyDistribution.TIER_8_MIN(),
      weeklyDistribution.TIER_8_REWARD(),
      weeklyDistribution.TIER_9_MIN(),
      weeklyDistribution.TIER_9_REWARD(),
      weeklyDistribution.TIER_10_MIN(),
      weeklyDistribution.TIER_10_REWARD(),
      weeklyDistribution.MERKL_FEE(),
      weeklyDistribution.ENDOWMENT_FEE(),
      weeklyDistribution.DEV_FEE(),
    ])

    // Convert from contract format (8 decimals) to JavaScript numbers
    const DECIMALS = 1e8

    return {
      minCollateralRatio: Number(minCollateralRatioRaw) / DECIMALS,
      distributionMinRatio: Number(tier1MinRaw) / DECIMALS, // Tier 1 is the minimum for distribution
      stressRedemptionFactor: Number(stressRedemptionFactorRaw) / DECIMALS,
      devFeeMint: Number(devFeeMintRaw) / DECIMALS,
      endowmentFeeMint: Number(endowmentFeeMintRaw) / DECIMALS,
      devFeeRedeem: Number(devFeeRedeemRaw) / DECIMALS,
      merklFeePerToken: Number(merklFeeRaw) / DECIMALS,
      endowmentFeePerToken: Number(endowmentFeeRaw) / DECIMALS,
      devFeePerToken: Number(devFeeRaw) / DECIMALS,
      rewardTiers: [
        { minRatio: Number(tier1MinRaw) / DECIMALS, reward: Number(tier1RewardRaw) / DECIMALS },
        { minRatio: Number(tier2MinRaw) / DECIMALS, reward: Number(tier2RewardRaw) / DECIMALS },
        { minRatio: Number(tier3MinRaw) / DECIMALS, reward: Number(tier3RewardRaw) / DECIMALS },
        { minRatio: Number(tier4MinRaw) / DECIMALS, reward: Number(tier4RewardRaw) / DECIMALS },
        { minRatio: Number(tier5MinRaw) / DECIMALS, reward: Number(tier5RewardRaw) / DECIMALS },
        { minRatio: Number(tier6MinRaw) / DECIMALS, reward: Number(tier6RewardRaw) / DECIMALS },
        { minRatio: Number(tier7MinRaw) / DECIMALS, reward: Number(tier7RewardRaw) / DECIMALS },
        { minRatio: Number(tier8MinRaw) / DECIMALS, reward: Number(tier8RewardRaw) / DECIMALS },
        { minRatio: Number(tier9MinRaw) / DECIMALS, reward: Number(tier9RewardRaw) / DECIMALS },
        { minRatio: Number(tier10MinRaw) / DECIMALS, reward: Number(tier10RewardRaw) / DECIMALS },
      ],
    }
  } catch (error) {
    console.warn('Failed to fetch protocol parameters from contracts, using defaults:', error instanceof Error ? error.message : 'Unknown error')
    return ProtocolMath["DEFAULT_PARAMS"]
  }
}

// Utility functions for formatting
export const formatCurrency = (amount: number, decimals = 2): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)
}

export const formatBTC = (amount: number, decimals = 8): string => {
  return `${amount.toFixed(decimals)} BTC`
}

export const formatPercentage = (ratio: number, decimals = 2): string => {
  // Handle edge cases for zero supply or invalid ratios
  if (!isFinite(ratio) || isNaN(ratio) || ratio <= 0) {
    return "N/A"
  }
  return `${(ratio * 100).toFixed(decimals)}%`
}

export const formatTokens = (amount: number, decimals = 2): string => {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount)
}
