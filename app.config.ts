// Load environment variables with proper priority (system > .env)
// Only load in local development, EAS handles env vars automatically
if (!process.env.EAS_BUILD) {
  require("./scripts/load-env.js");
}
import type { ExpoConfig } from "expo/config";

// Use clean BTC1USD scheme instead of timestamp-based manus scheme
// Bundle ID must follow reverse domain format: com.company.app
const bundleId = "com.btc1usd.mobile";
// Use a clean, branded scheme for deep linking
const appScheme = "btc1usd";

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "BTC1USD",
  appSlug: "btc1usd-mobile",
  // S3 URL of the app logo - set this to the URL returned by generate_image when creating custom logo
  // Leave empty to use the default icon from assets/images/icon.png
  logoUrl: "",
  scheme: appScheme,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.3",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  extra: {
    eas: {
      projectId: "76671c95-a749-4cdc-91c3-4d3b17e7b32e",
    },
  },
  owner: "btc1",
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    associatedDomains: [`applinks:${env.appSlug}.app`],
    infoPlist: {
      // Enable WebView to load external HTTPS content
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: false,
        NSExceptionDomains: {
          "thirdweb.com": {
            NSExceptionAllowsInsecureHTTPLoads: false,
            NSIncludesSubdomains: true,
            NSExceptionMinimumTLSVersion: "TLSv1.2",
          },
        },
      },
      // Enable WebView and WalletConnect deep linking
      LSApplicationQueriesSchemes: [
        "wc",
        "walletconnect",
        "metamask",
        "trust",
        "rainbow",
        "coinbase",
        "https",
        "http",
      ],
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    versionCode: 3,
    permissions: ["POST_NOTIFICATIONS"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
      {
        action: "VIEW",
        data: [
          {
            scheme: env.scheme,
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-localization",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
