/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
    serverComponentsExternalPackages: ["better-sqlite3"],
    outputFileTracingIncludes: {
      "/api/price-history": ["./data/price-history.sqlite"]
    }
  }
};

export default nextConfig;

