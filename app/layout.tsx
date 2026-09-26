import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/brand/ServiceWorkerRegistration";
import { StorageGuard } from "@/components/brand/StorageGuard";
import { SoundProvider } from "@/components/audio/SoundProvider";
import { VersionGuard } from "@/components/system/VersionGuard";

export const metadata: Metadata = {
  title: "Party Night",
  description: "让每一个夜晚，都更有故事。",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Party Night" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#080B1A",
};

const themeInitScript = `try{var t=localStorage.getItem("party-night-theme");document.documentElement.dataset.theme=t==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}`;

/**
 * B-1：静态导出（Capacitor 自包含版）没有 HTTP 响应头可注入，用 <meta http-equiv> 兜同一套 CSP。
 * 服务器模式仍然只走 next.config.ts 的 headers，两边不重复下发。（meta 不支持 frame-ancestors，故去掉。）
 * connect-src 额外放行 `https:`（仅 https，不给 http/ws）：自包含版要在本机直连 Provider 的
 * `chat/completions`；本机/私网/非 https 地址由 lib/ai/direct-provider 的地址校验拦下。
 */
const selfContainedCsp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; worker-src 'self' blob:";
const isSelfContained = process.env.PARTY_NIGHT_OUTPUT === "export";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>{isSelfContained && <meta httpEquiv="Content-Security-Policy" content={selfContainedCsp} />}<Script id="party-night-theme-init" strategy="beforeInteractive">{themeInitScript}</Script></head>
      <body>{children}<StorageGuard /><ServiceWorkerRegistration /><VersionGuard /><SoundProvider /></body>
    </html>
  );
}
