# CODE REVIEW

- Task: V2-B5 耗尽控制器（Exhaustion Controller，D8=A+，纯函数）
- Commit: 工作区未提交（HEAD b08ceb8，业务代码为 B5 新增脏区，验证对象即现状）
- Reviewer: code-reviewer
- Result: **PASS**

> Dispatch / Evidence ID 系字段 2.0 已废弃，不填。

## 审查范围与证据

- 源码：`lib/v2-relationship/v2-exhaustion.ts`（85 行，纯函数，唯一 import `./v2-state`）。
- 测试：`tests/unit/v2-exhaustion.test.ts`（9 例）。
- 本机复跑：`npx vitest run tests/unit/v2-exhaustion.test.ts` → 9/9 过（vitest 3.2.7，exit 0）。
- 对照口径：`docs/pm/PRODUCT_PLAN_V2.0-DRAFT.md` §H 候选池耗尽策略（Human D8=A+ 冻结链）＋ `docs/qa/BUGS-V2-B5.md` 全量放行证据（lint 0 error／typecheck 0 错／全量 627 tests 过）。

## 逐项核验

| 核验点 | 结论 |
|---|---|
| assessExhaustion 五层级判定优先级 | ✅ 先桶（bucket>0→BUCKET_OK）→ 软去重放宽救回（widenedAvailable>0→BUCKET_EMPTY）→ 包（pack>0→PACK_EXHAUSTED）→ 全局（global>0→RELATIONSHIP_GLOBAL_EXHAUSTED）→ 三层皆 0 交 Host。逐条命中即返回，与 D8=A+ 冻结链逐层一致（v2-exhaustion.ts:41-45）。 |
| widenDedupWindow 阶梯 | ✅ 5→4→3→2→1→0；`current<=0` 保持 0（不回弹不出负）；`Math.min(current, SOFT_DEDUP_WINDOW)` 封顶 5（异常大值按上限处理，9→4）。SOFT_DEDUP_WINDOW=5 与 v2-state.ts 真源一致，无第二套常量。 |
| applyHostDecision(reshuffle) | ✅ 仅清 `usedCardIds`、`exhaustionCycle+1`；`recentCardIds`/Heat/Coverage/Signals/MATCH/cooldown/5 档 tracker 完全不触（返回值不含 recentCardIds，调用方快照原封不动）——与 Plan §H.3「洗牌只清普通 usedCardIds」吻合。 |
| applyHostDecision(finish) | ✅ 原样返回，两字段均不变，不做任何清理。 |
| 纯函数 | ✅ 两函数均不修改入参（测试含就地不变断言）。 |
| 禁回退 V1.6 | ✅ 源码不 import `lib/engine/card-selector`／任何旧 selector／旧权重路由；测试用 grep 式断言＋import 白名单（仅 `./v2-state`）双重锁死，防后续改动回流。 |
| 测试覆盖 | ✅ 五层级各 1 例＋widen 阶梯含 0/负数/超上限边界＋reshuffle（清 used/保 recent/cycle+1/不改入参/连续两次各 +1）＋finish＋禁回退断言，共 9 例，与任务声明范围逐条吻合。 |

## P0 / P1 Findings

- P0：无。
- P1：无。

## P2 / P3 Backlog Findings

- **P2｜reshuffle 幂等完全依赖调用方**：模块本身不防重放——同一快照重复调 `applyHostDecision(s,'reshuffle')` 会多清一次、多加 cycle。文档注释已声明「幂等键由调用方按 `sessionId + exhaustionCycle + 1` 组装」，属约定而非代码保障；B6 落地时必须在持久化前落幂等键（Plan §H.4 硬要求「重放不得多次清除或多加 cycle」），验收时补重放测试。非本模块缺陷，记为 B6 门禁项。
- P3｜`finish` 分支返回的 `usedCardIds` 与入参共享同一数组引用；若调用方后续就地改写返回值会波及原快照。纯函数自身无变异，可接受；若调用方要做 freeze/persist，建议自行浅拷贝。
- P3｜`assessExhaustion` 不校验负数计数（如 bucket=-1 不会误判 BUCKET_OK，但三层皆负会落到交 Host）。入参为内部代码计算的计数，信任调用方即可，无需在纯函数内加边界校验。
- P3｜测试未覆盖「bucket>0 且 widenedAvailable>0 时 BUCKET_OK 优先」的组合（当前实现正确，仅覆盖缺口，非缺陷）。

