# V2 R3｜`effectiveCardCount` 事件表冻结

> 状态：FROZEN  
> 决策：Human D3=A  
> 适用范围：V2.0 relationship-aware Session 计数、Heat 与 mutual check 调度  
> 规范优先级：本表是 R3 的唯一执行口径；Builder 不得按交互文案、页面动作或历史实现自行推导计数。

## 一、唯一计数事件表

| 事件 | 生效条件 | 是否计入 `effectiveCardCount` | Delta | Coverage / used / 状态副作用 | Heat / mutual 影响 |
|---|---|---|---:|---|---|
| `REL_CARD_COMPLETED` | relationship-aware 普通卡已展示且完成 | **计** | `+1` | 合格定向卡 `offered +1`、`completed +1`；`cardId` 进入 used | 唯一可推进 Heat、20/25 回合上限与常规 mutual interval 的卡事件 |
| `REL_CARD_SKIPPED` | relationship-aware 普通卡已展示后跳过 | **不计** | `+0` | 合格定向卡 `offered +1`、`completed +0`；`cardId` 进入 used；可记 low-participation | 不推进 Heat，不推进常规 mutual interval，不消耗 20/25 限额 |
| `REL_CARD_SWAPPED` | 换题并放弃已展示卡 | **不计** | `+0` | `offered/completed` 均 `+0`；旧 `cardId` 进入 used，防止立即重现 | 不推进 Heat，不推进常规 mutual interval，不消耗 20/25 限额 |
| `NEUTRAL_CARD_RESOLVED` | neutral pack 完成、跳过或换题 | **不计** | `+0` | 不改 Relationship Coverage；只更新 neutral 自身历史 | Relationship Engine 暂停；不推进 Heat/常规 mutual interval，不消耗 20/25 限额 |
| `EXPANSION_CARD_RESOLVED` | expansion 原版或 table-only 版执行、跳过 | **不计** | `+0` | 不改 Pair/Coverage/Signal；记录 expansion used ID | 不推进 Heat/常规 mutual interval，不消耗 20/25 限额 |
| `LEGACY_CURRENT_RESOLVED` | 升级时已展示的旧 current card 完成或跳过一次 | **不计** | `+0` | 不建 V2 Signal/Coverage；标记 legacy consumed；之后必须进入 V2 Router | 不推进 Heat，不推进常规 mutual interval，不消耗 20/25 限额 |
| `SYSTEM_MUTUAL_CHECK_*` | `due/start/submit/complete/cancel/final` 任一系统互选事件 | **不计** | `+0` | 不进入 `usedCardIds`；只更新 scheduler 与 mutual 结果 | 不直接推进 Heat；系统事件本身不得再次触发常规 mutual interval |
| `EVENT_REPLAYED_OR_DUPLICATE` | 恢复时重放同一 `eventId`，或双点、重试、重复提交 | **不计** | `+0` | count、Coverage、used、scheduler 及其他副作用全部 `+0` | 完全幂等，不推进 Heat，不重复触发任何 mutual check |

补充冻结：`CONSENT_*`（`request/submit/intersection/no-action`）同样不计，Delta=`+0`；不改 Coverage/used，不推进 Heat 或 mutual interval，partial 只保留在内存。

## 二、终态互斥与恢复幂等

1. 每次展示生成稳定 `interactionId`；每个终态事件携带唯一 `eventId`。
2. 同一 `interactionId` 只能接受 `completed`、`skipped`、`swapped` 三种终态之一；首个合法终态落盘后，其余终态一律视为重复事件，Delta=`+0`。
3. reducer 必须先检查持久化的有界 `processedEventIds`（或等价去重结构），再在同一事务内写入 count、Coverage、used 与 scheduler。
4. 页面刷新、崩溃恢复、离线恢复、消息重投、按钮双击或重复提交均不得重复计数，也不得重复产生任何副作用。
5. 只有首次处理的 `REL_CARD_COMPLETED` 可以令 `effectiveCardCount +1`；不存在由 UI 回合数、抽卡数、展示数或系统事件反推有效回合的第二口径。

