#!/usr/bin/env node
/**
 * Test Token Balances Script
 * Tests collateral token contracts on Base Sepolia and checks balances
 * 
 * Usage:
 *   node scripts/test-token-balances.mjs <YOUR_WALLET_ADDRESS>
 * 
 * Example:
 *   node scripts/test-token-balances.mjs 0x1234567890123456789012345678901234567890
 */

import { ethers } from 'ethers';

// Configuration
const BASE_SEPOLIA_RPC = 'https://sepolia.base.org';
const BASE_SEPOLIA_CHAIN_ID = 84532;

// Collateral Token Addresses (from contracts.ts)
const TOKENS = [
  {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin (Mock)',
    address: '0x2c8C66119E7C5D71F6E751E95B8Ca8c0987d3a5A',
    decimals: 8,
  },
  {
    symbol: 'cbBTC',
    name: 'Coinbase Wrapped Bitcoin (Mock)',
    address: '0x250Dd63E5f7BDe22359AC7870414dc407e8F17F8',
    decimals: 8,
  },
  {
    symbol: 'tBTC',
    name: 'Threshold Bitcoin (Mock)',
    address: '0x00384dC507697897dF0144ef36da36B54E062e65',
    decimals: 8,
  },
];

// ERC20 ABI (minimal)
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60));
}

async function checkNetwork(provider) {
  logSection('🌐 Network Information');
  
  try {
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);
    
    log(`Network Name: ${network.name}`, 'cyan');
    log(`Chain ID: ${chainId}`, chainId === BASE_SEPOLIA_CHAIN_ID ? 'green' : 'red');
    log(`RPC URL: ${BASE_SEPOLIA_RPC}`, 'cyan');
    
    if (chainId !== BASE_SEPOLIA_CHAIN_ID) {
      log(`⚠️  WARNING: Expected Chain ID ${BASE_SEPOLIA_CHAIN_ID} (Base Sepolia)`, 'yellow');
      return false;
    }
    
    log('✅ Connected to Base Sepolia', 'green');
    return true;
  } catch (error) {
    log(`❌ Network check failed: ${error.message}`, 'red');
    return false;
  }
}

async function checkContractExists(provider, address, name) {
  try {
    const code = await provider.getCode(address);
    const exists = code !== '0x' && code !== '0x0';
    
    if (exists) {
      log(`  ✅ ${name} contract exists`, 'green');
      log(`     Code length: ${code.length} bytes`, 'cyan');
      return true;
    } else {
      log(`  ❌ ${name} contract NOT FOUND (no code at address)`, 'red');
      return false;
    }
  } catch (error) {
    log(`  ❌ ${name} contract check failed: ${error.message}`, 'red');
    return false;
  }
}

