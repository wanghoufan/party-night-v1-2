# CODE REVIEW

- Task: V2-B2 复核（lib/v2-relationship/v2-state.ts + v2-reducer.ts + 单测 33 项 + schemas 增量扩展）
- Commit: 未提交（工作区复核）
- Reviewer: code-reviewer（codebuddy/glm-5.3-flash）
- Result: 打回（FAIL，必须修项 8 条；骨架正确，语义缺口集中在 mutual 调度 / MATCH 上限 / extension 触发 / 事件表副作用）

> Dispatch / Evidence ID 系字段 2.0 已废弃，不填。

## 复核范围与基线

- DEV_BASELINE：PRODUCT_PLAN_V2.0（R3 事件表冻结节、R4、R5、DoD）。
- 实测：`pnpm vitest run tests/unit/v2-reducer.test.ts tests/unit/v2-relationship-state.test.ts` → 33/33 PASS（17+16，与派工单"33 项"一致）。
- SSOT 实测：`lib/v2-content/generated/v2-ssot.generated.json` 的 `runtimeRules` 含 coverageGate/drawBands/heatProgression/mutualCheckScheduler 等 10 键，**无 R3 §六冻结的 `effectiveCardCounting` 块**。
- 逐维结论：终态互斥 PASS｜幂等 PASS（有结构欠账）｜Heat 阈值 PASS｜旧 Session 可读 PASS｜D3 常量数值 PASS｜事件表全行语义 FAIL｜mutual due 与抑制 FAIL｜MATCH 上限 FAIL。

## P0 / P1 Findings（必须修）

1. **P1｜EXPANSION_CARD_COMPLETED 错误触发 extension_activated**（v2-reducer.ts:171-174；测试 v2-reducer.test.ts:62-68、79-85 固化了错误行为）。R3 §三.3：+5 加玩仅由 Host 在 `sessionCompletedRounds=20` 结算点显式选择，`maxExtensions=1`。扩圈卡完成只是普通 gameplay 事件（事件表 Side-effect 列仅"记录 expansion used ID"），与加玩无关。必须改为专用事件（如 SESSION_EXTENSION_ACTIVATED）或引擎入口，删除本分支并改测试。
2. **P1｜Session 上限 25 未区分 extensionActivated**（v2-reducer.ts:147-156）。未加玩时上限应为 20（§三.2"默认在 20 后进入结束选择"；§三.3 未加玩不得越过 20）。现实现未加玩也放行 21–25。应改为 `extensionActivated ? 25 : 20` 封顶。
3. **P1｜D5 MATCH 上限 2 完全未实现**（v2-reducer.ts:190-212）。Plan E.7：创建新 MATCH 前必须原子校验双方 active MATCH 数均 `<2`；达上限以中性 no-action 收尾、不泄露达上限方。现实现只查同 pairKey 去重，无 per-player 计数。需遍历 `matches` 统计双方 active 数并拒绝超额。
4. **P1｜REL_CARD_SKIPPED / REL_CARD_SWAPPED 的 cardId 未进 usedCardIds**（v2-reducer.ts:158-164）。事件表明文：skipped"cardId 进入 used"、swapped"旧 cardId 进入 used，防止立即重现"。现仅 completed 写 used。
5. **P1｜playerCoverage 全行副作用缺失**（v2-reducer.ts 全文；state 定义了 PlayerCoverage/createEmptyPlayerCoverage 但 reducer 从不写入）。事件表：REL completed 应 `offered+1/completed+1`，skipped 应 `offered+1/completed+0` 并可记 low-participation（连续 skip 阈值 2）。且 RelationshipEvent 缺少 coverage 归属 playerId 字段，需补事件字段。Coverage Gate 与 final mutual 资格依赖此数据，缺了后续链路全是空中楼阁。
6. **P1｜SYSTEM_MUTUAL_CHECK_DUE 调度语义不符冻结口径**（v2-reducer.ts:177-188）。三处缺口：①不校验 dueCount 属于 `MUTUAL_CHECK_COUNTS=[9,14,19]` 的下一档（现任意 dueCount 可入，间隔≥5 即放行）；②缺 `targetSessionCompletedRounds - sessionCompletedRounds >= 2` 门槛（常量 MINIMUM_REMAINING_SESSION_ROUNDS_FOR_REGULAR_MUTUAL 定义了但从未使用）；③缺 `regularMutualCheckRuns<=3` 整局上限（SSOT mutualCheckScheduler.maxRegularRuns=3）。"每个阈值最多一次"的抑制现用"间隔<5 近似"，对冻结节奏碰巧兼容，但不是冻结口径。
7. **P1｜cooldown 只设不清**（v2-reducer.ts:206-211）。MATCH 后 cooldown 设 5，但全 reducer 无任何递减路径（应随关系有效卡推进消耗），等于永久冷却，后续该 pair 永久不可调度。
8. **P1｜R3 常量违反 R5.5"禁止手抄"条款**（v2-state.ts:14-51 全部常量）。Plan §六明文：本节常量必须进入新受控 JSON 冻结快照并重签 SHA256 后才可成为运行真源，"在此之前禁止从本文手抄常量进业务代码"。现 generated SSOT 无 `effectiveCardCounting` 块，v2-state.ts 常量即手抄自 Plan prose。需把 §六 JSON 块物化进受控快照（重签 hash、更新 provenance），代码从生成物读取或加 gate 测试逐值比对，二者取一，由 TM 定实施口。

