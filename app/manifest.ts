import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Party Night 聚会游戏",
    short_name: "Party Night",
    description: "让每一个夜晚，都更有故事。",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#080B1A",
    theme_color: "#080B1A",
    lang: "zh-CN",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-1024.png", sizes: "1024x1024", type: "image/png" },
    ],
  };
}
