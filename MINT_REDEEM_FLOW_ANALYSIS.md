# 🔍 Complete Mint & Redeem Flow Analysis

## ✅ CRITICAL BUG FIXED: BTC1 Decimal Precision

**Issue Found:** Code was using `parseEther()` (18 decimals) for BTC1 token  
**Correct Value:** BTC1 uses **8 decimals** (like Bitcoin)  
**Files Fixed:**
- `lib/contract-utils.ts` - All BTC1 parsing now uses `parseUnits(amount, 8)`

---

## 📊 MINT FLOW (Buy BTC1)

### Step 1: Balance Check
**Function:** User-initiated (not on-chain)
```typescript
// hooks/use-wallet-simple.ts or similar
collateralContract.balanceOf(userAddress)
```
**Purpose:** Verify user has sufficient collateral before attempting approval

### Step 2: Check Collateral Approval
**Contract:** Collateral Token (WBTC/cbBTC/tBTC)  
**Function:** `allowance(address owner, address spender)`
```solidity
function allowance(address owner, address spender) view returns (uint256)
```
**Parameters:**
- `owner`: User wallet address
- `spender`: VAULT contract address (`0x5b69Eb051F38D2a2f13F2167738BF0612d7f394A`)

**Returns:** Current allowance amount  
**Call Location:** `lib/contract-utils.ts:39` - `checkCollateralApproval()`

---

### Step 3: Approve Collateral (if needed)
**Contract:** Collateral Token (WBTC/cbBTC/tBTC)  
**Function:** `approve(address spender, uint256 amount)`
```solidity
function approve(address spender, uint256 amount) returns (bool)
```
**Parameters:**
- `spender`: VAULT contract (`0x5b69Eb051F38D2a2f13F2167738BF0612d7f394A`)
- `amount`: Collateral amount in 8 decimals (e.g., `1.5 BTC` = `150000000`)

**Gas Cost:** ~50,000 gas  
**Call Location:** `lib/contract-utils.ts:84` - `approveCollateral()`

**Transaction Flow:**
```
User → Collateral Token.approve(VAULT, amount) → Emit Approval event
```

---

### Step 4: Mint BTC1 Tokens
**Contract:** VAULT (`0x5b69Eb051F38D2a2f13F2167738BF0612d7f394A`)  
**Function:** `mint(address collateralToken, uint256 btcAmount)`
```solidity
function mint(address collateralToken, uint256 btcAmount)
```
**Parameters:**
- `collateralToken`: Address of collateral (WBTC/cbBTC/tBTC)
- `btcAmount`: Amount in 8 decimals

**Internal Contract Calls (Vault.sol):**
1. `oracle.getPrice(collateral)` - Get BTC price from Chainlink
2. `oracle.isStale()` - Verify price is fresh
3. `btc1usd.totalSupply()` - Get current supply
4. Calculate mint price: `max(currentCR, MIN_COLLATERAL_RATIO)`
5. Calculate tokens to mint: `usdValue / mintPrice`
6. Calculate fees (1% dev + 1% endowment)
7. `collateral.transferFrom(user, vault, amount)` - Pull collateral
8. `btc1usd.mint(user, tokensToMint)` - Mint to user
9. `btc1usd.mint(devWallet, devFee)` - Mint dev fee
10. `btc1usd.mint(endowmentWallet, endowmentFee)` - Mint endowment fee

**Events Emitted:**
```solidity
Mint(address indexed user, address collateral, uint256 amountIn, uint256 btc1Out)
```

**Call Location:** `lib/contract-utils.ts:130` - `mintBTC1()`

**Example:**
```
Input: 0.1 WBTC ($9,850 at $98,500/BTC)
Mint Price: 1.25 (125% CR)
Tokens to User: 9,850 / 1.25 = 7,880 BTC1
Dev Fee (1%): 78.8 BTC1
Endowment Fee (1%): 78.8 BTC1
Total Minted: 8,037.6 BTC1
```

---

## 📊 REDEEM FLOW (Sell BTC1)

### Step 1: Balance Check
**Function:** User-initiated
```typescript
btc1Contract.balanceOf(userAddress)
```
**Purpose:** Verify user has sufficient BTC1 before approval

---

