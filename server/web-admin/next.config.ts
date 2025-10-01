import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/admin-ui',
  output: 'export',
  // Static export mode - generates plain HTML/CSS/JS that can be served by any web server
  // API calls will be relative to the main Express server
  
  // Set workspace root to web-admin directory to avoid lockfile warnings
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
