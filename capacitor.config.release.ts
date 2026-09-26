import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 自包含 Release 配置（B-1）：不设 server.url，WebView 只加载打进 APK 的本地静态导出产物。
 *
 *   pnpm android:release
 *   → pnpm build:export（Next 静态导出到 out/）
 *   → cap sync android（CAPACITOR_TARGET=release，把 out/ 拷进 android 资产）
 *
 * 不设 androidScheme：默认 https，源是 https://localhost —— 安全上下文，`crypto.subtle` 可用，
 * AI Key 的 AES-GCM 加密落盘才真正可行。
 *
 * appId / appName 与开发配置保持一致：换 appId 等于换一个应用，会丢掉手机上的 IndexedDB（含已保存的 AI Key）。
 */
export const releaseConfig: CapacitorConfig = {
  appId: 'night.party.app',
  appName: 'PartyNight',
  webDir: 'out',
};

export default releaseConfig;
