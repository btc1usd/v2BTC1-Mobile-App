# BTC1USD Mobile App

A React Native mobile application for the BTC1USD Protocol - a Shariah-compliant, Bitcoin-backed stable asset protocol with built-in profit sharing and charitable giving.

## Overview

This mobile app is a conversion of the [v2BTC1 web application](https://github.com/btc1usd/v2BTC1) into a native mobile experience using React Native and Expo. It provides users with a seamless way to interact with the BTC1USD protocol directly from their mobile devices.

## Features

### Core Functionality
- **Wallet Connection**: Secure wallet connection via WalletConnect
- **Dashboard**: Real-time portfolio overview with balance, stats, and recent activity
- **Minting**: Convert Bitcoin collateral (WBTC, cbBTC, tBTC) to BTC1 tokens
- **Redemption**: Burn BTC1 tokens to retrieve collateral
- **Rewards**: View and claim weekly profit distributions
- **Transaction History**: Complete history of all protocol interactions

### Protocol Features
- 110% Bitcoin collateralization
- Weekly profit distributions
- Built-in charitable giving (endowment)
- Transparent on-chain verification
- Multi-collateral support (WBTC, cbBTC, tBTC)

## Technology Stack

### Frontend
- **React Native**: 0.81.5
- **Expo SDK**: 54
- **TypeScript**: 5.9
- **NativeWind**: 4 (Tailwind CSS for React Native)
- **Expo Router**: 6 (file-based navigation)

### Web3 Integration
- **Wagmi**: 2.18.0 (React hooks for Ethereum)
- **Viem**: 2.38.0 (TypeScript Ethereum library)
- **WalletConnect**: Mobile wallet connection
- **Ethers.js**: 6.15.0 (Ethereum library)

### State Management
- **TanStack Query**: 5.90.12 (data fetching and caching)
- **React Context**: Local state management

### Backend
- **Supabase**: Database and real-time subscriptions
- **Base Network**: Ethereum Layer 2 (Mainnet)

## Project Structure

```
btc1usd-mobile/
├── app/                          # Expo Router screens
│   ├── (tabs)/                   # Tab navigation
│   │   ├── _layout.tsx          # Tab bar configuration
│   │   └── index.tsx            # Home screen (Landing/Dashboard)
│   └── _layout.tsx              # Root layout with providers
├── components/                   # React components
│   ├── landing-screen.tsx       # Onboarding/wallet connection
│   ├── dashboard-screen.tsx     # Main dashboard
│   └── screen-container.tsx     # SafeArea wrapper
├── lib/                         # Utilities and configuration
│   ├── shared/                  # Shared business logic from web app
│   │   ├── contracts.ts         # Contract ABIs and addresses
│   │   ├── protocol-math.ts     # Protocol calculations
│   │   ├── merkle-tree.ts       # Merkle proof generation
│   │   └── distribution-tracker.ts  # Distribution tracking
│   ├── wagmi-config.ts          # Wagmi configuration
│   ├── web3-provider.tsx        # Web3 context provider
│   └── utils.ts                 # Utility functions
├── hooks/                       # Custom React hooks
│   ├── use-wallet.ts            # Wallet connection hook
│   ├── use-colors.ts            # Theme colors hook
│   └── use-color-scheme.ts      # Dark/light mode detection
├── assets/                      # Static assets
│   └── images/                  # App icons and images
├── theme.config.js              # Theme color configuration
├── tailwind.config.js           # Tailwind CSS configuration
├── app.config.ts                # Expo configuration
└── package.json                 # Dependencies

```

## Design Philosophy

The app follows **Apple Human Interface Guidelines (HIG)** to provide a native iOS feel while maintaining full Android compatibility. The design assumes **mobile portrait orientation (9:16)** and **one-handed usage** as the primary interaction pattern.

### Color Scheme
- **Primary**: Teal Blue (#0a7ea4) - CTAs and highlights
- **Bitcoin Orange**: #F7931A - Bitcoin-related elements
- **Gold**: #FFD700 - Premium features and rewards
- **Semantic Colors**: Green (success), Amber (warning), Red (error)

## Getting Started

### Prerequisites
- Node.js 22.x
- pnpm (recommended) or npm
- Expo CLI
- iOS Simulator (Mac) or Android Emulator

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd btc1usd-mobile
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your WalletConnect Project ID:
```
EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

### Running the App

#### Development Mode
```bash
pnpm dev
```

This starts both the Metro bundler and the development server.

#### iOS Simulator
```bash
pnpm ios
```

#### Android Emulator
```bash
pnpm android
```

#### Web (for testing)
```bash
pnpm dev:metro
```

### Testing on Physical Device

1. Install **Expo Go** app on your iOS or Android device
2. Run `pnpm qr` to generate a QR code
3. Scan the QR code with Expo Go (Android) or Camera app (iOS)

## Architecture

### Wallet Connection Flow
1. User opens app → Landing screen
2. Taps "Connect Wallet" → WalletConnect modal
3. Scans QR code with wallet app → Connection established
4. Redirects to Dashboard → Wallet connected

### Shared Business Logic
The app reuses 70-80% of the business logic from the web application:
- Contract ABIs and addresses
- Protocol mathematics and calculations
- Merkle tree operations
- Distribution tracking
- RPC provider management

### UI Components
All UI components are rebuilt using React Native primitives:
- HTML elements → View, Text, Image, ScrollView
- CSS → NativeWind (Tailwind CSS)
- Radix UI → Custom React Native components

## Contract Addresses

### Base Mainnet
- **BTC1USD Token**: [See deployment-base-sepolia.json]
- **Vault**: [See deployment-base-sepolia.json]
- **Weekly Distribution**: [See deployment-base-sepolia.json]
- **Merkle Distributor**: [See deployment-base-sepolia.json]
- **Dev Wallet**: [See deployment-base-sepolia.json]
- **Endowment Wallet**: [See deployment-base-sepolia.json]

Contract addresses are stored in `lib/shared/deployment-base-sepolia.json`.

## Development Guidelines

### Styling with NativeWind
```tsx
<View className="flex-1 items-center justify-center p-4">
  <Text className="text-2xl font-bold text-foreground">
    Hello World
  </Text>
</View>
```

### Using Theme Colors
```tsx
import { useColors } from "@/hooks/use-colors";

const colors = useColors();
// colors.primary, colors.background, colors.foreground, etc.
```

### Wallet Interactions
```tsx
import { useWallet } from "@/hooks/use-wallet";

const { address, isConnected, connectWallet, disconnectWallet } = useWallet();
```

### Screen Layout
Always use `ScreenContainer` for proper SafeArea handling:
```tsx
import { ScreenContainer } from "@/components/screen-container";

<ScreenContainer className="p-4">
  {/* Your content */}
</ScreenContainer>
```

## Migration from Web App

This mobile app was migrated from the [v2BTC1 web application](https://github.com/btc1usd/v2BTC1) following these principles:

1. **DO NOT** wrap the website in a WebView
2. **DO NOT** attempt automatic JSX conversion
3. **Reuse** business logic, APIs, and state management
4. **Rewrite** UI using native primitives
5. **Replace** web-only features with mobile equivalents

### Key Replacements
- `localStorage` → `AsyncStorage` / `SecureStore`
- `MetaMask` → `WalletConnect`
- `<a>` tags → `Linking` API
- `next/router` → `expo-router`
- HTML elements → React Native components
- CSS → NativeWind (Tailwind CSS)

## Testing

### Unit Tests
```bash
pnpm test
```

### Type Checking
```bash
pnpm check
```

### Linting
```bash
pnpm lint
```

## Building for Production

### iOS
```bash
eas build --platform ios
```

### Android
```bash
eas build --platform android
```

### Both Platforms
```bash
eas build --platform all
```

## Deployment

The app can be deployed using **Expo Application Services (EAS)**:

1. Install EAS CLI:
```bash
npm install -g eas-cli
```

2. Configure EAS:
```bash
eas build:configure
```

3. Build and submit:
```bash
eas build --platform all
eas submit --platform all
```

## Environment Variables

Required environment variables:

- `EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID`: WalletConnect project ID
- `EXPO_PUBLIC_BASE_RPC_URL`: Base network RPC URL (optional)
- `EXPO_PUBLIC_BASE_MAINNET_RPC_URL`: Base Mainnet RPC URL (optional)

## Known Limitations

- Command line utilities from the web app (e.g., `manus-*` tools) are NOT available in the mobile runtime
- Some advanced Web3 features may require additional mobile-specific implementations
- Push notifications are configured but not yet implemented
- Biometric authentication is planned for future releases

## Roadmap

### Phase 1 (Complete)
- [x] Wallet connection via WalletConnect
- [x] Landing and Dashboard screens
- [x] Basic UI components
- [x] Theme and branding
- [x] Real blockchain data integration
- [x] Mint screen with transaction flow
- [x] Redeem screen with transaction flow
- [x] Rewards/Distribution screen
- [x] Tab navigation between all screens

### Phase 3 (Planned)
- [ ] Real-time balance updates
- [ ] Transaction status tracking
- [ ] Gas estimation
- [ ] Error handling and retry logic

### Phase 4 (Future)
- [ ] Push notifications for distributions
- [ ] Biometric authentication
- [ ] Multi-language support
- [ ] Advanced analytics dashboard

## Contributing

This is a private project. For questions or issues, please contact the development team.

## License

MIT License - See LICENSE file for details

## Support

For support, please visit:
- **Documentation**: [BTC1USD Docs](https://docs.btc1usd.com)
- **Discord**: [BTC1USD Community](https://discord.gg/btc1usd)
- **Twitter**: [@BTC1USD](https://twitter.com/btc1usd)

## Acknowledgments

- Original web app: [v2BTC1](https://github.com/btc1usd/v2BTC1)
- Built with [Expo](https://expo.dev)
- Powered by [Base](https://base.org)
- Secured by [Bitcoin](https://bitcoin.org)

---

**Made with ❤️ for the Bitcoin and DeFi community**