async function getTokenInfo(provider, tokenConfig) {
  const contract = new ethers.Contract(tokenConfig.address, ERC20_ABI, provider);
  
  try {
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
      contract.totalSupply(),
    ]);
    
    return {
      success: true,
      name,
      symbol,
      decimals,
      totalSupply: ethers.formatUnits(totalSupply, decimals),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

async function getBalance(provider, tokenConfig, userAddress) {
  const contract = new ethers.Contract(tokenConfig.address, ERC20_ABI, provider);
  
  try {
    const balance = await contract.balanceOf(userAddress);
    const formatted = ethers.formatUnits(balance, tokenConfig.decimals);
    
    return {
      success: true,
      raw: balance.toString(),
      formatted,
      hasBalance: balance > 0n,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

async function testToken(provider, tokenConfig, userAddress) {
  log(`\n📊 Testing ${tokenConfig.symbol} (${tokenConfig.name})`, 'bright');
  log(`   Address: ${tokenConfig.address}`, 'cyan');
  
  // Check if contract exists
  const exists = await checkContractExists(provider, tokenConfig.address, tokenConfig.symbol);
  
  if (!exists) {
    log(`   ⚠️  Skipping further tests (contract not deployed)`, 'yellow');
    return {
      exists: false,
      info: null,
      balance: null,
    };
  }
  
  // Get token info
  log(`\n   🔍 Fetching token information...`, 'cyan');
  const info = await getTokenInfo(provider, tokenConfig);
  
  if (info.success) {
    log(`   ✅ Name: ${info.name}`, 'green');
    log(`   ✅ Symbol: ${info.symbol}`, 'green');
    log(`   ✅ Decimals: ${info.decimals}`, 'green');
    log(`   ✅ Total Supply: ${info.totalSupply} ${info.symbol}`, 'green');
  } else {
    log(`   ❌ Failed to fetch token info: ${info.error}`, 'red');
  }
  
  // Get balance if user address provided
  let balance = null;
  if (userAddress) {
    log(`\n   💰 Checking balance for ${userAddress.slice(0, 10)}...${userAddress.slice(-8)}`, 'cyan');
    balance = await getBalance(provider, tokenConfig, userAddress);
    
    if (balance.success) {
      if (balance.hasBalance) {
        log(`   ✅ Balance: ${balance.formatted} ${tokenConfig.symbol}`, 'green');
        log(`   ✅ Raw Balance: ${balance.raw}`, 'green');
      } else {
        log(`   ⚠️  Balance: 0 ${tokenConfig.symbol}`, 'yellow');
        log(`   💡 You don't hold any ${tokenConfig.symbol} tokens`, 'cyan');
      }
    } else {
      log(`   ❌ Failed to fetch balance: ${balance.error}`, 'red');
    }
  }
  
  return {
    exists,
    info,
    balance,
  };
}

async function main() {
  logSection('🧪 BTC1 Collateral Token Balance Test');
  
  // Get user address from command line
  const userAddress = process.argv[2];
  
  if (!userAddress) {
    log('\n⚠️  No wallet address provided', 'yellow');
    log('Usage: node scripts/test-token-balances.mjs <YOUR_WALLET_ADDRESS>', 'cyan');
    log('Example: node scripts/test-token-balances.mjs 0x1234567890123456789012345678901234567890', 'cyan');
    log('\nContinuing with contract existence checks only...\n', 'yellow');
  } else if (!ethers.isAddress(userAddress)) {
    log(`\n❌ Invalid wallet address: ${userAddress}`, 'red');
    log('Please provide a valid Ethereum address', 'yellow');
    process.exit(1);
  } else {
    log(`\n📍 Wallet Address: ${userAddress}`, 'cyan');
    log(`   View on BaseScan: https://sepolia.basescan.org/address/${userAddress}`, 'blue');
  }
  
  // Initialize provider
  log('\n🔌 Connecting to Base Sepolia...', 'cyan');
  const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
  
  // Check network
  const networkOk = await checkNetwork(provider);
  if (!networkOk) {
    log('\n❌ Network check failed. Exiting...', 'red');
    process.exit(1);
  }
  
  // Test each token
  logSection('🪙 Testing Collateral Tokens');
  
  const results = [];
  for (const token of TOKENS) {
    const result = await testToken(provider, token, userAddress);
    results.push({ token, result });
  }
  
  // Summary
  logSection('📋 Summary');
  
  const deployed = results.filter(r => r.result.exists).length;
  const withBalance = results.filter(r => r.result.balance?.hasBalance).length;
  
  log(`\nTotal Tokens Tested: ${TOKENS.length}`, 'cyan');
  log(`Contracts Deployed: ${deployed}/${TOKENS.length}`, deployed === TOKENS.length ? 'green' : 'yellow');
  
  if (userAddress) {
    log(`Tokens with Balance: ${withBalance}/${deployed}`, withBalance > 0 ? 'green' : 'yellow');
  }
  
  console.log('\n' + '-'.repeat(60));
  
  // Show non-deployed contracts
  const notDeployed = results.filter(r => !r.result.exists);
  if (notDeployed.length > 0) {
    log('\n⚠️  Contracts NOT Deployed:', 'yellow');
    notDeployed.forEach(({ token }) => {
      log(`   • ${token.symbol}: ${token.address}`, 'red');
    });
    log('\n💡 These contracts need to be deployed on Base Sepolia', 'cyan');
  }
  
  // Show tokens with zero balance
  if (userAddress) {
    const zeroBalance = results.filter(r => r.result.exists && r.result.balance?.success && !r.result.balance?.hasBalance);
    if (zeroBalance.length > 0) {
      log('\n💡 Tokens with Zero Balance:', 'cyan');
      zeroBalance.forEach(({ token }) => {
        log(`   • ${token.symbol}: You need to receive/mint some test tokens`, 'yellow');
      });
    }
    
    // Show tokens with balance
    const hasBalance = results.filter(r => r.result.balance?.hasBalance);
    if (hasBalance.length > 0) {
      log('\n✅ Tokens You Hold:', 'green');
      hasBalance.forEach(({ token, result }) => {
        log(`   • ${token.symbol}: ${result.balance.formatted}`, 'green');
      });
    }
  }
  
  // Recommendations
  logSection('💡 Recommendations');
  
  if (notDeployed.length > 0) {
    log('\n1. Deploy missing token contracts:', 'yellow');
    log('   - Create simple ERC20 contracts for testing', 'cyan');
    log('   - Deploy to Base Sepolia at the configured addresses', 'cyan');
    log('   - Or update addresses in lib/shared/contracts.ts', 'cyan');
  }
  
  if (userAddress && deployed > 0) {
    const needTokens = results.filter(r => r.result.exists && r.result.balance?.success && !r.result.balance?.hasBalance);
    if (needTokens.length > 0) {
      log('\n2. Mint test tokens to your wallet:', 'yellow');
      needTokens.forEach(({ token }) => {
        log(`   - ${token.symbol}: Call mint() function if available`, 'cyan');
      });
    }
  }
  
  log('\n3. Verify on BaseScan:', 'yellow');
  TOKENS.forEach(token => {
    log(`   - ${token.symbol}: https://sepolia.basescan.org/address/${token.address}`, 'blue');
  });
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Exit code
  if (notDeployed.length > 0) {
    log('❌ Some contracts are not deployed', 'red');
    process.exit(1);
  } else if (userAddress && withBalance === 0 && deployed > 0) {
    log('⚠️  All contracts deployed but wallet has no balance', 'yellow');
    process.exit(0);
  } else {
    log('✅ All checks passed!', 'green');
    process.exit(0);
  }
}

// Run the script
main().catch(error => {
  console.error('\n💥 Fatal Error:', error);
  process.exit(1);
});
