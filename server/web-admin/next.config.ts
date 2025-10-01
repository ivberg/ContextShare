import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/admin-ui',
  output: 'standalone',
  // We will set NEXT_PUBLIC_API_BASE_URL to '/' when embedded so relative fetches work
};

export default nextConfig;
