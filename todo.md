# BTC1USD Mobile App - TODO

## Phase 1: Project Setup & Design
- [x] Initialize Expo project with React Native
- [x] Create design.md with interface design plan
- [x] Create todo.md for feature tracking

## Phase 2: Shared Business Logic Integration
- [x] Extract and copy shared utilities from web app
- [x] Integrate protocol math functions
- [x] Integrate contract ABIs and addresses
- [ ] Set up RPC provider for Base network
- [ ] Configure Supabase client
- [x] Create hook for BTC1 balance
- [x] Create hook for collateral balances
- [x] Create hook for vault stats
- [x] Create hook for distribution data
- [ ] Create hook for user claims
- [ ] Create hook for transaction history

## Phase 3: Wallet Connection & Web3
- [x] Install and configure WalletConnect
- [x] Install and configure wagmi for React Native
- [x] Create Web3 context provider
- [x] Implement wallet connection flow
- [ ] Add network detection and switching
- [ ] Test wallet connection on iOS and Android

## Phase 4: Core UI Screens
- [x] Build Landing/Onboarding screen
- [x] Build Dashboard/Home screen
- [x] Build Mint screen with input validation
- [x] Build Redeem screen
- [x] Build Rewards/Distribution screen
- [x] Build Activity/History screen (integrated in dashboard)
- [x] Add navigation between screens
- [x] Integrate all screens with tab navigation
- [ ] Build Settings screen
- [ ] Create Transaction Detail modal

## Phase 5: UI Components
- [ ] Create reusable Card component
- [ ] Create Button component (Primary, Secondary, Ghost)
- [ ] Create Input component with validation
- [ ] Create Stats card component
- [ ] Create Transaction list item component
- [ ] Create Loading states and skeletons
- [ ] Create Toast notifications
- [ ] Create Confirmation modals

## Phase 6: Web3 Functionality
- [ ] Implement mint transaction flow
- [ ] Implement redeem transaction flow
- [ ] Implement claim rewards flow
- [ ] Add transaction status tracking
- [ ] Add gas estimation
- [ ] Handle transaction errors
- [ ] Add transaction history fetching

## Phase 7: Data & State Management
- [ ] Set up AsyncStorage for preferences
- [ ] Set up SecureStore for sensitive data
- [ ] Implement theme persistence
- [ ] Create balance fetching hooks
- [ ] Create distribution stats hooks
- [ ] Create transaction history hooks
- [ ] Add pull-to-refresh functionality

## Phase 8: Navigation
- [ ] Configure tab bar navigation
- [ ] Set up stack navigation for screens
- [ ] Add deep linking support
- [ ] Handle wallet connection redirects
- [ ] Add back button handling

## Phase 9: Styling & Theme
- [ ] Update theme.config.js with JioHotstar colors
- [ ] Configure NativeWind with custom colors
- [ ] Implement dark mode support
- [ ] Add Bitcoin brand colors
- [ ] Style all screens according to design.md
- [ ] Add responsive layout adjustments

## Phase 10: Branding & Assets
- [x] Generate custom app logo
- [x] Update app icon
- [x] Update splash screen
- [x] Update app name in app.config.ts
- [x] Add Bitcoin/crypto related icons

## Phase 11: Testing & Polish
- [ ] Test wallet connection flow
- [ ] Test mint/redeem transactions
- [ ] Test rewards claiming
- [ ] Test on iOS device
- [ ] Test on Android device
- [ ] Add haptic feedback
- [ ] Add loading states
- [ ] Add error handling
- [ ] Test offline behavior

## Phase 12: Documentation & Delivery
- [ ] Create user guide
- [ ] Document API integration
- [ ] Document contract addresses
- [ ] Create README for mobile app
- [ ] Save checkpoint
- [ ] Deliver to user

## Known Issues
- None yet

## Future Enhancements
- Push notifications for distributions
- Biometric authentication for transactions
- Multi-language support
- Advanced analytics dashboard
- Social sharing features
- In-app browser for block explorer