## 给 B6 调用方的建议（逐条）

1. **计数口径自己保证**：传给 `assessExhaustion` 的 `hard.bucket/pack/global` 必须是「通过全部硬过滤后仍可出的卡数」（capability／Intensity-Heat／boundary-current consent／target-pair-MATCH／used／硬 cooldown），控制器只信数字不算数；`widenedAvailable` 是「放宽软去重窗口后仍可出的卡数」。不要指望控制器替你重算过滤。
2. **放宽流程顺序**：桶空时先走 `widenDedupWindow` 阶梯（5→4→…→0），每降一级重数一次桶内可出卡；一旦有卡即以该 `widenedAvailable>0` 调 assess 得到 `BUCKET_EMPTY`，在放宽后的窗口下正常出卡；阶梯走到 0 仍无卡才传 `widenedAvailable=0`，让 assess 继续判 PACK_EXHAUSTED／GLOBAL／Host。窗口当前值要随 Session 持久化（保存/恢复后从同一档继续），初始值用 `SOFT_DEDUP_WINDOW`（=5），不要自己写 5。
3. **`BUCKET_EMPTY` 救回的卡仍走 V2 统一 Router**：放宽窗口只移除 recent 约束，硬过滤、used、cooldown 一概不松；同 Heat 内只许向较低且仍合法档位搜索，永不越权高档、被禁边界、未 MATCH 的 5 档。
4. **`PACK_EXHAUSTED`／`RELATIONSHIP_GLOBAL_EXHAUSTED` 路径**：按 Plan §H.3 分别提示「本玩法本局已玩完，可切换其他有卡玩法」／继续收敛；两条路径的兜底出卡都只能进 V2 统一 Router，任何 empty/error catch 里禁止 fallback 到 `lib/engine/card-selector`、旧权重、自动 AI 补题。Pack 不得自建第二套回退。
5. **`AWAITING_HOST_EXHAUSTION_DECISION` 行为**：暂停抽卡但 Session 可保存/恢复；不自动洗牌、不自动结束。Host 只能选「结束本局」（`finish`）或「洗牌再玩」（`reshuffle`），选完调 `applyHostDecision`。
6. **reshuffle 幂等键（P2 门禁）**：持久化前必须按 `sessionId + (exhaustionCycle + 1)` 组装幂等键去重，保证重放不多清一次 usedCardIds、不多加一个 cycle——模块不防重放，这层漏了就是 Plan §H.4 违约。
7. **reshuffle 后保留清单**：`recentCardIds`（Session 级最近 5 张，按 `CARD_PRESENTED` 记录）、Heat、Coverage、Signals、MATCH、cooldown、5 档保障 tracker 全部原样保留；只清 relationship-aware 普通 `usedCardIds`。返回值不含 recentCardIds 是有意设计，调用方持有的快照即真源。
8. **洗牌后回 V2 统一 Router**：用清空后的 usedCardIds＋保留的 recent/cooldown 状态重新走正常出卡链，不得把洗牌当作旧 selector 的入口。
9. **只消费公开导出**：`assessExhaustion`／`widenDedupWindow`／`applyHostDecision`＋两个类型；不要从本模块外引内部细节，也不要在模块外复制阶梯逻辑（现有测试已用 import 白名单锁死本文件，调用方新增逻辑请写自己的测试）。

## 结论

**PASS**。五层级判定、软去重放宽阶梯、Host 决策应用、禁回退 V1.6 四项均与 D8=A+ 冻结契约一致，9/9 测试过，QA 全量放行证据齐备。P0=P1=0；1 条 P2（reshuffle 幂等依赖调用方）转 B6 实现门禁，3 条 P3 入 backlog 不阻塞。