## 三、D3=A：固定 20＋可再玩 5 个有效回合

1. V2.0 唯一模式为 `fixed-20-plus-5`。
2. Session 创建时冻结 `baseEffectiveCardLimit=20`；默认在第 20 个有效回合完成后进入结束选择。
3. Host 可结束，或仅一次开启 `extensionEffectiveCardLimit=5`；`maxExtensions=1`，整局最大 `25` 个有效回合。
4. 加玩开启后不得再次加玩；第 25 个有效回合完成后不再接受新的 relationship-aware 普通卡完成事件。
5. 提前结束不得补写或伪造 completed，不得强升 Heat；仅在其他资格合法时执行 final mutual check。
6. skipped、swapped、neutral、expansion、legacy、system、consent 与恢复重放事件均不消耗 20/25 限额。

## 四、Heat 绝对阈值锁

Heat 只由首次合法处理的 `REL_CARD_COMPLETED` 后的 `effectiveCardCount` 决定：

| Heat | `effectiveCardCount` |
|---|---:|
| `H1` | `0–3` |
| `H2` | `4–7` |
| `H3` | `8–12` |
| `H4` | `13+` |

- Intensity 1～5 仅代表用户允许的内容上限，不等于 Heat。
- Heat 使用绝对阈值，不按 20 或 25 重新计算比例。
- 开启加玩不重算、不回退 Heat；第 21～25 个有效回合保持 `H4`。
- 未计数事件不得改变 Heat。

## 五、第 9/14/19 个有效回合互选节奏锁

1. 常规 mutual check 分别在 `effectiveCardCount` 首次达到 `9`、`14`、`19` 后标记 due。
2. 每个阈值最多触发一次，整局最多三次常规 mutual check；恢复重放不得重复触发。
3. 第 20 回合结束选择与加玩 5 回合不新增第四个常规 mutual check。
4. Session 实际结束时仍执行 final mutual check；final 是独立系统事件，不与 9/14/19 中任一常规事件合并或去重。
5. 提前结束时只可在其他资格合法的前提下执行 final mutual check；不得通过 final 事件补足 `effectiveCardCount` 或推进 Heat。

## 六、Pair Routing Score 公式、归一化与 3 组 fixture（R3-01）

### 6.1 计算域与公式

1. 每次路由先执行 consent、参与状态、性别/目标要求、暂离/退出与硬 cooldown 过滤，得到当次合法无向 pair 集合 `E_t`。Score **只在 `E_t` 内排序**，不得覆盖或复活任何硬过滤结果。
2. 对任一 `e ∈ E_t`，定义：
   - `c_e`：本 Session 内该 pair 已完成的 `REL_CARD_COMPLETED` 数；其他事件不得写入。
   - `C_e`（Coverage）：若 `c_max = c_min`，则 `C_e = 1`；否则 `C_e = (c_max - c_e) / (c_max - c_min)`。`c_min/c_max` 只在当次 `E_t` 内求值，因而 `C_e ∈ [0,1]`，覆盖越少值越高。
   - `S_e`（Signal）：`S_e = (min(shared_e, 4) + min(compatibility_e, 4)) / 8`，因而 `S_e ∈ [0,1]`。Crowd/Personal 不进入 pair Signal，不建 MATCH。
   - `D_e`（软 cooldown）：该 pair 是上一个成功分配的 pair 时取 `1`；其后恰有 1 个其他 pair 已分配时取 `0.5`；已有至少 2 个其他 pair 或本局从未分配时取 `0`。硬 cooldown 仍先行，软 cooldown 不代替硬过滤。
