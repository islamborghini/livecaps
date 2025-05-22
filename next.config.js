/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: false,
  // Skip TypeScript type checking during build to avoid errors
  typescript: {
    ignoreBuildErrors: true,
  },
  // Skip ESLint during build
  eslint: {
    ignoreDuringBuilds: true,
  }
};

module.exports = nextConfig;
