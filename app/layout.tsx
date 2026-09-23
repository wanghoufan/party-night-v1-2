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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head><Script id="party-night-theme-init" strategy="beforeInteractive">{themeInitScript}</Script></head>
      <body>{children}<StorageGuard /><ServiceWorkerRegistration /><VersionGuard /><SoundProvider /></body>
    </html>
  );
}
