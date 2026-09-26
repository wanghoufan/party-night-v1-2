#!/usr/bin/env node
/**
 * B-1 自包含 Release 构建：`pnpm build:export`
 *
 * 做三件事：
 *   1) 把「本次静态导出的类型检查不该看到的东西」临时移出仓库树，共两类：
 *      a. `app/api`——静态导出没有服务器，POST Route Handler 与 output: export 不兼容；
 *      b. 三份按需 `import { POST } from "@/app/api/generate-session/route"` 的单测——
 *         它们是真实断言（证明服务端过滤与 App 同口径、隐私不外发），必须保留；
 *         但 `next build` 的类型检查会把 `tests/**` 一起检查，app/api 一旦移出，
 *         `Running TypeScript` 阶段就会对这三份报 TS2307。故随 app/api 一起临时移出。
 *   2) 以 `PARTY_NIGHT_OUTPUT=export` 跑 `next build`，产物落在 `out/`（Capacitor release 的 webDir）；
 *   3) 无论成功、失败还是异常退出（SIGINT/SIGTERM/SIGHUP），都把移出的源码原样放回。
 *
 * 还原保证：所有移出项都暂存到同一个暂存根 `.static-export-stash/`（已 gitignore），
 * 且逐项保持原相对路径；只有 finally 与信号处理器会调用 restoreStashed()，它只把清单内的项
 * 从暂存搬回原位、再清空暂存根，不生成也不删除清单外的任何文件——因此不会留下半棵树。
 * 幂等/可恢复：启动时先 restoreStashed() 自愈上次异常退出（含 SIGKILL 等无法捕获的退出）
 * 遗留的暂存目录，再继续构建。暂存目录固定为仓库根，不写死任何机器绝对路径。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const stashDir = path.join(root, ".static-export-stash");

// 本次构建的类型检查不该看到的项（相对仓库根）。required=true 的项缺失即报错，
// 其余（按需 import 已移出模块的单测）缺失时跳过：单测增删不留死结，新依赖由 TS2307 暴露。
const stashManifest = [
  { relative: "app/api", required: true },
  { relative: "tests/unit/generate-session-filter.test.ts", required: false },
  { relative: "tests/unit/pack-minplayers-floor.test.ts", required: false },
  { relative: "tests/unit/v2-privacy-regression.test.ts", required: false },
];

const atRoot = (relative) => path.join(root, relative);
const atStash = (relative) => path.join(stashDir, relative);

/** 把暂存区里的每一项原样搬回原位，然后清空暂存根。只操作清单内的路径。 */
function restoreStashed() {
  const restored = [];
  for (const { relative } of stashManifest) {
    const stashed = atStash(relative);
    if (!existsSync(stashed)) continue;
    const original = atRoot(relative);
    if (existsSync(original)) rmSync(original, { recursive: true, force: true });
    mkdirSync(path.dirname(original), { recursive: true });
    renameSync(stashed, original);
    restored.push(relative);
  }
  if (restored.length > 0) {
    console.log(`[build:export] 已放回路由树/测试树：${restored.join("、")}`);
  }
  if (existsSync(stashDir)) rmSync(stashDir, { recursive: true, force: true });
}

/** 把清单里的每一项搬到暂存区；上次异常退出已搬走、原位缺失的项跳过，继续即可。 */
function stashForExport() {
  const moved = [];
  for (const { relative, required } of stashManifest) {
    const original = atRoot(relative);
    const stashed = atStash(relative);
    if (!existsSync(original)) {
      if (existsSync(stashed)) continue; // 上次异常退出：本来就已移出，继续即可
      if (required) throw new Error(`找不到 ${relative}，无法开始静态导出构建`);
      continue;
    }
    mkdirSync(path.dirname(stashed), { recursive: true });
    renameSync(original, stashed);
    moved.push(relative);
  }
  console.log(`[build:export] 已临时移出 ${moved.length} 项（静态导出的类型检查不该看到）：${moved.join("、")}`);
}

// 异常退出（Ctrl-C / kill）也要把源码放回去，绝不留半个仓库。
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    restoreStashed();
    process.exit(130);
  });
}

restoreStashed(); // 上次异常退出遗留的暂存先自愈，再开始本次构建
stashForExport();
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
  restoreStashed();
}
