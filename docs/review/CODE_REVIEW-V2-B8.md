# CODE REVIEW

- Task: V2-B8 游戏主链切 V2（/game 出卡唯一入口切 V2 编排器 + 耗尽 Host 二选一 + D4 降级提示）
- Commit: 工作区未提交改动（app/game/page.tsx 改动 +37/-3；HostExhaustionSheet.tsx、card-eligibility.ts、v2-b8-game-mainline.test.ts 新建）
- Reviewer: code-reviewer
- Result: 过

## P0 / P1 Findings

- 无 P0、无 blocking P1。

四项对照核查（全部通过）：

1. **D2 旧 selector 生产不可达 — 通过。** 全仓 grep `card-selector`：lib/app/components 生产代码零 import（仅注释提及）；`v2-deal.ts` 明确不引旧 selector，`startRound`（session-engine.ts:94）→ `drawDeckCard` → `drawV2SessionCard` 是唯一出卡入口。旧 `card-selector.ts` 降级为「历史留档 + 兼容再导出」（转发 card-eligibility），且有测试守护：`v2-b8-game-mainline.test.ts:212`（扫生产目录零引用）与 `v2-b7-router-single.test.ts` 双保险。
2. **耗尽 Host 双选经 applyV2HostDecision 幂等 — 通过。** `applyHostDecisionToSession`（v2-deal.ts:271）→ `applyV2HostDecision`（v2-session.ts:554）：幂等键 = `sessionId::(cycle+1)`，`hostDecisions[key]` 已记录则直接重放（v2-session.ts:560-563），不重复清 used、不多加 cycle。UI 层 `hostBusy` 防连点 + `awaitingHostDecision` 门槛（page.tsx:117-135）。测试覆盖 finish（used/cycle 不变）、reshuffle（recent/Heat/MATCH/5 档保留、cycle=1、能再出卡）、同键重放×3 值恒定。
3. **降级提示不含男女字样 — 通过。** `NO_ELIGIBLE_PAIR_HINT = "本局将使用普通玩法"`（v2-participants.ts:21）；`PACK_EXHAUSTED_GUIDANCE` / `RELATIONSHIP_GLOBAL_EXHAUSTED_GUIDANCE` 亦无男女字样。测试断言 `not.toMatch(/男|女/)`，且 `pairGender` 只随当局 Session 走、不回写 Player 档案（v2-b8 test :174-177）。
4. **playwright.b7-tmp / b8-tmp 残留 — 确认应删（记入 Backlog，不阻塞）。** 两文件（根目录）头部自述「临时 E2E 配置（验证用，跑完即删）」，B7/B8 验证已完成，属收尾残留；均未跟踪、无任何引用，删除零风险。见 P2。

验证记录：`npx vitest run tests/unit/v2-b8-game-mainline.test.ts` → 11/11 PASS；`npx tsc --noEmit` → 0 错误。

## P2 / P3 Backlog Findings

- **P2**：删除 `playwright.b7-tmp.config.ts` 与 `playwright.b8-tmp.config.ts`（自述「跑完即删」，任务已完成；未跟踪文件，删前无需保留）。建议随 B8 收尾 neat-freak 一并清理。
- **P3**：`tests/unit/rejection-dedupe.test.ts`、`tests/unit/single-scale-source.test.ts` 仍从旧 `card-selector` 导入（经兼容再导出可用，非违规）；择机迁移到 `card-eligibility` 后，旧 selector 可缩为纯历史留档。
- **P3**：`HostExhaustionSheet` 弹出时，背景 `empty-deck` 区 h1「可玩的题都出完了」与弹窗内 h2 同文案重复（page.tsx:145 + HostExhaustionSheet.tsx:25）。轻微视觉冗余，不阻塞。
