const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// CRITICAL: Add polyfills as the first module to be loaded
// This ensures crypto.getRandomValues is available before any other code runs
const polyfillPath = path.resolve(__dirname, "polyfills.js");

const originalGetModulesRunBeforeMainModule = config.serializer.getModulesRunBeforeMainModule;
config.serializer.getModulesRunBeforeMainModule = () => {
  const modules = originalGetModulesRunBeforeMainModule ? originalGetModulesRunBeforeMainModule() : [];
  return [polyfillPath, ...modules];
};

// Add support for .js extensions in ESM modules
config.resolver.sourceExts.push('cjs', 'mjs');

// Ensure image assets are properly resolved
config.resolver.assetExts = config.resolver.assetExts || [];
if (!config.resolver.assetExts.includes('png')) {
  config.resolver.assetExts.push('png');
}

// Enable package exports to resolve .js imports correctly
config.resolver.unstable_enablePackageExports = true;

// Ensure we prefer react-native and browser versions of packages
config.resolver.resolverMainFields = [
  "react-native",
  "browser",
  "main",
  "module",
];

// Polyfill Node.js core modules for React Native
config.resolver.extraNodeModules = {
  crypto: require.resolve('expo-crypto'),
  stream: require.resolve('readable-stream'),
  buffer: require.resolve('buffer'),
};

// Fix for @noble/hashes resolution issues in some environments
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@noble/hashes/crypto") {
    return context.resolveRequest(context, "@noble/hashes/crypto.js", platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});