### Step 2: Check BTC1 Approval
**Contract:** BTC1USD (`0x43Cd5E8A5bdaEa790a23C4a5DcCc0c11E70C9daB`)  
**Function:** `allowance(address owner, address spender)`
```solidity
function allowance(address owner, address spender) view returns (uint256)
```
**Parameters:**
- `owner`: User wallet address
- `spender`: VAULT contract

**Returns:** Current BTC1 allowance (8 decimals)  
**Call Location:** `lib/contract-utils.ts:166` - `checkBTC1Approval()`

**✅ FIXED:** Now uses `parseUnits(amount, 8)` instead of `parseEther()`

---

### Step 3: Approve BTC1 (if needed)
**Contract:** BTC1USD  
**Function:** `approve(address spender, uint256 amount)`
```solidity
function approve(address spender, uint256 amount) returns (bool)
```
**Parameters:**
- `spender`: VAULT contract
- `amount`: BTC1 amount in 8 decimals

**Call Location:** `lib/contract-utils.ts:209` - `approveBTC1()`

**✅ FIXED:** Now uses `parseUnits(amount, 8)` instead of `parseEther()`

---

### Step 4: Redeem BTC1 for Collateral
**Contract:** VAULT  
**Function:** `redeem(uint256 tokenAmount, address collateralToken)`
```solidity
function redeem(uint256 tokenAmount, address collateralToken)
```
**Parameters:**
- `tokenAmount`: BTC1 amount to redeem (8 decimals)
- `collateralToken`: Desired collateral token address

**Internal Contract Calls (Vault.sol _redeem):**
1. `oracle.getPrice(collateral)` - Get BTC price
2. `oracle.isStale()` - Verify price freshness
3. `btc1usd.totalSupply()` - Get current supply
4. Calculate redemption value:
   - If CR ≥ 110%: `usdValue = btc1Amount` (1:1 stable)
   - If CR < 110%: `usdValue = btc1Amount × (CR × 0.90)` (stress)
5. Calculate collateral: `usdValue / btcPrice`
6. Calculate dev fee: `collateralOut × 0.001` (0.1%)
7. `btc1usd.burnFrom(user, tokenAmount)` - Burn BTC1
8. `collateral.transfer(devWallet, devFee)` - Send dev fee
9. `collateral.transfer(user, sendAmount)` - Send collateral to user

**Events Emitted:**
```solidity
Redeem(address indexed user, address collateral, uint256 btc1In, uint256 collateralOut)
```

**Call Location:** `lib/contract-utils.ts:255` - `redeemBTC1()`

**✅ FIXED:** Now uses `parseUnits(amount, 8)` instead of `parseEther()`

**Example (Stable):**
```
Input: 7,880 BTC1
CR: 125% (≥ 110%)
USD Value: 7,880 (1:1)
BTC Price: $98,500
Collateral Out: 7,880 / 98,500 = 0.08 BTC
Dev Fee (0.1%): 0.00008 BTC
User Receives: 0.07992 BTC
```

**Example (Stress):**
```
Input: 7,880 BTC1
CR: 105% (< 110%)
Stress Price: 105% × 0.90 = 0.945
USD Value: 7,880 × 0.945 = 7,446.6
BTC Price: $98,500
Collateral Out: 7,446.6 / 98,500 = 0.0756 BTC
Dev Fee (0.1%): 0.0000756 BTC
User Receives: 0.0755244 BTC
```

---

## 🔗 Contract Function Dependencies

### Vault Contract Functions Used:
```typescript
✅ mint(address collateralToken, uint256 btcAmount)
✅ redeem(uint256 tokenAmount, address collateralToken)
✅ getCurrentCollateralRatio() view returns (uint256)
✅ getTotalCollateralValue() view returns (uint256)
✅ getTotalCollateralAmount() view returns (uint256)
✅ isHealthy() view returns (bool)
✅ getSupportedCollateral() view returns (address[])
```

### BTC1USD Contract Functions Used:
```typescript
✅ totalSupply() view returns (uint256)
✅ balanceOf(address account) view returns (uint256)
✅ approve(address spender, uint256 amount) returns (bool)
✅ allowance(address owner, address spender) view returns (uint256)
✅ decimals() view returns (uint8) // Returns 8
```