3. 普通模式冻结权重为 `wC=0.60`、`wS=0.25`、`wD=0.15`，原始式为 `raw_e = wC·C_e + wS·S_e - wD·D_e`；对外排序分为 `R_e = clamp01(raw_e + wD)`。因 `wC+wS+wD=1`，`raw_e ∈ [-0.15,0.85]`，故 `R_e ∈ [0,1]`。
4. 受控 JSON 的普通权重校验上下界为：`wC ∈ [0.55,0.75]`、`wS ∈ [0.10,0.30]`、`wD ∈ [0.10,0.20]`、三者和必须为 `1.00`；V2.0 实际运行值仍锁定为 `0.60/0.25/0.15`，Builder 不得在边界内自行调参。
5. 排序键固定为：`R_e` 降序 → `c_e` 升序 → 上次分配时间升序（从未分配最早）→ `sessionSeed + canonicalPairId` 的稳定 hash 升序。禁止用无种子随机数破平局。

### 6.2 三组最小 fixture

| Fixture | 合法候选输入 | 期望分数/顺序 | 必须成立的断言 |
|---|---|---|---|
| `FX-R3-01-A_EQUAL_START` | `AB/AC/BD` 均为 `c=0,S=0,D=0` | 三者均 `C=1,R=0.75`，按稳定 hash 破平局 | 同 seed 重放顺序一致；不因数组输入顺序改变 |
| `FX-R3-01-B_COVERAGE_BEATS_SIGNAL` | `AB:c=3,S=1,D=0`；`CD:c=0,S=0,D=0` | `AB:C=0,R=0.40`；`CD:C=1,R=0.75`；`CD > AB` | 已满信号 pair 不得垄断；最少覆盖 pair 先出 |
| `FX-R3-01-C_COOLDOWN_ROTATES` | `AB/AC` 均 `C=0.5,S=0.5`；`AB:D=1`、`AC:D=0` | `AB:R=0.425`；`AC:R=0.575`；`AC > AB` | 即使 Signal/Coverage 相同，刚分配的 pair 也不得再获得优先权 |

## 七、`eligiblePairCount ≤ 6` 小池降权（R3-02）

1. `eligiblePairCount = |E_t|`，以所有硬过滤执行后、Score 排序前的当次合法 pair 数为唯一口径。当 `|E_t| ≤ 6` 时立即触发 `smallPoolSignalDownweight=true`；`|E_t|=0` 不进入评分，直接走第九节降级。
2. 小池降权系数锁定为 `k=0.50`：`wS'=0.25×0.50=0.125`，被减掉的 `0.125` 全部转入 Coverage，得 `wC'=0.725`、`wD'=0.15`。小池公式为 `R_e=clamp01(0.725·C_e+0.125·S_e-0.15·D_e+0.15)`。
3. 触发立即生效；恢复须连续两次完整路由决策均观测到 `|E_t| ≥ 7`，第二次决策起恢复普通权重。任一次回落到 `≤6` 即重置恢复计数器，防止暂离/回席造成来回抖动。
4. 多 MATCH 竞争 fixture `FX-R3-02-MULTI_MATCH`：当次 `E_t` 共5条边，`AB/AC/DE` 均已达 MATCH；输入分别为 `AB(C=0,S=1,D=0)`、`AC(C=0.5,S=0.8,D=0.5)`、`DE(C=1,S=0.6,D=0)`。预期 `R_AB=0.275`、`R_AC=0.5375`、`R_DE=0.95`，固定顺序 `DE > AC > AB`。断言：MATCH 仅提升合法候选内的 Signal，不得越过 Coverage、硬 cooldown 或任何硬过滤。

## 八、四库 Signal cap、封顶行为与防锁死（R3-04）

