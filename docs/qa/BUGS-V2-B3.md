
# BUGS

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注 |
|---|---|---:|---|---|---|---|
| V2-B3-01 present事件缺失 | P1 | 否 | 首轮即展示5档时保障窗口被延长 | 已修复 | V2-B3返工 | pending+present即时offered |
| V2-B3-02 personal封顶错 | P1 | 否 | personalEvidence=2得+4 | 已修复 | V2-B3返工 | 改封顶+2＋边界例 |

## V2-B3 放行证据（2026-09-25）

- `pnpm lint`：0 error（6 warnings 均为存量模板文件）。
- `pnpm typecheck`：0 错。
- `pnpm test`：81 files / 610 tests 全过（含routing 8＋guarantee 9）。
- reviewer：FAIL→返工→复验PASS（本文件对证）。
- builder通道：用户令切codebuddy deepseek-flash（MiMo连挂三单零落盘），授权链记HANDOFF。

## 真机QA会话能力预检结果（本轮无真机 session）

- 最终结论：`NOT_VERIFIED`
- 是否允许进入正式QA：NO
