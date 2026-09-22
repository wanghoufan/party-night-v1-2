
# BUGS

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注 |
|---|---|---:|---|---|---|---|
| V1.6-单测 spin-chain dup定义 | P1 | 否 | `pnpm typecheck` TS2393 | 已修复 | V1.6收尾 | 上一棒超时残留，收尾删重 |
| QA-V1.6-E2E-ENV codex沙箱EPERM | P1 | 否 | codex内起127.0.0.1:3000 | 环境限制非代码问题 | V1.6 QA | TM本窗口直跑代替 |

## V1.6 放行证据（2026-09-22）

- `pnpm lint`：0 error 0 warning。
- `pnpm typecheck`：0 错。
- `pnpm test`：71 files / 511 tests 全过。
- E2E 全量（TM本窗口直跑）：80 passed / 4 skipped（production 门控）。
- `pnpm build`（Luna QA）：PASS。
- 版本三处同值 1.5.0（package.json / sw.js CACHE_VERSION / version.json）。
- 种子350：脚本计数15→50/类；4–5档245/350=70%；红线词卡面零命中。
- Luna QA：静态门禁PASS，E2E沙箱EPERM未跑（由TM直跑补齐）。

## 真机QA会话能力预检结果（本轮无真机 session；GAP-04 仍待用户手机验收）

- 最终结论：`NOT_VERIFIED`
- 是否允许进入正式QA：NO（真机部分等用户回“放行”）