| Signal 库 | 计分 cap | 封顶后行为 | 衰减规则 | Pair/MATCH 权限 |
|---|---:|---|---|---|
| `shared` | `4` | 对 Score 的贡献截断在 4；溢出证据仍追加原始审计记录，**不停记** | 连续 5 个 `effectiveCardCount` 无该 pair 新 shared 证据时，计分值 `-1`，下限 0；每再满 5 回合重复 | 可进入 `S_e`，可支撑 MATCH |
| `compatibility` | `4` | 对 Score 的贡献截断在 4；溢出证据仍记录，**不停记** | 连续 5 个有效回合无该 pair 新 compatibility 证据时 `-1`，下限 0 | 可进入 `S_e`，可支撑 MATCH |
| `crowd` | `3` | 仅对 crowd 内容适配分截断在 3；溢出证据仍记录，**不停记** | 连续 4 个有效回合无新 crowd 证据时 `-1`，下限 0 | 禁止进入 `S_e`，禁止建 MATCH |
| `personal` | `3` | 仅对 personal 内容适配分截断在 3；溢出证据仍记录，**不停记** | 连续 4 个有效回合无新 personal 证据时 `-1`，下限 0 | 禁止进入 `S_e`，禁止建 MATCH |

实现必须分开 `rawEvidenceLog` 与“当前计分值”：cap 只截断计分贡献，不丢原始证据；衰减只减当前计分值，不删历史。衰减钟只由首次合法处理的 `REL_CARD_COMPLETED` 推进，未计数事件不得触发衰减。

防锁死必测断言：

1. 普通模式中，最少覆盖 pair 相对最多覆盖 pair 的最小净优势为 `0.60 - 0.25 - 0.15 = 0.20 > 0`；小池模式为 `0.725 - 0.125 - 0.15 = 0.45 > 0`。因此即使前者 Signal 最低且 cooldown 最高、后者 Signal 封顶且 cooldown 为 0，只要两者均在 `E_t` 中，完全未覆盖 pair 仍必须排在已最多覆盖 pair 前。
2. `FX-R3-04-CAP_NO_LOCK`：连续 10 次给 `AB` 追加 shared/compatibility 证据后，计分值必须仍为 `4/4`，原始证据数可为 `10/10`；当 `AB:c=3,D=0`、`CD:c=0,D=1,S=0` 时，预期 `R_AB=0.40`、`R_CD=0.60`，`CD` 必胜。
3. 任一 Signal 到 cap 后不得锁定 pair、不得跳过 cooldown、不得把 Crowd/Personal 折算进 MATCH；在无新证据的衰减窗口后，计分值必须严格下降。

## 九、四局型 pair 边数、最小 fixture 与不死锁断言（R3-06）

> pair 为无向边，`canonicalPairId=min(playerId)+":"+max(playerId)`。下表的“全边”是仅考虑 active 玩家时的 `n(n-1)/2`；“跨 M/F 边”只是题目明确要求 M/F 定向时的 `m×f`。其他 consent/参与/cooldown 硬过滤会继续减少 `E_t`。

| 局型 fixture | active 构成 | 全边数 | 跨 M/F 边数 | 最小可枚举集合 | 预期模式 |
|---|---:|---:|---:|---|---|
| `FX-R3-06-A_4P` | `2M+2F` | `C(4,2)=6` | `2×2=4` | 全边：`AB,AC,AD,BC,BD,CD`；跨 M/F：`AC,AD,BC,BD` | 中性路由与 M/F 定向路由均触发小池降权 |
| `FX-R3-06-B_5P` | `3M+2F` | `C(5,2)=10` | `3×2=6` | 跨 M/F：`AD,AE,BD,BE,CD,CE` | 中性路由 `10` 不触发；M/F 定向 `6` 触发小池降权 |
| `FX-R3-06-C_4M1F` | `4M+1F` | `C(5,2)=10` | `4×1=4` | `AE,BE,CE,DE` | M/F 定向有4条可选边，必须轮换，不得把唯一 F 与某一 M 锁死 |
| `FX-R3-06-D_1M4F` | `1M+4F` | `C(5,2)=10` | `1×4=4` | `AB,AC,AD,AE` | M/F 定向有4条可选边，必须轮换，不得把唯一 M 与某一 F 锁死 |

