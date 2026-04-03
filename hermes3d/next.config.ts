import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the gateway URL to be set at runtime without a rebuild
  serverRuntimeConfig: {
    gatewayUrl: process.env.HERMES_GATEWAY_URL || process.env.NEXT_PUBLIC_GATEWAY_URL || "ws://localhost:18789",
    gatewayToken: process.env.HERMES_GATEWAY_TOKEN || "",
    studioAccessToken: process.env.STUDIO_ACCESS_TOKEN || "",
  },
  publicRuntimeConfig: {
    gatewayUrl: process.env.NEXT_PUBLIC_GATEWAY_URL || "ws://localhost:18789",
  },
};

export default nextConfig;
