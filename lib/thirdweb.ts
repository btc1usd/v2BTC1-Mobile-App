import { createThirdwebClient } from "thirdweb";

// Thirdweb Configuration
// Get your keys from: https://thirdweb.com/dashboard/settings/api-keys

// Fallback to hardcoded values if env vars don't load (for debugging)
const CLIENT_ID_FROM_ENV = process.env.EXPO_PUBLIC_THIRDWEB_CLIENT_ID;
const SECRET_KEY_FROM_ENV = process.env.EXPO_PUBLIC_THIRDWEB_API_KEY;

export const THIRDWEB_CLIENT_ID = CLIENT_ID_FROM_ENV || "6e5221f1ab3683dfe7f1ee488f98e0a0";
export const THIRDWEB_SECRET_KEY = SECRET_KEY_FROM_ENV || "bHnTywoflw94MCfFk1glWuUvkDiw1GWymH1yDWO7SMZ3XDy79wLghHOVfE7imP9pZQWsr5dRbO7JTPNHWTdfLw";

// Debug logging to verify keys are loaded
if (__DEV__) {
  console.log("🔑 Thirdweb Config:", {
    clientId: THIRDWEB_CLIENT_ID ? `${THIRDWEB_CLIENT_ID.substring(0, 8)}...` : "MISSING",
    secretKey: THIRDWEB_SECRET_KEY ? `${THIRDWEB_SECRET_KEY.substring(0, 8)}...` : "MISSING",
    fromEnv: {
      clientId: !!CLIENT_ID_FROM_ENV,
      secretKey: !!SECRET_KEY_FROM_ENV,
    },
  });
}

if (!CLIENT_ID_FROM_ENV) {
  console.warn("⚠️ Using hardcoded THIRDWEB_CLIENT_ID (env var not found)");
}

if (!SECRET_KEY_FROM_ENV) {
  console.warn("⚠️ Using hardcoded THIRDWEB_SECRET_KEY (env var not found)");
}

export const client = createThirdwebClient({
  clientId: THIRDWEB_CLIENT_ID,
  secretKey: THIRDWEB_SECRET_KEY || undefined,
});
