# BUGS｜V2 RC Fix 回归（P2-01 / P2-02）

## 任务与环境

| 项 | 内容 |
|---|---|
| 日期 | 2026-09-26 |
| 任务 | P2-01 / P2-02 整改后回归 |
| 仓库 HEAD | `b08ceb8`（工作区脏区；以执行时文件快照验证） |
| 环境 | macOS arm64；Node v24.19.0；pnpm 11.21.0；Vitest 3.2.7 |
| QA范围 | lint、typecheck、全量 unit、互选/B10/exit-away 定向 unit、全量 E2E（含 `v2-mutual-flow`） |

## 命令结果

| 命令 | 结果 | 数字/说明 |
|---|---|---|
| `pnpm lint` | **PASS** | 0 errors，23 warnings；warnings 位于 Android 生成产物、`scripts/decision/**`、`tests/phone/dump-state.ts` |
| `pnpm typecheck` | **PASS** | exit 0，0 errors |
| `pnpm test` | **PASS** | 91/91 files；737/737 tests passed；0 failed，0 skipped；11.45s |
| `pnpm exec vitest run tests/unit/v2-mutual-check.test.ts tests/unit/v2-b10-event-reduce.test.ts tests/unit/mutual-check-sheet.test.tsx` | **PASS** | 3/3 files；52/52 tests passed（23 + 20 + 9） |
| player exit/away 定向：`pnpm exec vitest run tests/unit/v2-b10-event-reduce.test.ts -t '退出|暂离|名册差三分语义|EXIT|AWAY'` | **PASS** | 5 passed，15 个非匹配用例 skipped（仅按测试名筛选） |
| `pnpm test:e2e` | **FAIL / 环境阻塞** | Playwright 0 tests executed；配置的 webServer 无法监听 `127.0.0.1:3000`，报 `listen EPERM` 并退出 1。检查确认 3000 当时无人监听；BrowserOS 工具未注入，故本轮没有 E2E 用例结果。`tests/e2e/v2-mutual-flow.spec.ts`（含 V2 mutual flow）未运行。 |

## 缺陷与阻塞

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注 |
|---|---|---:|---|---|---|---|
| QA-ENV-01 | — | 否 | 执行 `pnpm test:e2e`，Playwright 启动 webServer | BLOCKED | P2-01/P2-02 RC 回归 | 沙箱禁止 `127.0.0.1:3000` 监听（EPERM）；0 个 E2E 实际执行。不是业务缺陷，需在允许本地服务监听的既定 QA Runtime 重跑全量 E2E。 |

## AI Phone Matrix（单独记录，不判 P0）

- 来源：`docs/qa/AI-MATRIX-PHONE.md`，Note 12 Pro / dev31，2026-09-26；本轮未重跑手机矩阵。
- 已记录覆盖 8/28 组合，5/8 已测组合通过（文档总矩阵口径 5/28，17.9%）；已测范围包含失败项：2 项 AI 服务生成失败、1 项 Playwright harness 点击超时。剩余 20 组未覆盖。
- 分类：**external/flaky**（外部 AI 服务可用性及 harness 超时）；单独跟踪，**不计 P0，不计入本轮单元/E2E 通过率**。

## 结论

**QA_RESULT=FAIL（E2E 环境阻塞，需补跑）**

- lint：PASS，0 error / 23 warning。
- typecheck：PASS，0 error。
- 全量 unit：PASS，91 files / 737 tests。
- 定向：PASS，核心三文件 52/52；player exit/away 5/5。
- E2E：FAIL/未执行，启动阶段 `EPERM`；包括 `v2-mutual-flow` 在内的全量 E2E 尚无结果。
- 本轮 P0：**0**；QA-ENV-01 是执行环境阻塞，不是产品 P0。

## Fix Attempt Fingerprint

- Task ID: P2-01/P2-02 RC Fix QA 回归
- Root Cause Hypothesis: E2E webServer 所在执行环境禁止本机回环端口监听；业务用例尚未启动。
- Approach: 对当前工作区快照运行全量静态检查、unit、指定定向测试和 E2E。
- Files Changed: 仅新增本 QA 报告；未改业务代码。
- Verification: 见上方命令结果。
- Failure Reason: `pnpm test:e2e` 进程启动 Next dev server 时收到 `listen EPERM`；本会话没有 BrowserOS 工具可接管本地页面。
- Difference From Previous Attempt: 本轮 unit 为 91 files / 737 tests；当前回归指定的 3 个文件为 52/52，单独 exit/away 筛选为 5/5。E2E 未能验证。
