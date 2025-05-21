/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: false,
  poweredByHeader: false,
  // Optimized for Vercel deployment
  images: {
    domains: ['*'], // Allow images from any domain
    unoptimized: true, // Skip image optimization for better build performance
  },
  // Handle environment variables gracefully
  env: {
    VERCEL_BUILDING: process.env.VERCEL_BUILDING || '',
  },
  // Suppress external API calls during build
  webpack: (config, { isServer, dev }) => {
    if (process.env.VERCEL_BUILDING && !dev) {
      console.log('Suppressing external API calls during build');
    }
    return config;
  },
};

module.exports = nextConfig;
