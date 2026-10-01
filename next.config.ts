import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@node-rs/argon2"],
  poweredByHeader: false,
  // OAuth / MCP discovery documents (RFC 9728, RFC 8414).
  async rewrites() {
    const resource = "/api/oauth/metadata/resource";
    const server = "/api/oauth/metadata/server";
    return [
      { source: "/.well-known/oauth-protected-resource", destination: resource },
      { source: "/.well-known/oauth-protected-resource/:path*", destination: resource },
      { source: "/.well-known/oauth-authorization-server", destination: server },
      { source: "/.well-known/oauth-authorization-server/:path*", destination: server },
      { source: "/.well-known/openid-configuration", destination: server },
    ];
  },
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
