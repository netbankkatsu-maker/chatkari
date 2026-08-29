import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.x.ai" },
      { protocol: "https", hostname: "x.ai" },
      { protocol: "https", hostname: "**.r2.dev" },
      { protocol: "https", hostname: "modelslab.com" },
      { protocol: "https", hostname: "**.modelslab.com" },
      { protocol: "https", hostname: "cdn.stablediffusionapi.com" },
    ],
  },
};

export default nextConfig;
