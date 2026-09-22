import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

const scriptPolicy = process.env.NODE_ENV === "development"
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval';"
  : "script-src 'self' 'unsafe-inline';";

const interfaceOrigins = Object.values(networkInterfaces())
  .flat()
  .filter((address) => address && !address.internal && address.family === "IPv4")
  .map((address) => address!.address);
const localDevOrigins = ["localhost", "127.0.0.1", ...interfaceOrigins];

const nextConfig: NextConfig = {
  allowedDevOrigins: localDevOrigins,
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  env: { NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version ?? "dev" },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: `default-src 'self'; ${scriptPolicy} style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; worker-src 'self' blob:` },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};

export default nextConfig;
