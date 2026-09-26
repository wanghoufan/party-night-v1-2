import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'night.party.app',
  appName: 'PartyNight',
  webDir: 'public',
  server: {
    // 局域网版：手机 DNS 污染 vercel.app，改直连 Mac 本地服务（同一 WiFi）。
    // 生产站 PWA 本体未动；恢复外网后可切回 https://party-night-v1-2.vercel.app/
    url: 'http://192.168.31.60:3000/',
    androidScheme: 'http',
    cleartext: true,
  },
};

export default config;
