# BTC1USD Mobile App - Design Document

## Design Philosophy

This mobile app follows **Apple Human Interface Guidelines (HIG)** to feel like a native iOS app, with full Android support. The design assumes **mobile portrait orientation (9:16)** and **one-handed usage** as the primary interaction pattern.

## Color Scheme

Based on user preference for **JioHotstar coloring**, the app will use a premium, modern color palette:

### Primary Colors
- **Primary/Accent**: `#0a7ea4` (Teal Blue) - for CTAs, active states, and highlights
- **Background**: 
  - Light: `#ffffff` (White)
  - Dark: `#151718` (Near Black)
- **Surface**: 
  - Light: `#f5f5f5` (Light Gray)
  - Dark: `#1e2022` (Dark Gray)

### Semantic Colors
- **Success**: `#22C55E` (Green) - for profit, positive changes
- **Warning**: `#F59E0B` (Amber) - for alerts, pending states
- **Error**: `#EF4444` (Red) - for losses, errors
- **Muted**: Gray tones for secondary text

### Bitcoin Brand Colors (Accent)
- **Bitcoin Orange**: `#F7931A` - used sparingly for BTC-related elements
- **Gold**: `#FFD700` - for premium features, rewards

## Screen List

### 1. **Onboarding/Landing Screen** (High Priority)
**Purpose**: First-time user introduction and wallet connection

**Content**:
- App logo and branding
- Hero headline: "Bitcoin-Backed Stable Asset"
- Subheadline: "Shariah-compliant digital money with profit sharing & charity"
- Key features (3-4 bullet points):
  - 110% Bitcoin collateralization
  - Weekly profit distributions
  - Built-in charitable giving
  - Transparent on-chain verification
- Primary CTA: "Connect Wallet" button
- Secondary link: "Learn More"

**Functionality**:
- Wallet connection via WalletConnect
- Smooth transition to Dashboard after connection
- Skip button for returning users (if wallet already connected)

### 2. **Dashboard/Home Screen** (High Priority)
**Purpose**: Main app hub showing portfolio overview and quick actions

**Content**:
- **Header**:
  - Wallet address (truncated) with copy button
  - Network indicator (Base Sepolia/Mainnet)
  - Settings icon
- **Portfolio Card**:
  - Total BTC1 balance (large, prominent)
  - USD equivalent value
  - 24h change percentage (color-coded)
- **Stats Grid** (2x2 cards):
  - Total Collateral Ratio
  - Next Distribution Date
  - Your Pending Rewards
  - Total Protocol TVL
- **Quick Actions** (horizontal scroll):
  - Mint BTC1
  - Redeem BTC1
  - Claim Rewards
  - View History
- **Recent Activity** (list):
  - Last 5 transactions with icons, amounts, and timestamps

**Functionality**:
- Pull-to-refresh for latest data
- Tap cards to navigate to detail screens
- Real-time balance updates
- Haptic feedback on interactions

### 3. **Mint Screen** (High Priority)
**Purpose**: Convert Bitcoin collateral to BTC1 tokens

**Content**:
- **Input Section**:
  - Collateral type selector (WBTC, cbBTC, tBTC)
  - Amount input with max button
  - Available balance display
- **Preview Card**:
  - Collateral amount
  - BTC1 to receive
  - Collateralization ratio
  - Estimated gas fee
- **Warnings/Info**:
  - Minimum collateral ratio (110%)
  - Current BTC/USD price
- **CTA**: "Mint BTC1" button (disabled until valid)

**Functionality**:
- Input validation
- Real-time ratio calculation
- Approve + mint transaction flow
- Success/error toast notifications
- Transaction confirmation modal

### 4. **Redeem Screen** (High Priority)
**Purpose**: Burn BTC1 tokens to retrieve collateral

**Content**:
- **Input Section**:
  - BTC1 amount to redeem
  - Available BTC1 balance
- **Preview Card**:
  - BTC1 to burn
  - Collateral to receive
  - Redemption fee (if any)
  - Estimated gas fee
- **Collateral Selection**:
  - Choose which collateral type to receive
- **CTA**: "Redeem BTC1" button

