import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @sparticuz/chromium and playwright-core ship native binaries/large
  // assets that Next's bundler otherwise tries to process -- excluding them
  // from bundling is required for the SURCON scraper and PDF routes to work
  // once deployed as Vercel serverless functions.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core"],
};

export default nextConfig;
