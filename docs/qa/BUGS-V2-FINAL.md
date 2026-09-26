
# BUGS｜V2 收尾验证（FINAL）

## 任务

| 项 | 内容 |
|---|---|
| 任务 | V2 收尾验证（只读不改业务代码，仅落盘本报告） |
| 工作区 | `/Users/zzymima0000/Developer/coding/1.Active/028-ing-酒吧聚会社交导演` |
| 日期 | 2026-09-26 |
| 仓库 HEAD | `b08ceb8` docs: V2 Phase1 R1-R5审查链落盘（DRAFT.2+D1/D2/R3/R4/R5复审）（工作区有未提交改动，按原样验证，未做任何代码修改） |

## 环境

| 项 | 值 |
|---|---|
| OS / 架构 | macOS 26.6 / arm64 |
| Node | v24.19.0 |
| pnpm | 11.21.0（packageManager `pnpm@11.21.0`） |
| Next.js | 16.3.3 |
| Playwright | 1.55.1，project `mobile-chromium`（Pixel 7 / 390×844） |
| baseURL | `http://127.0.0.1:3000` |
| 端口 3000 | 本 session 前已存在 `next-server (v16.3.3)` PID 24216 在监听，`curl` 返回 200；按规则未关闭、未抢占，Playwright `reuseExistingServer=true` 复用该服务 |

## 命令与结果

### 1）`pnpm lint` + `pnpm typecheck`

| 命令 | Exit | 结果 |
|---|---:|---|
| `pnpm lint`（eslint .） | 0 | **0 errors / 22 warnings** |
| `pnpm typecheck`（tsc --noEmit） | 0 | **0 errors（0 行输出）** |

lint 22 条全为 warning，分布：`scripts/**` 与既有 `app/` 页内 `@typescript-eslint/no-unused-vars`（如 `nativeBridge`/`ignored`/`ctx` 等）、`@typescript-eslint/no-unused-expressions`（短路表达式写法）、unused eslint-disable directive。**无一条 error，不阻断**；其中 2 条 `--fix` 可自动修（本次只读不改）。

### 2）`pnpm test`（vitest run 全量）

| 指标 | 值 |
|---|---|
| Exit | 0 |
| Test Files | **91 passed (91)** |
| Tests | **728 passed (728)** |
| Failures / Flaky | **0** |
| Duration | 10.87s |

`tests/unit/**` 内无 `test.skip`/`describe.skip`，728 为全量真实执行数（含 V2 相关：v2-reducer 29、v2-b10-event-reduce 16、v2-session 14、v2-guarantee 9、v2-exhaustion 9、v2-content-adapter 9、v2-routing 8、v2-private 8、v2-r3-constants-gate 4 等）。

### 3）E2E

| 项 | 结果 |
|---|---|
| `tests/e2e/v2-mutual-flow.spec.ts` 在盘 | **是**，115 行，位于 `tests/e2e/`，1 个用例 `V2私密互选全流程：9轮→检查点→互选成MATCH→继续游戏`（:75） |
| `pnpm test:e2e` 全量 | Exit **0** → **86 passed / 4 skipped / 0 failed**（33.6s，单 worker） |
| 单 spec 重跑 `pnpm exec playwright test tests/e2e/v2-mutual-flow.spec.ts` | Exit **0** → **1 passed (1.9s)** |

4 条 skipped 均为环境门控、非缺陷：`production-offline.spec.ts:4`、`v1-1-recovery.spec.ts:210`、`pwa-cache-regression.spec.ts:24`、`pwa-schema-upgrade.spec.ts:83`，全部 `test.skip(PARTY_NIGHT_PRODUCTION_SMOKE !== "true", 仅针对 production build)`，需 production build + 环境变量才执行，本地 dev 基按设计跳过。

## 缺陷清单

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| — | — | — | — | — | — | 本轮未发现缺陷 |

### P0–P3 计数

| 等级 | 数量 | 说明 |
|---|---:|---|
| P0 | **0** | 无 |
| P1 | **0** | 无 |
| P2 | **0** | 无 |
| P3 | **0** | 无（lint 22 条 warning 为既有代码风格/未用变量提示，非行为缺陷，且属 lint 阶记非本轮新增） |

### 观察项（不计缺陷，供后续排期）

- O-1：lint 22 warnings 可用 `pnpm lint --fix` 收 2 条，其余需人工清理。
- O-2：4 条 production smoke e2e 需 `PARTY_NIGHT_PRODUCTION_SMOKE=true` + `next build` 才会执行；若 V2 要覆盖 PWA/离线真机路径，应在放行前补一次 production 基跑。

## 真机QA会话能力预检结果

- 本 session 为纯本地 CLI 静态/单元/E2E（Playwright）验证，**未进入真机（Android/真设备）QA**，故不填真机预检表；如需真机 session，按 `BUGS.template.md` 单列一节重新预检，全 PASS 才进正式 QA。

## 结论

**PASS**

四数：lint **0 error**（22 warning）｜typecheck **0 error**｜unit **728/728 passed（91 files）**｜e2e **86 passed + 4 skipped + 0 failed**（`v2-mutual-flow.spec.ts` 在盘且单跑 **1 passed**）。
