import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["geist"],
  reactStrictMode: true,
  // Ensure client env vars are available at build time for Vercel
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "",
  },
  turbopack: { root: process.cwd() },
};

export default nextConfig;
