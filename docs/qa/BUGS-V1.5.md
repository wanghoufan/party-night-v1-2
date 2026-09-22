
# BUGS

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| V1.5-链入无响应 空牌堆点真心话/大冒险静默 | P0 | 否 | 空牌堆转瓶子结果页点去向 | 已修复 | V1.5链入热修 | TM实证：pack=spin-bottle/round=none/chain.returning+exhausted/零报错；修后enter/replace先补种再判空，耗尽按钮禁用+可见提示 |
| V1.5-E2E-01 spin-bottle:59 链后切面板点转瓶子超时 | P1 | 否 | 链题完成→切换面板→点转瓶子 | 已修复（测旧语义） | V1.5 E2E返工 | 新语义已自动回瓶子，面板内当前项 disabled 正确；测试改断直接回跳 |
| V1.5-E2E-02 v1-1-recovery:91 切包后期望第4轮 | P1 | 否 | 手动切包→断言第4轮 | 已修复（测旧语义） | V1.5 E2E返工 | 新语义新段从1重计；测试改断第1＋刷新后第2＋审计连续 |
| V1.5-单测 single-scale-source 钉死keys | P1 | 否 | `pnpm test` 1挂 | 已修复 | V1.5返工 | 改 SCALE_WORDS 语义断言，允许 chain 键 |
| V1.5-lint spin-chain customPacks 未使用 | P2 | 否 | `pnpm lint` 1 warn | 已修复 | V1.5返工 | 去默认值＋下划线前缀＋注释 |

## V1.5 放行证据（2026-09-22，TM 接管直验：codex 沙箱 EPERM 起不来 127.0.0.1:3000，拨回本窗口 bash 直跑）

- `pnpm lint`：0 error 0 warning。
- `pnpm typecheck`：0 错。
- `pnpm test`：71 files / 497 tests 全过。
- E2E 全量 `npx playwright test`：71 passed / 4 skipped（36.9s；4 skip 均为 production 门控 `PARTY_NIGHT_PRODUCTION_SMOKE`，与改动无关）。
- `pnpm build`（Luna QA 已验）：PASS。
- 题库：`pnpm export:questions` 幂等，两次总 sha `d12cf817…` 一致；7 文件行数 15/15/30/30/30/30/30＝180 卡。
- point 映射：`components/game/pack-icon.ts` 补 `point`（`git diff` 见该文件 6 行级改动）。
- E2E 改动文件实为 10 个（fixture 补 `currentSegmentId` 5 处＋断言改 5 处），builder 口述“6文件7例”少计了 fixture 行，内容一致、无隐藏改动。
- spin-bottle:104 🎯Alex→Emma：回跳后“再转一次”避上次落点，固定 RNG 下落 Emma，语义正确。
- `page.tsx:59` 已显式 `cause="manual-switch"`（语义不变，与“生产侧调用全显式”对齐）。
- 链入热修（2026-09-22）：`pnpm lint` 0、`pnpm typecheck` 0、`pnpm test` 500/500；E2E spin+desktop 11 项过（含空牌堆链入、双耗尽提示回归）；reviewer 4 项成立。

## 真机QA会话能力预检结果（本轮无真机 session；GAP-04 仍待用户手机验收）

- 最终结论：`NOT_VERIFIED`
- 是否允许进入正式QA：NO（真机部分等用户回“放行”）
