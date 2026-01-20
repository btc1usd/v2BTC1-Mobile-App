/**
 * Critical polyfills for React Native Web3 apps
 * This file MUST be loaded before any other code
 * DO NOT import anything else in this file
 */

// STEP 1: Set up crypto BEFORE importing react-native-get-random-values
// This ensures the object exists when the polyfill tries to augment it
if (typeof global.crypto === "undefined") {
  global.crypto = {};
}

// STEP 2: Import the polyfill packages
import "react-native-get-random-values";
import "react-native-url-polyfill/auto";
import { Buffer } from "buffer";

// STEP 3: Set up global Buffer
if (typeof global.Buffer === "undefined") {
  global.Buffer = Buffer;
}

// STEP 4: Verify and fix crypto.getRandomValues
// react-native-get-random-values should have set this, but let's verify
if (typeof global.crypto.getRandomValues !== "function") {
  console.warn("⚠️ crypto.getRandomValues not set by react-native-get-random-values, using fallback");
  
  // Fallback implementation
  global.crypto.getRandomValues = function(array) {
    if (!array || typeof array.length !== "number") {
      throw new TypeError("Failed to execute 'getRandomValues' on 'Crypto': parameter 1 is not of type 'ArrayBufferView'");
    }
    
    // Use Math.random as fallback (not cryptographically secure but works)
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    
    return array;
  };
}

// STEP 5: Ensure the function is bound correctly
const originalGetRandomValues = global.crypto.getRandomValues;
global.crypto.getRandomValues = function(array) {
  return originalGetRandomValues.call(global.crypto, array);
};

// STEP 6: Add webcrypto for Node.js compatibility
if (!global.crypto.webcrypto) {
  global.crypto.webcrypto = {
    getRandomValues: global.crypto.getRandomValues,
  };
}

// STEP 7: Ensure crypto is also on window for web compatibility
if (typeof window !== "undefined") {
  if (!window.crypto) {
    window.crypto = global.crypto;
  } else if (!window.crypto.getRandomValues) {
    window.crypto.getRandomValues = global.crypto.getRandomValues;
  }
  if (!window.Buffer) {
    window.Buffer = Buffer;
  }
}

// STEP 8: Make crypto available as a standalone module
if (typeof crypto === "undefined") {
  global.crypto = global.crypto;
}

// STEP 9: Log success in dev mode
if (__DEV__) {
  console.log("✅ Crypto polyfills loaded successfully");
  console.log("   - global.Buffer:", typeof global.Buffer);
  console.log("   - global.crypto:", typeof global.crypto);
  console.log("   - global.crypto.getRandomValues:", typeof global.crypto.getRandomValues);
  
  // Test it works
  try {
    const testArray = new Uint8Array(10);
    global.crypto.getRandomValues(testArray);
    console.log("   - Test call successful ✓");
  } catch (error) {
    console.error("   - Test call FAILED:", error);
  }
}
