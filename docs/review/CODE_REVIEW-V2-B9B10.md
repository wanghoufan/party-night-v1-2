# CODE REVIEW

- Task: V2-B9 私密互选 UI + V2-B10 事件归约 联合复核
- Commit: 工作区未提交 diff（builder 通道 codebuddy）
- Reviewer: code-reviewer（独立审查上下文）
- Result: **过（PASS）**——P0=0，无阻塞 P1；2 条 P2 backlog 与 2 条 P3 记录在案，均不影响本任务收束。

## 审查范围与证据

- 文件：`components/game/MutualCheckSheet.tsx`、`lib/v2-relationship/v2-mutual-check.ts`、`lib/engine/v2-deal.ts`（R3 归约层 §B10）、`lib/v2-relationship/v2-reducer.ts`（`applyPlayerExit` / `applyPlayerTemporarilyAway`）、`tests/unit/v2-mutual-check.test.ts` + `mutual-check-sheet.test.tsx` + `v2-b10-event-reduce.test.ts`。
- 关联上下文：`lib/v2-relationship/v2-private.ts`、`v2-participants.ts`、`v2-state.ts`、`app/game/page.tsx`（B9/B10 接线）。
- 测试实证：`vitest run` 三文件 **44/44 PASS**（19+16+9，本地实测）。

## 六项对照结论

| 对照项 | 结论 | 证据 |
|---|---|---|
| D5 上限 2，只拦超限方 | ✅ | `mayCreateMatch`（v2-reducer.ts:120）原子校验双方 active MATCH 数；同 run 内超限 pair 被拦、其余 pair 照常成 MATCH（测试「只拦超限的那一方」）；被拦 pair 在公开结果里零痕迹（不含 pairKey/玩家 id/原因文案）。UI 公布前 finalize 过滤一次、reducer 落盘前复核一次，同口径复用无第二套规则。 |
| 单向秘密纯内存零持久化 | ✅ | `v2-private.ts` 不 import 任何 storage/DB；`MutualCheckSheet.tsx` 无 localStorage/indexedDB/URL/日志写入；单向选择只写 `PrivateMutualRun.selections`（内存对象），finalize 先出公开结果再 `clearPrivateRun` 清零、mask 关闭；取消/身份不符走 `clearMutualCheckRun`，不留痕。测试含源码正则审计 + Storage/IDB spy 双重验证。 |
| 跳过无惩罚 | ✅ | 跳过 = `submitMutualChoice(run, id, null)` → 全 pair 记 null，不产生任何惩罚字段、不进结果、不进事件；UI 跳过直达 MASKED，公开页无「跳过/未选」提示（测试断言 `queryByText(/跳过|未选|未提交/)` 为 null）。 |
| R3 双计数器口径唯一 | ✅ | `RELATIONSHIP_EFFECTIVE_CARD_EVENT_TYPES` 锁死 `[REL_CARD_COMPLETED]`（测试断言等值）；`eventForRoundTerminal` 是唯一事件工厂（按 packId 判族，不按文案/动作推导），`reduceRelationshipEvent` 是唯一计数入口；REL completed 推 effective/Heat，skip/swap/NEUTRAL/EXPANSION 一律 +0 不消耗 20/25 限额；eventId 幂等 + ref 终态互斥双保险（同轮重放/冲突均有测试）。 |
| 退出释放 / 暂离不释放 | ✅（函数层） | `applyPlayerExit` 原子删含该玩家的 pairState/cooldowns/matches 三边 + 保障进 `expired`（`expired-player-exit`）→ `countActiveMatches` 立即下降、名额可再建（测试断言 `mayCreateMatch` 翻 true）；`applyPlayerTemporarilyAway` 不删任何边、MATCH/cooldown/signal 全保留 → D5 名额不释放、保障 `paused` + 计数保留。不含该玩家的边原样保留，均不碰计数/Heat。 |
| 检查点 9/14/19 可达 | ✅ | REL_CARD_COMPLETED 是 effective 唯一推进源 → `MUTUAL_CHECK_COUNTS=[9,14,19]` 逐点触发测试通过；四道门（剩余轮次≥2 / 整局≤3 次 / 间隔≥5 / dueCount 合法）在 `mutualDueGates` 单点定义，mutual 触发判定直接复用 reducer 导出（测试用源码断言禁止第二套口径）；未加玩时 19 不触发（剩余轮次门）符合预期；21–25 无第四检查点。`/game` 页面 effect 实际接线（`app/game/page.tsx:106-117`）。 |

## P0 / P1 Findings

- 无 P0。
- 无阻塞 P1。

## P2 / P3 Backlog Findings

- **P2｜`applyPlayerExit` / `applyPlayerTemporarilyAway` 生产无调用点**：全仓 grep 仅 reducer 定义 + 测试引用；`updatePlayers`（session-engine.ts）改 `active` 时不触发任一函数。现状等价于「一切按暂离处理」：真离场玩家的 MATCH 永久占用 D5 名额、fiveGuarantees 永远 pending。含其 pair 因 active 过滤不参与调度，无玩法破坏、无隐私泄漏，故不阻塞本任务；但 R4 §4.3 退出语义的落盘接线（退出 UI / 事件）须在后续任务落实，若本就该在 B10 交付请 TM 澄清范围。
- **P2｜已互选成 MATCH 的 pair 再次互选会在结果页重复公布**：`finalizeMutualCheckRun` 里 `mayCreateMatch` 对已存在 pairKey 直接返回 true（v2-reducer.ts:125），该 pair 会再进公开 matches；reducer 端 `alreadyMatched` 去重不重复建 MATCH/cooldown，无数据问题，但 UI 会把旧 MATCH 当「互选成功」再公布一次。建议 finalize 增加过滤 `relationship.matches[key] === undefined`（跨 run 间隔 ≥5 的门槛使该场景低频）。
- **P3｜session 上限触顶时 completed 事件整体丢弃且不记终态**：`reduceRelationshipEvent` 在 `session_limit_reached` 分支返回原 state，eventId/terminalExclusivity 均未落盘，该轮之后理论上可再接受不同终态事件。当前无重放旧轮终态的路径，影响极低。
- **P3｜取消互选后该检查点整局不再重弹**（页面 `mutualShown` 注释已声明「取消不重弹」为有意行为）：取消不计常规互选次数符合规格，仅提示产品侧确认「静默跳过该检查点」是预期体验。

## 回归影响与可回滚性

- B10 归约是纯增量：`reduceResolvedRound` 只动 `relationshipState`/`v2Orchestration`/used 账，`currentRound` 原样保留，旧 Session（无 relationshipState）按初始态归约，原样可玩。
- B9 面板独立挂载、关闭即卸载清内存，不影响既有出卡/耗尽/Host 决策链路。
- 无 schema 破坏、无迁移需求；回滚 = revert 对应 commit 即可。
