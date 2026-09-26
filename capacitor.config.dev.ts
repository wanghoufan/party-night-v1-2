import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 开发/局域网调试配置（CAPACITOR_TARGET 未设为 release 时的默认）：
 * 手机直连 Mac 上的 Next 服务 —— 手机 DNS 污染 vercel.app，所以走局域网 IP；需要同一 WiFi。
 *
 * 注意：局域网 http 源不是安全上下文，WebView 里 `crypto.subtle` 不可用，
 * 因此在这个配置下 AI Key 只能做到「仅本次会话」；要真正加密落盘请用 release 配置（https://localhost）。
 */
export const devConfig: CapacitorConfig = {
  appId: 'night.party.app',
  appName: 'PartyNight',
  webDir: 'public',
  server: {
    // 生产站 PWA 本体未动；恢复外网后可切回 https://party-night-v1-2.vercel.app/
    url: 'http://192.168.31.60:3000/',
    androidScheme: 'http',
    cleartext: true,
  },
};

export default devConfig;
