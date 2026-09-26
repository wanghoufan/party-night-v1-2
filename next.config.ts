import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

/**
 * B-1 自包含 Release：`PARTY_NIGHT_OUTPUT=export` 时走 Next 静态导出（产物 out/），
 * 交给 Capacitor 打进 APK，不依赖任何服务器（无 server.url）。
 * 不设该变量时维持原行为：standalone + 服务器 headers，局域网/生产 PWA 照旧。
 */
const staticExport = process.env.PARTY_NIGHT_OUTPUT === "export";

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
  output: staticExport ? "export" : "standalone",
  // 静态导出：目录式路由（/game/index.html），WebView 本地取件最稳；导出产物固定在 out/（Capacitor release 的 webDir）。
  ...(staticExport ? { trailingSlash: true, images: { unoptimized: true } } : {}),
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version ?? "dev",
    // 自包含安装包（无服务器、无 /api）给前端一个可判定的开关：AI 在线能力直接降级，不发注定失败的请求。
    NEXT_PUBLIC_SELF_CONTAINED: staticExport ? "1" : "",
  },
  // 静态导出由 WebView 本地服务器托管，没有可注入的 HTTP 响应头；headers 只在服务器模式生效，
  // 导出模式改由 app/layout.tsx 里的 <meta http-equiv> 兜同一套 CSP。
  ...(staticExport ? {} : {
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
  }),
};

export default nextConfig;
