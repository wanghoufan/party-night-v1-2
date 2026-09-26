# BUGS｜Change B 回归 QA

- 日期：2026-09-26
- QA_RESULT：DEGRADED
- 对象：当前工作区 Change B 回归；工作区存在未提交改动，测试针对执行时工作区状态。

## 数字结论

| 检查 | 结果 | 数字/说明 |
|---|---|---|
| `pnpm lint` | PASS | 0 errors，7 warnings |
| `pnpm typecheck` | PASS | exit 0，0 errors |
| `pnpm test` 全量 | PASS | 92/92 files，750/750 tests |
| 定向 `ai-key-persistence` + `ai-provider-repository` | PASS | 2/2 files，15/15 tests（13+2） |
| E2E | BLOCKED | Codex 沙箱预期受 localhost 权限限制（EPERM）；按任务要求未硬闯，待 TM 本窗口补跑。此项未验证。 |

## 缺陷

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| — | — | — | — | 未发现自动化回归缺陷 | Change B 回归 | lint、typecheck、全量及指定定向单测通过；E2E 仍待本窗口补跑。 |

## lint warnings

共 7 条，均为 warning，无 error：

- `scripts/decision/orca-decide.mjs`：4 条未使用变量警告。
- `scripts/decision/run-shadow.mjs`：2 条未使用变量警告。
- `tests/phone/dump-state.ts`：1 条未使用 `Page` 警告。

## 放行判断

## E2E补跑（TM本窗口直驱，2026-09-26，codex沙箱EPERM按既定口径TM接管）

- 首次补跑：85 passed + 4 skipped，1 fail = T166（packs路由B-1重构后测试断言仍期望旧URL，产品行为正常）。
- T166返工（仅测试1行：`/packs/custom-`→`/packs/editor?id=custom-`）后单跑1 passed；全量重跑：**86 passed + 4 skipped / 0 fail**（含v2-mutual-flow）。
- 结论：E2E CLOSED。
- QA_RESULT：**PASS**（TM补记；codex侧DEGRADED仅因沙箱未执行E2E，本窗口实测已覆盖）。
