import type { CapacitorConfig } from '@capacitor/cli';
import { devConfig } from './capacitor.config.dev';
import { releaseConfig } from './capacitor.config.release';

/**
 * Capacitor 配置入口（Capacitor CLI 只认这一个文件名，且不支持 --config）。
 * 两份真配置分开放在：
 *   - capacitor.config.dev.ts     局域网直连 Mac（server.url，开发用）
 *   - capacitor.config.release.ts 自包含离线（webDir = out，无 server.url）
 *
 * 切换方式：环境变量 CAPACITOR_TARGET
 *   - 不设 / 其他值 → dev（与历史行为一致，直接 `pnpm android:sync` 就是局域网版）
 *   - CAPACITOR_TARGET=release → release（推荐用 `pnpm android:release`，它会先做静态导出再 sync）
 */
const config: CapacitorConfig = process.env.CAPACITOR_TARGET === 'release' ? releaseConfig : devConfig;

export default config;
