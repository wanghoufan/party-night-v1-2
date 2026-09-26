# CODE REVIEW｜Change B 复评第 1 单：B2a Coverage 接线 + B2b Single-Anchor Guard / D7 两层消解

- Task: Change B · B2a（R-CB5/R-CB8 Coverage 软排序接线）+ B2b（R-CB6/R-CB7 Single-Anchor Guard、Anchor Exposure、D7 两层消解）
- Commit: 未提交（工作区；HEAD 741e2e9，与本轮收口链其他任务改动混在同一工作区，本评审只看本单点名文件与段路）
- Reviewer: code-reviewer（codebuddy/glm-5.3-flash）
- Result: **过**（P0=0；blocking P1=0；P2×3、P3×2 记 backlog）

> 自测（只读，本机实跑）：`npx tsc --noEmit` 0 错；`pnpm vitest run` 99 文件 894/894 全绿（含新增 `tests/unit/v2-single-anchor.test.ts` 20 例 1055 行）；`pnpm lint` 0 error（7 条既有 warning，非本单引入）。

## P0 / P1 Findings

- 无。
- 逐条对照用户 V1.2 §三 blocking P1 七条口径：未发现死局（受控 bypass 有限步返回，⑧/⑧b 实证）；未触碰 D1～D8 冻结行为（见下七查与必查清单）；无隐私泄露新增面（`lastTargetedPairKey` 仅本地编排态，pairId 敏感度不高于既有 pairState/matches）；无安全过滤改动；无合法玩法被禁用/非法玩法进入（eligiblePair 与 minPlayers 路径一行未改）；不影响 Release Gate 可执行性；Single-Anchor/Coverage 硬 DoD 1–9、15 断言齐备且可证伪。

## 七查结论

| # | 查项 | 结论 | 证据 |
|---|---|---|---|
| 1 | DEV_BASELINE 一致 | ✅ 全部改动落在 CHANGE-B §四建议文件内，未越冻结契约 | 本单 diff 清单 |
| 2 | Requirement 覆盖 | ✅ R-CB5/R-CB6/R-CB7/R-CB8（本单部分）全落地；R-CB9~12 属 B3/B4 另单 | 见必查清单 |
| 3 | DoD 达成 | ✅ 硬断言 1–9、15 有对应测试且通过；10–14 属 B3 单 | v2-single-anchor/v2-routing/v2-session 测试 |
| 4 | Diff 越界 | ✅ 本单文件无越界；题库/safety-filter/route/矩阵 harness/版本号均未碰（工作区里 app/、ai/、矩阵文件的改动属其他单，另评） | git status/diff |
| 5 | 回归影响 | ✅ 空 Coverage 与改动前逐条一致（写死冻结序 FROZEN_ORDER_3x3 钉子）；普通桌三组 20 轮 Guard 恒 false | v2-routing.test.ts:141-156、v2-single-anchor.test.ts:847-891 |
| 6 | P0-P2 分级 | 见下方 backlog | — |
| 7 | 可回滚性 | ✅ Guard 为纯增量可选层：`requireNonTargetedOpportunity` 缺省=false、`lastTargetedPairKey` 可选带默认、`scorePair` 第 4 参缺省 0、`rankPairs` 第 5 参缺省 {}，回滚即整体还原，无 schema 迁移负担 | v2-session.ts:87、v2-state.ts:416/447、v2-routing.ts:69/116 |

## 必查清单逐条结论（12 条）

