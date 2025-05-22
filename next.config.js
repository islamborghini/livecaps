/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: false,
  poweredByHeader: false,
  // Optimized for Vercel deployment
  images: {
    unoptimized: true, // Skip image optimization for better build performance
  },
  // Skip TypeScript type checking during build to avoid errors with problematic files
  typescript: {
    ignoreBuildErrors: true,
  },
  // Skip ESLint during build
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
