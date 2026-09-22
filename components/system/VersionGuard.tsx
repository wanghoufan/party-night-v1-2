"use client";

import { useEffect } from "react";

const BUILT_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

/**
 * 版本自检：旧 SW 赖着不走时，页面自己动手换血。
 * 比对构建版本号与服务端 version.json，不一致则清全部 cache、注销所有 SW、硬重载一次。
 * sessionStorage 记一次，避免更新失败时无限重载。
 */
export function VersionGuard() {
  useEffect(() => {
    if (BUILT_VERSION === "dev") return;
    if (sessionStorage.getItem("pn-version-reloaded")) return;
    void fetch("/version.json", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const server = (await response.json() as { version?: string }).version;
      if (!server || server === BUILT_VERSION) return;
      sessionStorage.setItem("pn-version-reloaded", "1");
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
        const registrations = await navigator.serviceWorker?.getRegistrations?.() ?? [];
        await Promise.all(registrations.map((registration) => registration.unregister()));
      } finally {
        location.reload();
      }
    }).catch(() => undefined);
  }, []);
  return null;
}
