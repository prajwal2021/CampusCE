/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/flumen',
  output: 'standalone',
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: '/flumen',
  },
};

module.exports = nextConfig;
