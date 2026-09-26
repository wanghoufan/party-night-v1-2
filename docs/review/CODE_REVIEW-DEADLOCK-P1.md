# CODE REVIEW

- Task: P1 两人局 pointing-game/most-likely 耗尽死局修复（minPlayers 按在场人数收口 + 耗尽兜底三出口）
- Commit: 工作区未提交改动（基线 HEAD 741e2e9）
- Reviewer: code-reviewer（codebuddy/glm-5.3-flash）
- Result: 过

> Dispatch / Evidence ID 系字段 2.0 已废弃，不填。

## 评审范围与验证记录

- 范围：app/setup/page.tsx、app/game/page.tsx、app/globals.css、lib/engine/pack-switcher.ts、lib/engine/session-engine.ts（generationSource 部分属 AI 直连链，不在本单深评）、lib/engine/v2-deal.ts、tests/unit/pack-switcher.test.ts、tests/e2e/pack-min-players.spec.ts（新）、tests/e2e/session-current-pack-recovery.spec.ts。tests/mac、tests/phone、docs/qa 矩阵域另一链在跑，只读未评；lib/ai/*、app/generating 等属 AI 直连链（已有 CODE_REVIEW-AI-GEN-STABILITY 覆盖），未越界。
- 抽验：`pnpm typecheck` PASS；`npx vitest run tests/unit/pack-switcher.test.ts` 18/18 PASS。未跑 e2e 全量、未碰设备、未发 AI 请求、未 commit。
- 越权检查：`git status` 确认 lib/game-packs/ 零改动（pointing-game/most-likely 契约 minPlayers=3 原样，most-likely.ts:5 / pointing-game.ts:15）；未碰 secrets；无 commit。

## 五项重点核验结论

1. 用户修复原则合规：minPlayers 契约未改成 2（game-packs 零 diff）；normalize/safety-filter 未放宽（lib/ai/generate-deck.ts 属 AI 链未触碰）；过滤口径全部按 **active** 玩家数（pack-switcher.ts:35/48-49、setup/page.tsx:64-65、game/page.tsx:209、listSwitchablePacks 原有 activePlayerCount:53/77）。
2. 拦截完整性：五条路径全收口——首页玩法卡→`/setup?pack=…` 由 setup 拦（packMinPlayersNotice，pack-switcher.ts:45）；setup 直选 `next()` 双保险（return 守卫 page.tsx:78 + CTA disabled :107）；quickStart 按**上次名单**单独复核（:67、:81）；mixed candidate 按 active 人数收口（:64-65）；局内切换沿用既有 listSwitchablePacks 门槛（pack-switcher.ts:79），随机启动器 pickLauncherTarget 也带 activePlayerCount（:93）。文案「至少需要 N 人（当前在场 M 人）」清晰，提示内带「返回首页换个玩法」出口（setup/page.tsx:100）。
3. 耗尽兜底：deck=0 时 `reshuffleWouldRevealCard` 判空转后不再渲染 HostExhaustionSheet（「洗牌再玩」按钮 count=0，e2e 已断言），改给切换玩法/结束本局/返回首页三出口（game/page.tsx:208-210）；reshuffle 模拟与真实出卡链**同口径**——模拟 `applyHostDecisionToSession("reshuffle")`（清 used/cycle+1/解除 awaiting，v2-deal.ts:443）后走 `drawDeckCard`，preferredPackIds/enabledPackIds/cardTypes 与真实 `hostDecision("reshuffle")`→`startRound`（game/page.tsx:176、session-engine.ts:109-121）逐参一致（single: [currentPackId]/[currentPackId]；mixed: [currentPackId]/config.enabledPackIds），hard 资格判定同一 Router，不会误判可救为不可救；模拟是纯函数不落盘、不消耗幂等键。耗尽分支的 `shortfall ?? NO_RECOVERABLE_CARDS_GUIDANCE` 兜住「人数够但尺度/雷区滤光」的情形，三条出口与 legacy session（无 v2Orchestration 时 awaiting 不成立）走的是原有 214/215 行出口，可达性未回退。
4. 测试质量：pack-min-players.spec.ts 4 例全为真断言（URL 停留 setup、CTA disabled、notice 文案含人数、出口链接可点回首页、3 人正例真进生成页并断言 `.pointing-game` 渲染且 `.empty-deck` 不出现）；session-current-pack-recovery 1 例按新语义改（洗牌按钮 0 计数+三出口可见）而非删，另新增 2 例：结束本局→summary+status=finished 真断言、「牌堆有未用卡时洗牌救回」反例防误杀（used-up deck 点击洗牌后回正常主局）。

## P0 / P1 Findings

- 无。

## P2 / P3 Backlog Findings

- P2｜app/game/page.tsx:208｜`reshuffleWouldRevealCard(session)` 直接写在渲染体里，每次重渲染都完整模拟一次洗牌+试抽（structuredClone+全量 Router），awaiting 态下 toast/开关切换等任意 setState 都会重算。建议包 `useMemo`（依赖 session）。不拦 RC：当前牌堆 ≤40 张成本可忽略。
- P2｜app/setup/page.tsx:67-68｜quickStartNotice 复用 packMinPlayersNotice 文案，「当前在场 N 人」中的 N 实为**上次名单**的 active 人数，与「当前在场」字面语义有偏差，玩家可能误解。建议给 quick-start 场景一句独立措辞（如「上次名单仅 N 人」）。不拦 RC：拦截行为本身正确（next() 仍按当前人数放行，:78）。
- P3｜tests/unit/pack-switcher.test.ts｜`reshuffleWouldRevealCard` 无纯函数单测（两态仅靠 e2e 覆盖），后续 engine 重构时缺一层快速回归网。建议补空 deck=false / used-up=true 两条。
- P3｜app/game/page.tsx:210｜三出口中「返回首页」不落 finish、无确认，误触即离开（靠首页 resume 兜底）；与既有 214 行耗尽分支模式一致，记录不要求改。

## 可回滚性

- 改动集中在 5 个业务文件+3 个测试文件，`git checkout -- <files>` 即可整体回退；无 schema 破坏性变更（generationSource 为可选字段，属 AI 链同批）。
