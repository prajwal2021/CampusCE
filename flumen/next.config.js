/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/flumen',
  output: 'standalone',
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: '/flumen',
  },
  // The admin pages used to live at the top level; keep old bookmarks working.
  async redirects() {
    return ['topology', 'data', 'query', 'comparison', 'activity'].map(p => ({
      source: `/${p}`,
      destination: `/admin/${p}`,
      permanent: false,
    }));
  },
};

module.exports = nextConfig;
