
# BUGS

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注 |
|---|---|---:|---|---|---|---|
| QA-V1.7-E2E-ENV codex沙箱EPERM | P1 | 否 | codex内起127.0.0.1:3000 | 环境限制非代码问题 | V1.7 QA | TM本窗口直跑代替 |

## V1.7 放行证据（2026-09-23，分支 `feat/sound-v17` 未合 main）

- `pnpm lint`：0 error（6 warnings 均为存量模板文件）。
- `pnpm typecheck`：0 错。
- `pnpm test`：74 files / 531 tests 全过（含新增 audio 20 项）。
- E2E（TM本窗口直跑）：`sound.spec.ts` 4 过；全量 84 passed / 4 skipped（production 门控）。
- `pnpm build`（Luna QA）：PASS。
- 版本未动（三处仍 1.5.0，发版时再定）。
- Luna QA：静态门禁 PASS，E2E 沙箱 EPERM 未跑（由 TM 直跑补齐）。
- 听感说明：E2E 断言无报错＋开关持久化；真机听感待用户验收。

## 真机QA会话能力预检结果（本轮无真机 session）

- 最终结论：`NOT_VERIFIED`
- 是否允许进入正式QA：NO（听感等用户真机验收）