四组 fixture 共享以下必测断言：

1. 从 active 玩家集合直接枚举无向边后做硬过滤，不得用“随机抽中后拒绝再重试”的无界循环。对任一固定快照，`selectPair(snapshot)` 必须在 `O(|E_t|)` 内返回一条边或明确降级结果。
2. active 人数变化后立即重算边集和 `eligiblePairCount`。若已选 pair 在展示前因暂离/退出失效，废弃该选择，不写 `offered/used/cooldown/effectiveCardCount`；基于新 `participantSetVersion` 重新调度。旧版本调度必须取消，不得与新版本互等。
3. `4M1F` 的唯一 F 或 `1M4F` 的唯一 M 暂离/退出时，M/F 定向边必须从 `4` 变为 `0`并返回 `NO_ELIGIBLE_PAIR`。另外，当题目要求同一目标性别的两名不同玩家而 active 目标性别仅剩1人时，返回 `SINGLE_TARGET_GENDER`。两种结果均立即路由到 neutral/table-only 安全降级，不得等待离席者回席。
4. 暂离者回席后可在下一次路由重新进入边集；已退出者本 Session 永久排除。暂离/退出事件本身均不计 `effectiveCardCount`、不推进 Heat/mutual。
5. 并发暂离/退出时，旧快照计算必须可取消；每个 `participantSetVersion` 最多提交一个路由结果。当前版本 `E_t=0` 时必须立即降级，这是暂离/退出不死锁的验收条件。

## 十、Runtime 冻结值

```json
{
  "runtimeRules": {
    "effectiveCardCounting": {
      "countedEventTypes": ["REL_CARD_COMPLETED"],
      "terminalEventExclusivity": true,
      "idempotencyKey": "eventId",
      "mode": "fixed-20-plus-5",
      "baseEffectiveCardLimit": 20,
      "extensionEffectiveCardLimit": 5,
      "maxExtensions": 1,
      "heatThresholds": {
        "H1": [0, 3],
        "H2": [4, 7],
        "H3": [8, 12],
        "H4": [13, null]
      },
      "mutualCheckCounts": [9, 14, 19],
      "neutralAdvances": false,
      "expansionAdvances": false,
      "legacyAdvances": false,
      "systemEventsAdvance": false
    },
    "pairRouting": {
      "coverageNormalization": "inverse-min-max",
      "scoreNormalization": "weighted-shift-clamp-0-1",
      "normalWeights": {
        "coverage": 0.6,
        "signal": 0.25,
        "cooldown": 0.15
      },
      "normalWeightBounds": {
        "coverage": [0.55, 0.75],
        "signal": [0.1, 0.3],
        "cooldown": [0.1, 0.2],
        "sum": 1
      },
      "softCooldownPenalty": {
        "lastAllocatedPair": 1,
        "oneOtherPairSince": 0.5,
        "twoOrMoreOtherPairsSince": 0
      },
      "smallPool": {
        "eligiblePairCountMax": 6,
        "signalMultiplier": 0.5,
        "coverageWeight": 0.725,
        "signalWeight": 0.125,
        "cooldownWeight": 0.15,
        "recoveryConsecutiveDecisionsAtOrAbove7": 2
      },
      "signalCaps": {
        "shared": 4,
        "compatibility": 4,
        "crowd": 3,
        "personal": 3
      },
      "signalDecayEveryEffectiveCardsWithoutEvidence": {
        "shared": 5,
        "compatibility": 5,
        "crowd": 4,
        "personal": 4
      },
      "matchSignalLibraries": ["shared", "compatibility"],
      "scoreNeverOverridesHardFilters": true
    }
  }
}
```

本节常量必须进入新的受控 JSON 冻结快照并重签 SHA256 后，才可成为 DEVELOP 期运行真源；在此之前禁止从本文手抄常量进业务代码。
