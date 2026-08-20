/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  serverExternalPackages: ["better-sqlite3"],
  allowedDevOrigins: ["127.0.0.1"],
  env: {
    NEXT_PUBLIC_APP_BUILT_AT: new Date().toISOString(),
  },
  outputFileTracingIncludes: {
    "/api/price-history": ["./data/price-history.sqlite"],
    "/api/collection": ["./data/price-history.sqlite"],
    "/api/public-collection": ["./data/price-history.sqlite"],
  },
};

export default nextConfig;