**Functionality**:
- Input validation
- Real-time collateral calculation
- Burn + redeem transaction flow
- Success confirmation with amount received

### 5. **Rewards/Distribution Screen** (Medium Priority)
**Purpose**: View and claim weekly profit distributions

**Content**:
- **Claimable Rewards Card**:
  - Pending BTC1 rewards (large)
  - USD equivalent
  - "Claim Now" button
- **Distribution History**:
  - List of past distributions
  - Date, amount, status (claimed/unclaimed)
  - Merkle proof verification indicator
- **Next Distribution**:
  - Countdown timer
  - Estimated reward amount
- **Stats**:
  - Total rewards earned
  - Charity contribution (percentage)

**Functionality**:
- Claim rewards via Merkle distributor
- View transaction history
- Filter by claimed/unclaimed
- Share rewards on social (optional)

### 6. **Activity/History Screen** (Medium Priority)
**Purpose**: Complete transaction history and analytics

**Content**:
- **Filter Tabs**:
  - All
  - Mints
  - Redeems
  - Claims
  - Transfers
- **Transaction List**:
  - Transaction type icon
  - Amount and direction
  - Timestamp
  - Status badge
  - Transaction hash (truncated)
- **Search Bar**: Filter by amount or date

**Functionality**:
- Infinite scroll pagination
- Tap to view transaction details
- Copy transaction hash
- View on block explorer (external link)

### 7. **Settings Screen** (Medium Priority)
**Purpose**: App configuration and account management

**Content**:
- **Account Section**:
  - Wallet address (full, with copy)
  - Disconnect wallet button
- **Preferences**:
  - Theme toggle (Light/Dark/Auto)
  - Currency display (USD, EUR, etc.)
  - Notifications toggle
- **Information**:
  - About BTC1USD Protocol
  - Terms of Service
  - Privacy Policy
  - Contract Addresses
- **Support**:
  - Help Center link
  - Report Issue
- **App Version**: Footer

**Functionality**:
- Theme switching with persistence
- Wallet disconnection
- External links open in browser
- Copy contract addresses

### 8. **Transaction Detail Modal** (Low Priority)
**Purpose**: Full details of a specific transaction

**Content**:
- Transaction type header
- Amount (large)
- Status badge
- Timestamp
- Transaction hash (full, with copy)
- Gas fee
- Block number
- "View on Explorer" link

**Functionality**:
- Modal overlay (dismissible)
- Copy transaction hash
- Open block explorer

## Key User Flows

### Flow 1: First-Time User Onboarding
1. User opens app → **Landing Screen**
2. Taps "Connect Wallet" → **WalletConnect modal**
3. Scans QR code with wallet app → Connection established
4. Automatic redirect to **Dashboard** → Welcome toast

### Flow 2: Mint BTC1 Tokens
1. User on **Dashboard** → Taps "Mint BTC1" quick action
2. Navigate to **Mint Screen**
3. Select collateral type (e.g., WBTC)
4. Enter amount or tap "Max"
5. Review preview card (ratio, fees)
6. Tap "Mint BTC1" → Approve transaction (if needed)
7. Confirm mint transaction → Loading state
8. Success toast → Return to **Dashboard** with updated balance

### Flow 3: Claim Weekly Rewards
1. User on **Dashboard** → Sees "Pending Rewards" card
2. Taps card → Navigate to **Rewards Screen**
3. Reviews claimable amount
4. Taps "Claim Now" → Transaction confirmation
5. Success → Rewards added to balance
6. History updated with new claim entry

### Flow 4: View Transaction History
1. User on **Dashboard** → Taps "View History" or swipes up
2. Navigate to **Activity Screen**
3. Scrolls through transaction list
4. Taps specific transaction → **Transaction Detail Modal**
5. Views full details, copies hash, or opens explorer
6. Dismisses modal → Returns to list

### Flow 5: Redeem BTC1 for Collateral
1. User on **Dashboard** → Taps "Redeem BTC1"
2. Navigate to **Redeem Screen**
3. Enter BTC1 amount to redeem
4. Select collateral type to receive
5. Review preview (amount, fees)
6. Tap "Redeem BTC1" → Confirm transaction
7. Success → Collateral sent to wallet
8. Return to **Dashboard** with updated balance

