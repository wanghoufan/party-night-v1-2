# CODE REVIEW

- Task: P2-01 / P2-02 整改复核（roster 三分语义 + mutual 过滤顺序 + reducer 幂等）
- Commit: 工作区未提交（lib/v2-relationship/、lib/engine/v2-deal.ts 为新增未跟踪文件）
- Reviewer: code-reviewer
- Result: **过（PASS）**

> Dispatch / Evidence ID 系字段 2.0 已废弃，不填。

## 复核范围与结论

四个检查点逐条核验：

### 1. diffPlayerRoster 三分语义（lib/v2-relationship/v2-participants.ts:97-116）✓

- 旧名册有、新名册无 → `exited`；两边都在且 active true→false → `away`；false→true → `returned`。
- 新增玩家（旧名册无）不产生任何迁移；改名/改 lastUsedAt 无迁移。口径唯一，未把 `active=false` 一刀切。
- 集合互斥（同一 playerId 只能落一个桶），遍历顺序稳定，纯函数幂等。

### 2. applyPlayerRosterChange（lib/engine/v2-deal.ts:268-289）✓

- 唯一落盘入口：exited → `applyPlayerExit`，away → `applyPlayerTemporarilyAway`，returned 不额外归约（资格由参与者投影重算，保障沿 `resume` 从暂停点继续）。
- 参与者投影同事务按新名册重建（active 以新名册为准），离开者随名册消失退出 pair pool。
- 计数（effective/Heat/轮次）不动，符合 R4 §4.3/§4.4。

### 3. EXIT 终止语义（lib/v2-relationship/v2-reducer.ts:170-184）✓

- `applyPlayerExit` 原子删除含该玩家的全部边：pairState（signal）/ cooldowns / matches（`withoutPlayerEdges`，不含该玩家的边原样保留）。
- 相关 5 档保障进终态 `expired` + `terminalReason="expired-player-exit"`；offered/expired 已是终态不回写、不降级（expireGuarantee:149-153）。
- D5 释放：删 MATCH 即 `countActiveMatches` 下降，名额立即可再建。✓

### 4. AWAY 暂停语义（lib/v2-relationship/v2-reducer.ts:193-201）✓

- `applyPlayerTemporarilyAway` 只动 fiveGuarantees：仅 pending → `paused` + `pauseReason="player-away"`（pauseGuarantee:156-160，已 paused 保留原计数、终态不动）。
- pairState / cooldowns / matches 一律不碰 → D5 名额不释放（第三人不得顶上）。✓

### 5. finalizeMutualCheckRun 过滤顺序（lib/v2-relationship/v2-mutual-check.ts:166-180）✓

- 顺序正确：先 `relationship.matches[key] !== undefined → continue`（:173，已 MATCH 不进本次公开结果），**后** `mayCreateMatch` D5 cap 校验（:175）。
- 若顺序颠倒，已 MATCH pair 会因 `mayCreateMatch` 对已存在 pair 返回 true（幂等语义，v2-reducer.ts:125）而误入公开面——现顺序规避了此坑。
- 单向未成的 pair 不进结果；finalize 后立即 `clearMutualCheckRun` 清空全部单向数据；公开结果按 pairKey 排序，确定性输出。

### 6. mayCreateMatch 幂等未破坏（lib/v2-relationship/v2-reducer.ts:120-130）✓

- 已存在 pair 返回 true（不重复建、不误拦）；新 pair 双方 active MATCH 数均 < 2 才放行。
- reducer 侧（:368-394）：`alreadyMatched` 先判，已 MATCH 不重建；cooldown 用 `Math.max(cur, 5)` 只升不降 → 重放幂等。
- eventId 幂等集合（:249）+ 终态互斥（:257）未受影响；`mutualCheckFinalEvents` 的 `${runId}::match::${pairKey}` 事件键重放安全。
- reducer 对每条事件按累计后的 `next.matches` 原子复核 D5 → 即使公开面多列，权威态也不会超限。

### 测试证据

- `npx vitest run tests/unit/v2-mutual-check.test.ts tests/unit/v2-reducer.test.ts tests/unit/v2-private.test.ts` → **3 文件 60 用例全过**（2026-09-26）。

## P0 / P1 Findings

- 无。P2-01（roster 三分语义）与 P2-02（mutual 过滤顺序 + 幂等）整改到位，无阻塞项。

## P2 / P3 Backlog Findings

- （P3）`finalizeMutualCheckRun` 依赖「每人每 run 只选一人」保证单 run 内不出现共享玩家的多 MATCH；这是 `submitMutualChoice`（只写一个 target）隐式保证的。若未来放开多选，需在 finalize 内对已 push 的 pair 做累计 cap 校验。当前无缺陷，仅备忘。
- （P3）`mayCreateMatch` 对已存在 pair 返回 true 的语义与「cap 校验」的字面职责略有出入，依赖调用方（finalize :173 / reducer :374）各自先判 alreadyMatched。已有注释说明，保持现状即可。
