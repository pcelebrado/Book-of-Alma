/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  
  // Production optimizations
  poweredByHeader: false,
  
  // Ensure healthcheck endpoint is accessible
  // Railway uses healthcheck.railway.app for health probes
  async headers() {
    return [
      {
        source: '/api/health',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ];
  },
  
  // Image optimization settings for production
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