1. **冻结语义零破坏 ✅**：D1 内容真源未碰；D2 单 Router 未重写（Guard 只加可选输入位+薄调度层）；D3 双计数器（reducer 未改）；D4 `eligiblePair` 一行未改（v2-routing.ts:122 原谓词原样调用）；D5/MATCH、Consent、mutual 9/14/19 均不在本单触碰面；D6 事件表未动；D7 的 pending/paused→offered/expired 终态机与 `advanceGuarantee` 零改动（v2-session.ts diff 仅删了旧注释与 `selectTargetPair` 直调行，evaluateGuarantee/advance 逻辑原样）；D8 耗尽层级未动（仅 outcome 顺带回传 guard）。Heat 单调、`REL_CARD_*` 计数、minPlayers 全部原样。
2. **Coverage 只影响软排序 ✅**：候选 pair 集合与改动前逐条一致（`eligiblePair` 判定行未改，仅 endpoints 记录方式重写，迭代边界不变）；空表/缺人/幽灵 id 恒扣 0（v2-routing.ts:139 `?? empty`）；全表覆盖度一致时每 pair 扣同一常数、排序逐条不变（v2-routing.test.ts:141-156 实证）；扣分上界 `COVERAGE_MAX_PENALTY=0.4` < 最小非零 Signal 步长 0.5（scorePair 最小系数 smallPool-crowd 0.5），并有构造性反证测试（Signal 高 0.5 + 最差 Coverage 仍压过无 Signal 的 pair，v2-routing.test.ts:296-315）。
3. **无第二套 Fairness State ✅**：Coverage 消费只读既有 `relationship.playerCoverage` 四字段；`lastTargetedPairKey` 是单标量展示事实（编排态、非按人权重、不回写 RelationshipState），语义与 Coverage 解耦，测试有结构自证（v2-single-anchor.test.ts:1040-1055）。
4. **触发表与 null 处理 ✅**：`SINGLE_ANCHOR_TABLE` 显式两行（anchorCount=1 且 majority≥3）为唯一真源；`genderCounts` 只数 `active===true` 且 `pairGender` 已录入者，null 不计入、不猜测（v2-routing.ts:178-190）；1男1女/1男2女、2男2女/2男3女/3男2女/2男5女/5男2女/3男3女 均不触发，识别层+20 轮调度层双实证（v2-single-anchor.test.ts:346-427）；inactive 与 null 各有反证用例（误计即翻转）。
5. **Exposure 以展示为准 ✅**：`lastTargetedPairKey` 在 CARD 落地那一刻写（v2-session.ts:593），skip/completed 均不撤销（④ 实证）；skip 不制造 Signal（pairState/信号逐条不变，v2-single-anchor.test.ts:480-485）；skip 玩家 `consecutiveTargetedSkips+1` → 覆盖度上升让位，不会因"未完成"立即再集中（reducer :322-326 + 测试 v2-session.test.ts:560-568）。
6. **D7 两层消解真分层 ✅**：第一层 `scheduleTargetPair` 在进 tracker 判定**之前**决定本轮是否 pair opportunity；非定向轮 `targetPairKey=null` → tracker=null → 不 qualify、不 pause、pending 原样（⑥/⑦d/⑦e 实证「非定向轮 tracker 一格不动」）；第二层一旦真进 pair opportunity，`requireFiveTierForPair` 是 Router 硬过滤（两个生产 Router 均实现），优先于 Coverage/Signal——不是优先级覆盖写法，是调度层隔离。
7. **受控 bypass ✅**：常量精确等于 `"NO_LEGAL_NON_TARGETED_CANDIDATE"`（v2-session.ts:109，测试断言字面值）；`hasDrawableCard` 窗口 5→0 有限步，bypass 后照常走出卡/耗尽主链，6 连续轮+全空两种形态均有限步返回（⑧/⑧b）。
8. **schema 边界 ✅**：`RelationshipState` 字段集合一行未动（结构自证测试）；新增仅 `V2OrchestrationState.lastTargetedPairKey?: string|null` + zod `.nullable().optional()`（v2-state.ts:416/447）；恢复路径实测：旧记录缺字段 → `gameSessionSchema` 经 `z.custom` safeParse 通过、`orchestrationOf` 规范化为 null、Guard 不介入（v2-single-anchor.test.ts:994-1038 走真实 `migrateSessionRecord`）；`session-migration.ts` 未改、无需迁移。
9. **轮级口径偏差 → P2，不构成 P1**：独立判断见下 backlog ①。方向保守（只可能多触发 Guard、不可能漏触发：定向卡只能在 `targetPairKey!==null` 轮展示，轮级记录是卡片级真超集），不命中任何 blocking P1 条款，不违反 DoD 3/4，判 P2 backlog 由人拍板是否本期收窄。
10. **port 扩展兼容 ✅**：`requireNonTargetedOpportunity` 可选、缺省 undefined，两实现均 `=== true` 才收窄——缺省行为与改前逐条一致；生产 Router 实现共两个（`createV2MainlineRouter` v2-router.ts:81、`createDeckRouter` v2-deal.ts:89），无漏改，且有真实 SSOT 卡池上的双 Router 同口径测试（v2-single-anchor.test.ts:898-970，含"不带 flag 时确实更宽"的反证）。
11. **测试可证伪性 ✅（附两点 P3 备注）**：抽验 ⑤（三端点集合断言）、⑥（tracker 逐字段 toEqual）、⑦d（seen=1→非定向轮不动→present 三段链）、普通桌回归（`singleAnchorTable===false`+anchorTargeted===false+与排序首位逐轮一致）——均非自证循环：trace 的 anchorTargeted 由 cardId 前缀与 targetPairKey 独立推导，期望值不来自被测分支；7 组 fixture 实测 20 轮：4 组 Single-Anchor 桌 maxConsecutiveAnchorTargeted=1、定向/非定向 10/10 严格交替，普通桌 Guard 恒 false——若把普通桌也调成 Guard=true，`singleAnchorTable===false` 断言直接翻红，不存在蒙混通道。P3 备注见下。
12. **越界改动 ✅**：本单文件未触碰题库/safety-filter/route/矩阵 harness/docs/版本号；`package.json`/`public/` 无改动。