## Web3 Refactoring (Completed)
- [x] Remove wagmi, viem, and incompatible dependencies
- [x] Install ethers.js v6 (already installed)
- [x] Refactor Web3Provider to use ethers.js (SimpleWeb3Provider)
- [x] Refactor wallet connection hook (use-wallet-simple)
- [x] Refactor useBtc1Balance hook (use-btc1-balance-simple)
- [x] Refactor useVaultStats hook (use-vault-stats-simple)
- [x] Refactor useDistributionData hook (use-distribution-data-simple)
- [x] Update Mint screen (simplified version)
- [x] Update Redeem screen (simplified version)
- [x] Update Rewards screen (simplified version)
- [ ] Implement actual wallet connection with WalletConnect
- [ ] Implement transaction signing and submission

## Wallet Connection Modal (Completed)
- [x] Install @walletconnect/modal-react-native
- [x] Install @coinbase/wallet-mobile-sdk (via WalletConnect)
- [x] Create WalletConnectionModal component
- [x] Add wallet provider logos (emoji icons)
- [x] Implement WalletConnect connection
- [x] Implement MetaMask deep linking
- [x] Implement Coinbase Wallet connection
- [x] Update Web3Provider to handle connections
- [ ] Test wallet connection flow on physical device

## Contract Address Updates
- [x] Update deployment-base-mainnet.json with actual contract addresses
- [x] Verify contract addresses in hooks
- [ ] Test with real mainnet data

## Theme & Branding Updates (Completed)
- [x] Extract exact theme colors from GitHub repository
- [x] Update theme.config.js with GitHub colors
- [x] Copy logo from GitHub repository
- [x] Update landing page features to match GitHub
- [x] Update app icon and splash screen
- [x] Verify all contract addresses are correct

## Wallet Connection Fix (Completed)
- [x] Update WalletConnect metadata to use app scheme instead of btc1usd.com
- [x] Add crypto.getRandomValues polyfill for React Native
- [x] Configure proper redirect URLs for mobile app (using manus20260109052915://)
- [x] Update MetaMask deep link to connect to app
- [x] Update Coinbase Wallet deep link to connect to app
- [ ] Test wallet connection stays within app
- [ ] Verify wallet state persists after connection

## iOS Wallet Connection Debug (Completed)
- [x] Check dev server logs for specific error messages
- [x] Verify crypto polyfill is loading correctly on iOS
- [x] Fix WalletConnect provider initialization (disabled QR modal)
- [x] Use WalletConnectModal hook for React Native
- [x] Verify deep linking configuration for iOS
- [ ] Test with different wallet apps on physical device
- [ ] Add error handling and user-friendly error messages

## Wallet Return Flow & Full WalletConnect (Completed)
- [x] Configure app.config.ts with proper deep link scheme
- [x] Implement WalletConnect Ethereum Provider properly
- [x] Handle wallet connection session in provider
- [x] Listen for wallet return via Linking API
- [x] Store wallet connection state in AsyncStorage
- [x] Auto-restore previous wallet session on app launch
- [ ] Test MetaMask connection round-trip on physical device
- [ ] Test Coinbase Wallet connection round-trip on physical device
- [ ] Test WalletConnect with other wallets

## Fix Connection Stuck Issue (Completed)
- [x] Fixed hook imports to use correct useWeb3 provider
- [x] Updated all hooks to use web3-provider-walletconnect
- [x] Removed dependency on old web3-simple provider
- [ ] Add timeout to WalletConnect initialization (if needed)
- [ ] Test connection on physical device

## Fix WebSocket Origin Error (Completed)
- [x] Fix WalletConnect metadata origin configuration
- [x] Add proper app URL to WalletConnect initialization (using APP_URL)
- [x] Remove custom relayUrl to use default WalletConnect relay
- [ ] Test WebSocket connection on physical device
