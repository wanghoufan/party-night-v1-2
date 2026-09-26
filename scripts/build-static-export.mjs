#!/usr/bin/env node
/**
 * B-1 自包含 Release 构建：`pnpm build:export`
 *
 * 做三件事：
 *   1) 把 `app/api` 临时移出路由树（静态导出没有服务器，POST Route Handler 与 output: export 不兼容）；
 *   2) 以 `PARTY_NIGHT_OUTPUT=export` 跑 `next build`，产物落在 `out/`（Capacitor release 的 webDir）；
 *   3) 无论成功失败都把 `app/api` 放回去。
 *
 * 幂等/可恢复：脚本启动时若发现上次异常退出遗留的暂存目录、而 `app/api` 不在位，先恢复再继续；
 * 暂存目录固定为仓库根的 `.static-export-stash`（已 gitignore），不写死任何机器绝对路径。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const apiDir = path.join(root, "app", "api");
const stashDir = path.join(root, ".static-export-stash");
const stashedApiDir = path.join(stashDir, "api");

function restoreApi() {
  if (existsSync(stashedApiDir)) {
    if (existsSync(apiDir)) rmSync(apiDir, { recursive: true, force: true });
    renameSync(stashedApiDir, apiDir);
    console.log("[build:export] app/api 已放回路由树");
  }
  if (existsSync(stashDir)) rmSync(stashDir, { recursive: true, force: true });
}

function stashApi() {
  if (!existsSync(apiDir)) {
    if (existsSync(stashedApiDir)) return; // 上次异常退出：本来就已移出，继续即可
    throw new Error("找不到 app/api，无法开始静态导出构建");
  }
  mkdirSync(stashDir, { recursive: true });
  renameSync(apiDir, stashedApiDir);
  console.log("[build:export] 已临时移出 app/api（静态导出无服务器路由）");
}

// 异常退出（Ctrl-C / kill）也要把源码放回去，绝不留半个仓库。
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    restoreApi();
    process.exit(130);
  });
}

restoreApi();
stashApi();
try {
  // 残留的路由类型校验文件会按文件名引用已移走的 app/api（以及历史上删掉的路由），
  // 让 `Running TypeScript` 直接失败；先清掉，构建会重新生成属于本次路由表的那份。
  for (const stale of [".next/types", ".next/dev/types", ".next-export"]) {
    rmSync(path.join(root, stale), { recursive: true, force: true });
  }
  const result = spawnSync("next", ["build", "--webpack"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, PARTY_NIGHT_OUTPUT: "export" },
  });
  if (result.status !== 0) {
    console.error(`[build:export] next build 失败（exit=${result.status ?? "signal"}）`);
    process.exitCode = result.status ?? 1;
  } else if (!existsSync(path.join(root, "out", "index.html"))) {
    console.error("[build:export] 构建成功但没有生成 out/index.html，静态导出未生效");
    process.exitCode = 1;
  } else {
    console.log("[build:export] 静态导出完成：out/");
  }
} finally {
  restoreApi();
}