### Collateral Token Functions Used:
```typescript
✅ balanceOf(address account) view returns (uint256)
✅ approve(address spender, uint256 amount) returns (bool)
✅ allowance(address owner, address spender) view returns (uint256)
✅ decimals() view returns (uint8) // Returns 8 for WBTC/cbBTC/tBTC
```

### Chainlink Oracle Functions Used:
```typescript
✅ getBTCPrice() view returns (uint256) // 8 decimals
✅ isStale() view returns (bool)
✅ getPrice(address token) view returns (uint256)
// Fallback to direct Chainlink feed:
✅ latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)
✅ decimals() view returns (uint8)
```

---

## 🎯 Contract Interaction Summary

### MINT Transaction Sequence:
```
1. User → Collateral.balanceOf() [READ]
2. User → Collateral.allowance(user, VAULT) [READ]
3. User → Collateral.approve(VAULT, amount) [WRITE] ⛽
4. User → Vault.mint(collateral, amount) [WRITE] ⛽
   └─ Vault → Oracle.getPrice() [READ]
   └─ Vault → Oracle.isStale() [READ]
   └─ Vault → BTC1.totalSupply() [READ]
   └─ Vault → Collateral.transferFrom(user, vault, amount) [INTERNAL]
   └─ Vault → BTC1.mint(user, tokens) [INTERNAL]
   └─ Vault → BTC1.mint(devWallet, devFee) [INTERNAL]
   └─ Vault → BTC1.mint(endowmentWallet, endowmentFee) [INTERNAL]
```

### REDEEM Transaction Sequence:
```
1. User → BTC1.balanceOf(user) [READ]
2. User → BTC1.allowance(user, VAULT) [READ]
3. User → BTC1.approve(VAULT, amount) [WRITE] ⛽
4. User → Vault.redeem(amount, collateral) [WRITE] ⛽
   └─ Vault → Oracle.getPrice() [READ]
   └─ Vault → Oracle.isStale() [READ]
   └─ Vault → BTC1.totalSupply() [READ]
   └─ Vault → BTC1.burnFrom(user, amount) [INTERNAL]
   └─ Vault → Collateral.transfer(devWallet, fee) [INTERNAL]
   └─ Vault → Collateral.transfer(user, sendAmount) [INTERNAL]
```

---

## 🐛 Bugs Fixed

### 1. BTC1 Decimal Precision (CRITICAL)
**Location:** `lib/contract-utils.ts`
**Issue:** Used `parseEther()` (18 decimals) for BTC1 token
**Fix:** Changed to `parseUnits(amount, 8)` for all BTC1 operations
**Impact:** Would have caused 10^10 multiplier error in all BTC1 transactions

**Files Updated:**
- Line 171: `checkBTC1Approval()` - Approval checking
- Line 202: `approveBTC1()` - Approval transaction
- Line 248: `redeemBTC1()` - Redemption transaction
- Line 306: `claimRewards()` - Rewards claiming

### 2. Contract Addresses Updated
**Location:** `lib/shared/contracts.ts`
**Issue:** Using old deployment addresses
**Fix:** Synced with GitHub repo deployment (2026-01-05)
**Impact:** All contracts now point to correct addresses on Base Mainnet

---

## 📝 Notes

1. **All amounts use 8 decimals** (BTC1, WBTC, cbBTC, tBTC)
2. **Fees are minted separately** (not deducted from user amount)
3. **Chainlink fallback** handles stale oracle prices automatically
4. **Gas estimates:**
   - Approval: ~50,000 gas
   - Mint: ~150,000-200,000 gas
   - Redeem: ~100,000-150,000 gas

5. **MIN_COLLATERAL_RATIO:** 120% for minting
6. **MIN_COLLATERAL_RATIO_STABLE:** 110% for stable redemption
7. **STRESS_REDEMPTION_FACTOR:** 90% applied when CR < 110%

---

## ✅ Verification Checklist

- [x] BTC1 uses 8 decimals (verified in contract)
- [x] All collateral tokens use 8 decimals
- [x] Mint logic matches Vault.sol
- [x] Redeem logic matches Vault.sol
- [x] Fee calculations correct (1% + 1% mint, 0.1% redeem)
- [x] Oracle integration with fallback
- [x] Contract addresses synced with GitHub
- [x] All ABIs match GitHub repo
- [x] Approval flows correct
- [x] Balance checks before approvals

**Status:** ✅ Ready for production testing
