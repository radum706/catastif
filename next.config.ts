import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@node-rs/argon2"],
  poweredByHeader: false,
  // Money pages moved under /money when Tasks got its own module.
  async redirects() {
    return ["bills", "collect", "transactions", "forecast", "transfers"].map((p) => ({
      source: `/${p}/:path*`,
      destination: `/money/${p}/:path*`,
      permanent: false,
    }));
  },
};

export default nextConfig;