## P2 / P3 Backlog Findings

- `processedEventIds` 为无界 string[]（v2-state.ts:233、v2-reducer.ts:118/138），R3 §二.3 冻结要求"有界 processedEventIds（或等价去重结构）"；且 `.includes` O(n)。需定有界结构与淘汰策略（淘汰不得弱化终态互斥覆盖）。
- 组合事件 `NEUTRAL/EXPANSION_CARD_SKIPPED_OR_SWAPPED` 缺 `terminal` 字段时静默变 no-op（terminalOf 返回 null，不落互斥、不计数），后续同 ref completed 仍可入账，互斥被绕过。应在 schema/engine 层强制要求 terminal 字段。
- `REL_CARD_COMPLETED` 无 `ref` 时仍计数（互斥按 type 推导 terminal，不依赖 ref），违反 §二.1"每次展示生成稳定 interactionId"的精神；engine 层应拒绝无 ref 的终态事件。
- `matchedAt` 兜底 `"1970-01-01T00:00:00.000Z"` 哨兵值（v2-reducer.ts:200）建议改必填或拒绝无 timestamp。
- `recentCardIds`（D8=A+ 软去重窗口）当前无任何事件维护它，CARD_PRESENTED 也不在事件表内——需明确归属（engine 展示钩子或新增事件），否则 SSOT 字段成死数据。
- matches 无"active/撤销/退出释放"建模（E.8），属后续 engine 任务，此处仅记不阻塞 B2 本身。

## PASS 项（证据）

- 终态互斥：eventId 先查 → ref 互斥后查（v2-reducer.ts:118-131），首终态落盘后其余拒绝；纯函数（重放测试断言 `toBe` 引用相等）。
- 幂等：重放零副作用、`replayed` 标记正确（测试 12/13/14）。
- Heat：0–3/4–7/8–12/13+ 绝对阈值、单调、只看 relationshipEffectiveCardCount，与 SSOT `heatProgression.openEndedEffectiveCards` 数值一致（测试 1–3）。
- 旧 Session 可读：schemas.ts 增量 optional `relationshipState/participants`，旧 Session parse 测试通过（测试 16）；pairGender 非法值规范化 null 不报错。
- D3 常量数值全对：fixed-20-plus-5/20/5/1/25/9,14,19/5/2/2/5（测试 4–7）。
- session_limit_reached 提前返回返回原 state，未污染幂等集合，语义安全。

## 改法与回归要求

- 修 1–7 后：新增/改写单测覆盖——①扩圈 completed 不触发 extension、专用事件触发且仅一次；②未加玩时第 21 轮 completed 被拒；③双方各 1 个 MATCH 时第三个对新建 pair 被拒且无泄露语义（delta 不含 match_created）；④skip/swap cardId 入 used；⑤coverage offered/completed/low-participation 三态；⑥dueCount 非 9/14/19 被拒、剩余轮次<2 被拒、第 4 次 run 被拒；⑦cooldown 随有效卡递减至 0。
- 修 8 由 TM 决定实施口（SSOT 物化 vs gate 比对测试），涉及 hash 重签须过 v2-ssot-gate 测试。
- 完成后门禁：lint0/typecheck0/全量 unit，返工派续同链。

## 复验附录（P1×8＋P1×2返工，reviewer复验PASS）

- 前4项（Host事件/20-25上限/D5原子校验/skip-swap入used）与后4项中的coverage+playerId/cooldown递减已验证落地，单测36→29→29全过。
- P1×2收尾（swap收窄仅写used、cooldown仅REL completed递减＋NEUTRAL反断言）复验PASS，593全过，lint0/typecheck0。
- 结论：P1×8＋P1×2全闭合，B2可放行。