## P2 / P3 Backlog Findings

- **P2-①｜Exposure 轮级口径为卡片级真超集**：pair opportunity 轮内 Router 可能展示 all-players 卡（强度降序时强度更高的全桌卡在前，v2-router.ts:79/90），此时 `lastTargetedPairKey` 仍记该 pair → 下轮 Guard 可能"多"隔一轮。用户原文是「上一张已展示的 targeted card 包含 anchor」，builder 采用「本轮经 Pair Routing 进入 pair opportunity 即算 targeted」（测试文件头口径 1 已如实声明）。方向安全（只保守不漏保）、不破 D7（非定向轮不消耗）、不破硬 DoD；若要精确到卡需 Router 回传所出卡 targetMode（接口微扩）。建议：本期放行，记 backlog，RG-02 真人局观察节奏（20 轮里 pair opportunity 减半的体感）。
- **P2-②｜Coverage `offeredTargeted` 计数时机仍在终态**：reducer 只在 `REL_CARD_COMPLETED/SKIPPED` 写 offered（v2-reducer.ts:312-328，本单未改，v2-state.ts:412-413 已声明解耦）。R-CB5 原文「CARD_PRESENTED 即属于 offered opportunity」严格读下，swapped 轮已展示却不计 offered（usedCardIds 记了、coverage 记 0）。实际链路里"展示→终态→下一轮调度"串行，观察不到时序差，唯一实际偏差是连续换题玩家的覆盖度低估；且"不得同时在展示和终态加两次"约束下这是合规选法。建议：backlog，若后续要精确，统一由展示侧幂等写一次、终态只写 completed/skip 增量。
- **P2-③｜普通桌回归基线退化（测试强度备注）**：v2-routing.test.ts:318-338 的"不比无 Coverage 更集中"里，基线循环无状态、20 轮恒选同一 pair（minBase=0/maxBase=20），断言实际只剩 `maxWith<20`；分布公平性主要靠测试 ⑤ 三端点集合断言与 single-anchor 测试 ⑤ 承载。另 v2-single-anchor.test.ts:855 注释"改前口径"实际调用的是含 Coverage 的现版 `rankPairs`（两侧同源的一致性检查，非改动前对照）——真实改动前对照由 FROZEN_ORDER_3x3 写死序承担。不阻塞，建议后续把基线换成逐轮衰减的写死序列。
- **P3-①｜`lastTargetedPairKey` 随 Session 持久化**：内容为 pairKey（玩家 id 对），本地 IndexedDB 口径，敏感度不高于既有 `pairState/matches/cooldowns`；但 B3 评导出/日志负断言时请把该新字段一并纳入 R-CB10 检查面（当前不进 AI payload，无风险）。
- **P3-②｜跨单交叉风险提示**：`drawV2SessionCard` 的 outcome 四种耗尽形态新增必填 `guard` 字段，消费方 `app/game/page.tsx`（B 其他单）与 `awaitingHostDecision`（v2-deal.ts:416-441 已同步补齐）需在 QA 终审确认 UI 未把 `guard.applied/reason` 直接暴露给玩家文案（reason 是机器可读值，不应原样上屏）。

## 需人拍板

1. P2-① 轮级 Exposure 口径：本期放行记 backlog，还是要求 Router 回传所出卡 targetMode 收窄为卡片级（涉及 V2RouterCard 微扩）。
2. P2-② Coverage offered 计数时机（swap 低估）：维持现状记 backlog，还是安排一次终态→展示的单点迁移。
3. 单 Anchor 桌 20 轮里 pair opportunity 减半（10 定向 + 10 非定向交替）的产品节奏是否接受——RG-02 真人局前建议用户过目该分布。
