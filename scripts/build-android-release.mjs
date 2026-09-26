#!/usr/bin/env node
/**
 * B-1 自包含 Release 一键出 Android 资产：`pnpm android:release`
 *
 *   1) pnpm build:export  —— Next 静态导出到 out/（app/api 由该脚本临时移出再放回）
 *   2) cap sync android   —— CAPACITOR_TARGET=release，用 capacitor.config.release.ts 把 out/ 拷进 APK 资产
 *
 * 用 Node 起子进程而不是写 shell 前缀，是为了 Windows 11 / macOS 都能直接跑（不写死任何机器路径）。
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const isWindows = process.platform === "win32";

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: isWindows, env: { ...process.env, ...env } });
  if (result.status !== 0) {
    console.error(`[android:release] 失败：${command} ${args.join(" ")}（exit=${result.status ?? "signal"}）`);
    process.exit(result.status ?? 1);
  }
}

run("node", ["scripts/build-static-export.mjs"]);
if (!existsSync(path.join(root, "out", "index.html"))) {
  console.error("[android:release] 没有找到 out/index.html，先修好静态导出再同步");
  process.exit(1);
}
run("cap", ["sync", "android"], { CAPACITOR_TARGET: "release" });
console.log("[android:release] 完成：out/ 已同步进 android 工程（可用 Android Studio 或 gradle 出包）");