## Navigation Structure

```
Tab Bar (Bottom)
├── Home (Dashboard)
├── Mint
├── Rewards
└── Settings

Stack Navigation
├── Landing (if not connected)
├── Dashboard
├── Mint Screen
├── Redeem Screen
├── Rewards Screen
├── Activity Screen
├── Settings Screen
└── Modals
    ├── Transaction Detail
    ├── Wallet Connect
    └── Confirmation Dialogs
```

## Component Patterns

### Cards
- Rounded corners (16px radius)
- Subtle shadow for elevation
- Background: `surface` color
- Padding: 16-20px
- Border: 1px `border` color

### Buttons
- **Primary**: Solid `primary` background, white text, full-width
- **Secondary**: Outlined `border` color, `foreground` text
- **Ghost**: No border, `muted` text
- Height: 48px (easy thumb reach)
- Border radius: 12px
- Press feedback: scale 0.97 + haptic

### Typography
- **Headings**: Bold, 24-32px
- **Body**: Regular, 16px, line-height 1.5
- **Captions**: 14px, `muted` color
- **Numbers**: Tabular figures for alignment

### Icons
- SF Symbols (iOS) / Material Icons (Android)
- Size: 24px for actions, 20px for inline
- Color: Contextual (primary, muted, semantic)

### Input Fields
- Height: 48px
- Border: 1px `border` color
- Focus: 2px `primary` border
- Placeholder: `muted` color
- Corner radius: 8px

## Responsive Behavior

- **Portrait (default)**: Single column layout
- **Landscape**: Maintain portrait layout (no special handling)
- **Small screens (<375px width)**: Reduce padding, smaller font sizes
- **Large screens (tablets)**: Center content, max-width 600px

## Accessibility

- Minimum touch target: 44x44px
- Color contrast: WCAG AA compliant
- Screen reader labels for all interactive elements
- Haptic feedback for important actions
- Error messages clearly visible

## Performance Considerations

- Lazy load transaction history (pagination)
- Cache frequently accessed data (balances, stats)
- Optimistic UI updates (show pending states)
- Debounce input fields (mint/redeem amounts)
- Use FlatList for long lists (never ScrollView with .map())

## Native Features

- **Haptics**: Light impact on button press, success/error notifications
- **Clipboard**: Copy wallet address, transaction hashes
- **Deep Linking**: Support for wallet connection callbacks
- **Notifications**: Optional push for distribution alerts
- **Biometrics**: Optional for transaction confirmation (future)

## Design Inspiration

- **Coinbase Wallet**: Clean, trustworthy, easy onboarding
- **Uniswap Mobile**: Simple swap interface, clear transaction flow
- **Revolut**: Card-based dashboard, quick actions
- **Apple Wallet**: Minimal, focused, one-handed usage

## Branding

- **App Name**: BTC1USD
- **Tagline**: "Bitcoin-Backed Stable Asset"
- **Logo**: Will be generated (Bitcoin + USD symbol fusion)
- **Tone**: Professional, trustworthy, modern, Shariah-compliant

## Technical Notes

- All Web3 interactions use WalletConnect (no MetaMask browser)
- Storage: AsyncStorage for preferences, SecureStore for sensitive data
- State management: React Context + hooks (no Zustand initially)
- API: Reuse existing Supabase backend from web app
- Contracts: Same ABIs and addresses as web app
- Network: Base Sepolia (testnet) and Base Mainnet

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Complex Web3 transactions | Clear preview cards, confirmation modals |
| Network switching confusion | Prominent network indicator, auto-switch prompts |
| Gas fee surprises | Always show estimated gas before confirmation |
| Wallet connection issues | Retry button, clear error messages, fallback options |
| Slow blockchain responses | Loading states, optimistic updates, timeout handling |

## Success Metrics

- Wallet connection success rate > 95%
- Average time to first mint < 2 minutes
- Transaction success rate > 98%
- User retention after 7 days > 60%
- App crash rate < 0.1%

---

**Next Steps**: Implement wallet connection, integrate shared business logic, build core screens.
