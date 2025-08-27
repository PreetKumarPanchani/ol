/** @type {import('next').NextConfig} */
const nextConfig = {
  // Suppress hydration warnings during development
  reactStrictMode: true,
  
  // Fix hydration issues with SVG icons
  experimental: {
    // This helps with hydration mismatches
    optimizePackageImports: ['lucide-react'],
  },
  

}

module.exports = nextConfig

