# CODE REVIEW

- Task: V2-B6 Session 级编排器（relationship-aware 主链调用方集成，D8=A+ / D2 单 Router）
- Commit: 工作区未提交（HEAD b08ceb8，业务代码为 B6 新增脏区，验证对象即现状）
- Reviewer: code-reviewer
- Result: **PASS**

> Dispatch / Evidence ID 系字段 2.0 已废弃，不填。

## 审查范围与证据

- 源码：`lib/v2-relationship/v2-session.ts`（613 行，纯状态编排；import 仅 state/reducer/routing/guarantee/exhaustion 五个 V2 模块）。
- 测试：`tests/unit/v2-session.test.ts`（14 例，与任务声明范围一致）。
- 本机复跑：`npx vitest run tests/unit/v2-session.test.ts` → 14/14 过（vitest 3.2.7，exit 0）；`npx tsc --noEmit` → 0 错；`npx eslint lib/v2-relationship/v2-session.ts tests/unit/v2-session.test.ts` → 0 error。
- 对照口径：`docs/pm/PRODUCT_PLAN_V2.0-DRAFT.md` §H.4＋D8=A+、`docs/pm/V2-R5-ssot-gate.md` §6.2/§6.3（窗口与幂等键原文逐字核对）＋ `docs/review/CODE_REVIEW-V2-B5.md` 9 条给 B6 的建议。

## 逐项核验（B5 9 条建议落实情况）

| B5 建议 | 结论 |
|---|---|
| 1. 计数口径自己保证 | ✅ 三个层级计数全部来自 `V2RouterPort` 实现方（bucket/pack/global 直接取 `.length` 传 assess），编排器不重算过滤；口径契约写死在端口注释（v2-session.ts:72-76）与模块头（:14-15）。 |
| 2. 放宽流程顺序 | ✅ 从 `orchestration.softDedupWindow` 当前档起步，`widenDedupWindow` 逐级 5→0，首个非空窗口即停并记 `dedupWindowApplied`（:397-413）；初始值取 `SOFT_DEDUP_WINDOW` 真源不自己写 5；窗口随 Session 持久化，耗尽档落盘（:467-476，测试 3 验证残留 0）；AWAITING 保存/恢复从同一档继续。成功出卡后重置回 5（R5 §6.2「每次抽取先用窗口 5」，测试 2 验证）。 |
| 3. 救回仍走统一 Router | ✅ 救回路径仅把 `softDedupWindow` 参数降档重查 `router.bucket`，硬过滤/used/cooldown 一概不松，无第二套搜索逻辑。 |
| 4. PACK/GLOBAL 路径 | ✅ guidance 文案与建议逐字一致（:286-288）；两路径均不自动出卡、不 fallback，无 empty/error catch 里的旧 selector 入口（测试 11 grep 断言锁死）。 |
| 5. AWAITING 行为 | ✅ 暂停抽卡：重入直接返回同一等待态、零 Router 调用（测试 5 计数验证）；不自动洗牌/结束；状态纯数据可保存/恢复。 |
| 6. reshuffle 幂等键（P2 门禁） | ✅ **真防重放**，详见下节。 |
| 7. reshuffle 保留清单 | ✅ 只把 B5 返回的 `usedCardIds`/`exhaustionCycle` 写回 relationship，其余字段 spread 原封保留（:596-602）；测试 6 验证 recent(5 张)/Heat/MATCH/5 档 tracker（offered 终态）全保留。 |
| 8. 洗牌后回统一 Router | ✅ 洗牌纯状态变换无出卡动作；后续 `drawV2SessionCard` 自然走端口；reshuffle 后窗口重置 `SOFT_DEDUP_WINDOW`（:605）。 |
| 9. 只消费公开导出 | ✅ import 白名单=五 V2 模块（测试 11 逐条断言）；阶梯逻辑调 `widenDedupWindow` 不自写副本。 |

## P2 幂等键门禁专项复核

- 键真源：`hostDecisionKey(sessionId, resultingCycle)` = `sessionId::cycle+1`（:510-512），与 AWAITING 结果回传的 `idempotencyKey`（:491）同源同值。
- 账本：`orchestration.hostDecisions` 随 Session 持久化；首次应用写入决策结果（:608），同键重放命中即 `reconcileHostDecision` 复用记录、`replayed=true`，不重调 B5 `applyHostDecision`、不多清 used、不多加 cycle（:574-576）。
- 键不漂移：`hostDecisionRequest` 强制从 AWAITING 结果取决策前基线（:521-526），`applyV2HostDecision` 以该基线组键（:572, :583 注释说明口径对齐）；恢复/重放以「已应用结果态」为准。
- 重放测试齐备（B5 验收要求）：测试 7 覆盖 reshuffle 连续 3 次重放稳定在 cycle=1＋finish 重放幂等；保存恢复后重入同请求命中同一键（:289 注释场景）。
- 结论：**门禁成立**。B5 P2 转 B6 的门禁项关闭。

## 其他语义核验

| 核验点 | 结论 |
|---|---|
| D2 单 Router | ✅ 唯一出卡入口 `V2RouterPort`；不 import `lib/engine/card-selector`/旧权重路由/future deck（测试 11 四条 grep＋import 白名单双锁）。 |
| D8=A+ 主链顺序 | ✅ reducer→routing→guarantee→exhaustion→widen→五层级判定逐层命中（:348-494），与 B5 冻结链一致；三层皆空才交 Host。 |
| 禁回退 V1.6 | ✅ 同上；`require(`/`INTENSITY_WEIGHT`/`16:8:4:2:1` 断言齐。 |
| D7 保障语义 | ✅ match_created 建 pending seen=0（防覆盖已有 tracker，:177-192）；Intensity<5 → pause(intensity-below-five) 不消耗机会（测试 9b）；无合法 5 档 → pause(no-legal-five-card)；第 2 次合格机会传 `requireFiveTierForPair` 强制 5 档（测试 9）；present→offered 终态 / qualify→seen+1 达 2 转 offered，与 v2-guarantee 状态机逐条吻合；终态 tracker 不再推进。 |
| 纯状态编排 | ✅ 无 storage/DB/UI import；入参不就地修改（测试 1 断言）。 |
| widen 循环终止性 | ✅ `widenDedupWindow` 到 0 保持 0＋循环 `window===0` break，无死循环；startWindow 已为 0 时只查一次即出结果。 |

## P0 / P1 Findings

- P0：无。
- P1：无。

## P2 / P3 Backlog Findings

- **P2｜耗尽残留窗口 0 与 R5 §6.2「每次抽取先用窗口 5」字面偏差**：非 CARD 结局把放宽档持久化（PACK/GLOBAL_EXHAUSTED 后残留 0）。此后若**不洗牌**而外部条件变化（如按指引切换其他有卡玩法）再抽，`startWindow=0` 起步——第一张卡不受软去重约束，可能与 `recentCardIds` 内的卡重复（硬过滤 used/cooldown 仍生效，仅软去重缺口；需新包卡集与 recent 重叠才实际触发）。与 B5 rec#2「保存/恢复后从同一档继续」字面一致，但与 R5 §6.2「每次抽取先用窗口 5」在「耗尽后重试」场景冲突。建议：PACK/GLOBAL_EXHAUSTED 结局把窗口重置为 `SOFT_DEDUP_WINDOW`（仅 AWAITING 保留放宽档），或 B7 UI 集成时明确切包重试前置窗口为 5；补一条对应测试。
- **P2｜`applyV2HostDecision` 无状态门禁**：非 AWAITING 态下手工构造新基线的 reshuffle 请求（键未命中账本）会执行一次「凭空洗牌」（清 used＋cycle+1）。同一请求重放已防住（门禁成立），此为「伪造新键」的防御深度缺口——UI 集成（B7）只应在 AWAITING 时展示二选一并经 `hostDecisionRequest` 组装；建议本函数补「仅 AWAITING 态或账本命中才接受」校验。
- P3｜重放对已前滚状态有回滚效应：洗牌后继续打牌再重放旧请求，`reconcileHostDecision` 会把 usedCardIds/cycle 拉回决策刚应用时的值。属调用方误用（重放请求应来自当前基线），文档注释已声明，可接受。
- P3｜`fiveTierAvailable` 探测只用起始窗口（:374-377）：起始窗口下无 5 档但放宽后有时，判 pause(no-legal-five-card) 而非放宽找 5 档。保守取向，是否符合 D7「合格机会」在放宽窗口下的定义属产品语义，建议 B7 前与 Plan 对一次。
- P3｜`guaranteeAdvance` 单字段只报最后一事件：resume＋同回合 qualify/present 时 resume 被覆盖（tracker 状态本身已正确写回，仅报告字段近似）。

## 结论

**PASS**。B5 9 条建议逐条落实；P2 幂等键门禁真防重放（账本＋基线强制＋重放测试齐备，B5 转来的门禁项关闭）；禁回退 V1.6、D2 单 Router、D8=A+ 主链顺序、D7 保障推进均与冻结契约一致；14/14 测试过，typecheck/lint 0 错。P0=P1=0；2 条 P2 入 backlog（耗尽残留窗口语义、Host 决策状态门禁），不阻塞，建议随 B7 UI 集成一并处理。
