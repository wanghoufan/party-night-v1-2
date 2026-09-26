# PRODUCT_PLAN｜Party Night V2 Relationship Engine

- Plan Version：`PRODUCT_PLAN_V2.0-DRAFT.3`
- PROJECT_PHASE：`PLAN`
- CHANGE_REQUEST：`C｜核心抽卡、Session 关系状态与内容真源升级`
- DEV_BASELINE：`NOT_SET`；Human Gate 前禁止建立
- 输入基线：当前生产 V1.6 brownfield + `docs/content/v6/2026-09-24 - MAC - ChatGPT - Party Night V1.3冻结基线-备份 - V1.1.zip` 内 V1.3 Frozen（schema 2.3）
- 文档状态：Planner Draft.3 PlanConsistency 收敛稿；R1=`PASS`（冻结包内部一致性前置证据）；P0-01=`CLOSED / PASS`（生产旧 350 ↔ V1.3 Frozen 350 外部机器审计）；R2=`PASS AFTER PATCH`（31/31 PASS）；R4/R5 复审=`PASS`（计划契约层关闭，实现证据转 DEVELOP 必过门禁）。Human 已决 D3=A、D4=A、D7=A、D8=A+；D1/D2/D5/D6 保持 `TBD`。当前只允许规划与审查，不授权 Builder、业务代码修改或 Release

## PlanConsistency｜DRAFT.3 六项收敛结论

1. **P0-01 证据纠偏**：P0-01 唯一关闭证据改为 `docs/content/v6/2026-09-25 - MAC - ChatGPT - Party Night V2 P0-01生产350对V1.3审查包-附件 - V1.2/`内的审查报告、机器证据 JSON 与双向矩阵；结论为自动内容等价 ID 映射 `NONE`，旧卡仅 `history-only`，C01–C06 全部纳入迁移契约。R1 仅保留为冻结 Markdown ↔ 冻结 JSON 内部一致性的前置证据，不再代表 P0-01。
2. **D7/D8 已决**：D7=`A`，合法 5 档卡 `CARD_PRESENTED` 即视为 offered；D8=`A+`，固定软去重 5、`5→4→3→2→1→0` 逐步放宽、仅 Host 显式选择洗牌、永不回退 V1.6 Router。全文禁止再写 D7/D8 TBD。
3. **R2/R3 双计数器单一口径**：`sessionCompletedRounds` 只管 Session 20+5 结算边界，任意玩法的 completed 轮（含 neutral/expansion）都 `+1`；`relationshipEffectiveCardCount` 只有 completed relationship-aware 卡 `+1`，且是 Heat 与 regular mutual interval 的唯一计数器。neutral/expansion “不消耗”只指不消耗关系有效计数，不是不消耗 Session completed round。
4. **Final mutual 抑制单一口径**：final 是独立的 Session-end 系统事件，但不是无条件强制执行；只在 H3+、Coverage Gate 通过、存在合法 pair，且距上次 mutual 至少 `minimumEffectiveCardsBetweenRuns=5` 个关系有效卡时执行。刚完成 regular mutual 则 final 视为已覆盖并抑制；被抑制不补计数、不补 MATCH、不建 5 档保障。
5. **契约关闭 ≠ 实现已验证**：R4 复审 PASS 关闭私密遮罩/清理/不公开/one-off 隔离的 Phase1 契约；R5 复审 PASS 关闭 D7/D8、单 Router、迁移原子性与 SSOT 契约。IndexedDB/log/export/cache 否定测试、旧 selector 不可达、CAS 回滚、哈希及状态机 fixture 全部转为 DEVELOP 门禁，不再统计为 Phase1 blocking P1。
6. **Human 真实拍板状态**：D3=A、D4=A、D7=A、D8=A+ 已决；D1/D2/D5/D6 无 Human 拍板证据，明确为 `TBD`。影响分别为：D1 阻止内容真源切换授权；D2 阻止 V2 Router 生产切换授权；D5 阻止将每人 active MATCH 有效上限固定为 1 或 2；D6 阻止将 neutral/expansion 的关系推进策略写入 DEV_BASELINE。

## Product Goal

在不重做四 Tab、单设备主持、local-first、PWA、Game Pack 与 Session 基础设施的前提下，把核心 7 类玩法从“旧 350 题硬编码＋固定牌堆＋强度陡坡抽取”升级为由本地 Relationship Engine 驱动的完整关系流程：

**公平破冰 → 共同点/偏好 → 主动选择 → 群体观察 → 系统秘密互选 → MATCH → pair 专属 5 档 → 当场同意 → 安全收尾。**

产品不替玩家判断“谁喜欢谁”，不把拒绝设计成失败；算法只安排更合适的互动机会，并确保单向秘密选择不泄露、不持久化、不上传。

## Target Users

1. 4～5 名成年人在酒吧、清吧、聚会空间进行单桌社交游戏；由一名 Host 使用一台手机主持。
2. 希望从轻松破冰自然进入更深入互动，但不接受强迫、公开羞辱、灌酒惩罚或未经同意身体接触的玩家。
3. 需要离线可玩、无需账号、无需多人手机、无需云端关系图的临时聚会用户。
4. 现有 V1.6 用户：已有玩家、氛围、开放度、玩法与进行中 Session 不能因升级被破坏或清空。

## Problem

当前生产与 V1.3 Frozen 之间不是“同一批 350 题换个抽法”，而是存在内容、元数据、数据结构和运行机制四层差异：

1. R1 已证明 V1.3 冻结基线内 `01–07` Markdown 350 题与 `10-卡片元数据.json` 350 条内部一致；P0-01 外部机器审计另行证明生产旧 `seed-*` 350 与 V1.3 `PN-*` 350 在同序号题面、同玩法任意位置题面上的 normalized exact 均为 `0/350`，词面近似度 ≥0.55 为 `0/350`，同序号档位改变 `254/350`。因此自动内容等价 ID 映射必须为 `NONE`，同类序号仅是审计坐标，不是 migration map。
2. 生产 `lib/engine/card-selector.ts` 仍使用 `INTENSITY_WEIGHT={1:1,2:2,3:4,4:8,5:16}`；V1.3 要求 Heat、Coverage、Pair、Signal、MATCH、Consent 参与逐轮动态路由，旧 selector 不能双跑。
3. 生产 `Player` 当前只有 `id/displayName/active/createdAt/lastUsedAt`。Human D4=A 已决定：V2.0 在本局参与者上增加最小 `pairGender=male|female`，默认只生成男女 pair；无合法 pair 时降级为普通玩法，不运行 Pair/MATCH/5 档。禁止根据姓名、顺序或模型猜测。
4. Human D3=A 已决定：采用双计数器。`sessionCompletedRounds` 由任意玩法的 completed 轮推进，管理默认 20 轮与一次 +5 轮的 Session 结算边界；`relationshipEffectiveCardCount` 仅由 completed relationship-aware 卡推进，管理 Heat 与 mutual interval。Heat 锁定为 `0–3 / 4–7 / 8–12 / 13+`且单调不降；20 轮结算点先选“结束 / 再玩 5 轮”，+5 后重新评估第三次 regular mutual，不回退 Heat。
5. V1.3 Frozen 明确扩圈 40/40 的 `fallbackPolicy=switch-to-table-version`。DRAFT.3 已把规范性 T037 统一为 `switch-to-table-version`，并冻结 40/40 table-only 映射；v6 历史文档仅作审计记录，不再是 V2 执行口径。
6. Human D7=A 已把 5 档保障冻结为“2 次合格 pair opportunity 内展示 1 张合法 5 档”，`CARD_PRESENTED` 即进入 `offered` 终态；无合法卡、Intensity 下调、cooldown、暂离不消耗机会，退出/边失效/Session end 才 `expired`。
7. Human D8=A+ 已把耗尽冻结为 `BUCKET_EMPTY -> PACK_EXHAUSTED -> RELATIONSHIP_GLOBAL_EXHAUSTED -> AWAITING_HOST_EXHAUSTION_DECISION`；软去重窗口按 `5→4→3→2→1→0` 放宽，全局硬合法集仍空时才由 Host 选“结束 / 洗牌再玩”，且洗牌不得回退 V1.6 Router。

因此当前不能直接建立 DEV_BASELINE：Phase1 契约层已无 blocking P1，但仍需 Human Gate 拍板 D1/D2/D5/D6，并需 Research Reviewer 对本次 P0-01＋PlanConsistency 合并稿做最终一致性复审；所有代码级证据保留为 DEVELOP 必过门禁。

## Core Value

1. **自然推进**：Heat 只到 H4，5 档属于具体合法 pair，不把整桌推入高强度。
2. **公平而不锁死**：系统先提供参与机会；skip 算 offered opportunity、不算 completed interaction，也不阻断别人。
3. **只放大真实信号**：Shared / Compatibility / Crowd / Personal / Mutual 分离；只有秘密双向选择形成 MATCH。
4. **拒绝安全**：跳过不罚、不解释；具体动作每次重新同意；无交集即 no-action。
5. **本地隐私**：秘密单向边仅存在于当次内存流程，计算后删除；Session 结束清理关系图与 MATCH。
6. **可验证迁移**：V1.3 JSON 是目标内容真源，但必须先完成生产 350 ↔ V1.3 逐卡差异矩阵，再决定替换、映射与历史兼容。

## User Flow

1. Host 在现有“组局”流程选择玩家、关系、氛围、开放度 1～5、雷区与玩法；V2 不新增底部 Tab。
2. 创建 Session；初始化 `relationshipState`，Heat=H1，signals/matches/cooldowns/保障状态为空。
3. 进入 relationship-aware 主线时，Router 依次执行：pack capability → Intensity 上限 → Heat 硬过滤 → target/pair 合法性 → card metadata/边界/同意合法性 → Coverage/Cooldown → drawBand → 随机选卡。
4. H1/H2 保证足够定向机会；玩家可完成、跳过或换题。skip 只改变机会/低参与统计，不制造 signal。
5. 满足统一 Heat 计数、H3 与 Coverage 条件后，系统进入 `SYSTEM_MUTUAL_CHECK`：逐人传手机、确认身份、私密选择、提交遮罩。
6. 只公布 A↔B 的共同结果；单向结果计算后立即清除。同一玩家是否允许多个 MATCH 由 Human Gate 决定。
7. 合法 MATCH 且全局开放度=5 时，启动该 pair 的 5 档保障窗口；每张具体动作仍执行 current consent。
8. 切到 neutral pack 时关系推进暂停、状态不丢；切回继续。扩圈按统一 table-only fallback 执行，默认不进入 Heat/Pair/MATCH。
9. Session 结束前运行 final mutual check；结束后清除 Relationship Graph、MATCH 与所有私密临时态。
10. 候选池耗尽时严格走已批准的耗尽策略，不回退旧 selector、不越权放高档、不静默联网补题。

## Functional Scope

### A. 内容真源与逐卡迁移

1. V1.3 Frozen `10-卡片元数据.json`（350）与 `10b-扩圈元数据.json`（40）是 V2 内容与运行参数的唯一候选 SSOT；精确 archive member 路径与 hash 门禁见「Data / API → JSON SSOT 与 Hash Gate」。实现前不得直接覆盖生产题库。
2. **R1｜PASS（2026-09-25，不重跑，仅作前置证据）**：V1.3 冻结基线的 `01–07` 七套 Markdown 350 题与 `10-卡片元数据.json` 350 条一一对应；cardId、题面、档位、gameType/number、18 个逐卡必填字段、schemaVersion 2.3、Heat 边界、5 档解锁、Signal 与 Consent 约束全部通过，异常 `0`，冻结 SHA256 清单 `18/18 PASS`。
   - 报告：`docs/content/v6/2026-09-25 - MAC - ChatGPT - Party Night V2 R1逐题对账报告-附件 - V1.1.md`
   - 逐题 CSV：`docs/content/v6/2026-09-25 - MAC - ChatGPT - Party Night V2 R1逐题对账矩阵-附件 - V1.1.csv`
3. **P0-01｜CLOSED / PASS（2026-09-25）**：生产旧 `seed-*` 350 ↔ V1.3 Frozen `PN-*` 350 双向审计已完成；两边均为 7 类×50，双向坐标 orphan=`0`，同序号 exact=`0/350`，同玩法任意位置 exact=`0/350`，字符 bigram Jaccard ≥0.55=`0/350`，最大相似度仅 `0.2857`，同序号档位改变 `254/350`。
   - 审查报告：`docs/content/v6/2026-09-25 - MAC - ChatGPT - Party Night V2 P0-01生产350对V1.3审查包-附件 - V1.2/2026-09-25 - MAC - ChatGPT - Party Night V2 P0-01生产350对V1.3审查报告-附件 - V1.2.md`
   - 机器证据：`docs/content/v6/2026-09-25 - MAC - ChatGPT - Party Night V2 P0-01生产350对V1.3审查包-附件 - V1.2/2026-09-25 - MAC - ChatGPT - Party Night V2 P0-01生产350对V1.3机器证据-附件 - V1.2.json`
   - 双向矩阵：`docs/content/v6/2026-09-25 - MAC - ChatGPT - Party Night V2 P0-01生产350对V1.3审查包-附件 - V1.2/2026-09-25 - MAC - ChatGPT - Party Night V2 P0-01生产350对V1.3双向矩阵-附件 - V1.2.xlsx`
   - U1 抽查回执（2026-09-25）：V1.2 外部包的审查报告 `.md`、机器证据 `.json`、双向矩阵 `.xlsx` 三件均存在；报告与机器证据抽查一致：同序号 exact／同玩法任意位置 exact／bigram≥0.55 均为 `0/350`，最大相似度 `0.2857`，同序号档位改变 `254/350`。
4. **P0-01 唯一 migration policy（六条）**：①自动内容等价 ID 映射=`NONE`；②同类序号仅是审计坐标，不得视为等价映射；③旧 ID/旧题面仅为 RoundHistory 历史展示保留；④旧 `usedCardIds` 不得按类别/序号翻译为 `PN-*`；⑤active legacy current card 最多中性 completed/skip 一次，不写 V2 Heat/Signal/Coverage/MATCH/5 档计数；⑥旧 future deck 丢弃，新回合只从 `PN-*` SSOT 经 V2 Router 产生。
5. **P0-01 conflicts C01–C06**：C01=内容全量重写；C02=ID namespace 从 `seed-*` 全换为 `PN-*`；C03=`254/350` 同序号档位重分层；C04=旧 GameCard 缺少 schema 2.3 关系路由元数据；C05=active legacy current 只能一次性 neutral 收尾；C06=旧 selector/future deck 与 V2 Router 互斥。C01–C06 不是未决问题，而是 DEVELOP 迁移、不可达与回滚测试的固定输入。
6. **R1 证据边界**：R1 只证明冻结 Markdown ↔ 冻结 JSON 的 350/350 内容完整性，不证明生产旧 `seed-*` ↔ V1.3 `PN-*` 题面等价，不得再用 R1 代替 P0-01 证据。
7. **迁移门禁**：上述 ID policy 已在计划契约层冻结；DEVELOP 必须用单 Router 不可达、旧 selector spy=`0`、CAS 事务回滚、可重入迁移与 history-only fixture 提供实现证据。

### B. Pack Capability

1. `relationship-aware`：V1.3 核心 7 类，可推进 Heat/Coverage/Signal/Pair/MATCH/5 档。
2. `expansion`：40 张扩圈卡，使用 10b 元数据，不进入 Pair Score/MATCH；completed 轮计入 `sessionCompletedRounds`。其不推进 Heat/Signal/mutual interval 是当前唯一规划分支，但 D6 仍为 `TBD`，Human Gate 拍板前不得写入 DEV_BASELINE。
3. `neutral`：AI 即兴、转瓶子、自定义包及未声明 V2 metadata 的玩法；completed 轮计入 `sessionCompletedRounds`，可继续正常玩，但当前规划分支暂停 Relationship Engine。该关系推进口径同样受 D6=`TBD` 约束。
4. 同一 Session 切包不重新录玩家、不重置 Relationship State、不重复初始化保障窗口。

### C. Heat 与计数契约

#### R3｜双计数器事件表冻结（以 PlanConsistency 口径为准）

> 状态：FROZEN  
> 决策：Human D3=A  
> 适用范围：V2.0 Session 结算计数、relationship-aware Heat 与 mutual check 调度  
> 规范优先级：本表是 R3 的唯一执行口径；Builder 不得按交互文案、页面动作或历史实现自行推导计数。

##### 一、唯一计数事件表

| 事件 | 生效条件 | `sessionCompletedRounds` | `relationshipEffectiveCardCount` | Coverage / used / 状态副作用 | Heat / mutual 影响 |
|---|---|---:|---:|---|---|
| `REL_CARD_COMPLETED` | relationship-aware 普通卡已展示且完成 | `+1` | `+1` | 合格定向卡 `offered +1`、`completed +1`；`cardId` 进入 used | 唯一可推进 Heat 与 regular mutual interval 的卡事件；同时消耗 20/25 Session 轮次 |
| `REL_CARD_SKIPPED` | relationship-aware 普通卡已展示后跳过 | `+0` | `+0` | 合格定向卡 `offered +1`、`completed +0`；`cardId` 进入 used；可记 low-participation | 不推进 Heat/regular mutual，不消耗 Session 轮次 |
| `REL_CARD_SWAPPED` | 换题并放弃已展示卡 | `+0` | `+0` | `offered/completed` 均 `+0`；旧 `cardId` 进入 used，防止立即重现 | 不推进 Heat/regular mutual，不消耗 Session 轮次 |
| `NEUTRAL_CARD_COMPLETED` | neutral pack 完成 | `+1` | `+0` | 不改 Relationship Coverage；只更新 neutral 历史 | 消耗 20/25 Session 轮次；不推进 Heat/regular mutual/Signal（关系推进分支待 D6 拍板） |
| `NEUTRAL_CARD_SKIPPED_OR_SWAPPED` | neutral pack 跳过或换题 | `+0` | `+0` | 只更新 neutral 自身展示/used 历史 | 不消耗 Session 轮次，不推进 Relationship Engine |
| `EXPANSION_CARD_COMPLETED` | expansion 原版或 table-only 版完成 | `+1` | `+0` | 不改 Pair/Coverage/Signal；记录 expansion used ID | 消耗 20/25 Session 轮次；不推进 Heat/regular mutual/Signal（关系推进分支待 D6 拍板） |
| `EXPANSION_CARD_SKIPPED_OR_SWAPPED` | expansion 跳过或换题 | `+0` | `+0` | 记录 expansion 展示/used ID | 不消耗 Session 轮次，不推进 Relationship Engine |
| `LEGACY_CURRENT_COMPLETED` | 升级时已展示旧 current card 完成一次 | `+1` | `+0` | 不建 V2 Signal/Coverage；标记 legacy consumed；之后必须进 V2 Router | 仅消耗 Session 轮次，不推进 Relationship Engine |
| `LEGACY_CURRENT_SKIPPED` | 升级时已展示旧 current card 跳过一次 | `+0` | `+0` | 标记 legacy consumed；之后必须进 V2 Router | 不消耗 Session 轮次，不推进 Relationship Engine |
| `SYSTEM_MUTUAL_CHECK_*` | `due/start/submit/complete/cancel/final` 任一系统互选事件 | `+0` | `+0` | 不进入 `usedCardIds`；只更新 scheduler 与 mutual 结果 | 系统事件本身不得再次触发 regular mutual |
| `EVENT_REPLAYED_OR_DUPLICATE` | 恢复时重放同一 `eventId`，或双点、重试、重复提交 | `+0` | `+0` | 两计数器、Coverage、used、scheduler 及其他副作用全部 `+0` | 完全幂等，不推进 Heat，不重复触发任何 mutual check |

补充冻结：`CONSENT_*`（`request/submit/intersection/no-action`）同样不计，Delta=`+0`；不改 Coverage/used，不推进 Heat 或 mutual interval，partial 只保留在内存。

##### 二、终态互斥与恢复幂等

1. 每次展示生成稳定 `interactionId`；每个终态事件携带唯一 `eventId`。
2. 同一 `interactionId` 只能接受 `completed`、`skipped`、`swapped` 三种终态之一；首个合法终态落盘后，其余终态一律视为重复事件，Delta=`+0`。
3. reducer 必须先检查持久化的有界 `processedEventIds`（或等价去重结构），再在同一事务内写入 count、Coverage、used 与 scheduler。
4. 页面刷新、崩溃恢复、离线恢复、消息重投、按钮双击或重复提交均不得重复计数，也不得重复产生任何副作用。
5. 只有首次处理的 completed 玩法轮可令 `sessionCompletedRounds +1`；其中只有 `REL_CARD_COMPLETED` 可令 `relationshipEffectiveCardCount +1`。不存在由 UI 回合数、抽卡数、展示数或系统事件反推任一计数器的第二口径。

##### 三、D3=A：固定 20＋可再玩 5 个 Session completed rounds

1. V2.0 唯一模式为 `fixed-20-plus-5`。
2. Session 创建时冻结 `baseSessionCompletedRoundLimit=20`；默认在 `sessionCompletedRounds=20` 后进入结束选择。
3. Host 可结束，或仅一次开启 `extensionSessionCompletedRoundLimit=5`；`maxExtensions=1`，整局最大 `sessionCompletedRounds=25`。
4. 加玩开启后不得再次加玩；`sessionCompletedRounds=25` 后不再接受新的 gameplay completed 事件。
5. 提前结束不得补写或伪造 completed，不得强升 Heat；仅在其他资格合法时执行 final mutual check。
6. skipped、swapped、system、consent 与恢复重放事件不消耗 20/25 Session 限额；neutral、expansion 与 legacy current 若是 completed 则消耗 Session 限额，但始终不消耗 `relationshipEffectiveCardCount`。

##### 四、Heat 绝对阈值锁

Heat 只由首次合法处理的 `REL_CARD_COMPLETED` 后的 `relationshipEffectiveCardCount` 决定：

| Heat | `relationshipEffectiveCardCount` |
|---|---:|
| `H1` | `0–3` |
| `H2` | `4–7` |
| `H3` | `8–12` |
| `H4` | `13+` |

- Intensity 1～5 仅代表用户允许的内容上限，不等于 Heat。
- Heat 使用绝对阈值，不按 20 或 25 重新计算比例。
- 开启加玩不重算、不回退 Heat；但不得用 `sessionCompletedRounds` 的 21～25 直接推导 Heat，Heat 仍只看 `relationshipEffectiveCardCount`。
- 未计数事件不得改变 Heat。

##### 五、第 9/14/19 个 relationship-effective 互选节奏与 final 抑制锁

1. regular mutual check 分别在 `relationshipEffectiveCardCount` 首次达到 `9`、`14`、`19` 后标记 due，但还必须满足 `targetSessionCompletedRounds - sessionCompletedRounds >= FIVE_TIER_GUARANTEE_QUALIFYING_LIMIT(2)`，避免新 MATCH 在本段 Session 内无法获得保障窗口。
2. 每个阈值最多触发一次，整局最多三次常规 mutual check；恢复重放不得重复触发。
3. `sessionCompletedRounds=20` 选择“再玩 5 轮”时不执行 final，将 target 改为 25 后重新评估第三次 regular mutual；整局仍最多三次 regular mutual。
4. final mutual 是独立 Session-end 系统事件，但必须同时满足：Heat≥H3、Coverage Gate 通过、存在合法 pair、且 `relationshipEffectiveCardCount - lastMutualCheckAtEffectiveCount >= minimumEffectiveCardsBetweenRuns(5)`。
5. 若刚做过 regular mutual 而间隔不足 5，final 视为已覆盖并抑制；不创建 mutual run，不重问、不补 MATCH、不建 5 档 guarantee。
6. 提前结束也执行同一资格与 recent-check suppression；final 无论执行还是被抑制，都不得补足任一计数器或推进 Heat。

##### 六、Runtime 冻结值

```json
{
  "runtimeRules": {
    "effectiveCardCounting": {
      "sessionCompletedRoundEventTypes": ["REL_CARD_COMPLETED", "NEUTRAL_CARD_COMPLETED", "EXPANSION_CARD_COMPLETED", "LEGACY_CURRENT_COMPLETED"],
      "relationshipEffectiveCardEventTypes": ["REL_CARD_COMPLETED"],
      "terminalEventExclusivity": true,
      "idempotencyKey": "eventId",
      "mode": "fixed-20-plus-5",
      "baseSessionCompletedRoundLimit": 20,
      "extensionSessionCompletedRoundLimit": 5,
      "maxExtensions": 1,
      "heatThresholds": {
        "H1": [0, 3],
        "H2": [4, 7],
        "H3": [8, 12],
        "H4": [13, null]
      },
      "mutualCheckCounts": [9, 14, 19],
      "minimumEffectiveCardsBetweenRuns": 5,
      "minimumRemainingSessionRoundsForRegularMutual": 2,
      "finalMutualRecentCheckSuppression": true,
      "neutralAdvances": false,
      "expansionAdvances": false,
      "legacyAdvances": false,
      "systemEventsAdvance": false
    }
  }
}
```

本节常量必须进入新的受控 JSON 冻结快照并重签 SHA256 后，才可成为 DEVELOP 期运行真源；在此之前禁止从本文手抄常量进业务代码。

### D. Pair 范围与路由

#### R4｜Player 与 Pair 数据契约（全文并入）

##### 1. 决策基线

- 决策：`D4=A`，V2.0 默认只生成男女 Pair。
- 范围：只为当局参与者增加最小性别字段；不收集取向、偏好、身份说明或跨局关系历史。
- 禁止推断：不得通过姓名、座位、加入顺序、行为或模型推测字段值。
- 降级：当前 active 参与者中没有合法 Pair 时，整局进入普通玩法；不运行 Pair Routing、pair signal、`SYSTEM_MUTUAL_CHECK`、MATCH、MATCH 专属 5 档及 5 档保障。
- 边界：本文只定义 R4 数据与异常态，不扩展手动加边或偏好配对。

##### 2. Player 数据契约

###### 2.1 分层与字段

`Player` 全局档案保持现有字段，不新增性别字段：

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | `string` | 必填；在当局内唯一、稳定 |
| `displayName` | `string` | 必填；仅用于展示，不参与 Pair 判定 |
| `active` | `boolean` | 必填；只有 `true` 可进入候选池 |
| `createdAt` | 现有时间类型 | 不参与 Pair 判定 |
| `lastUsedAt` | 现有时间类型 | 不参与 Pair 判定 |

V2.0 仅在 Session 快照投影中新增：

```ts
type PairGender = "male" | "female";

type SessionParticipant = {
  playerId: string;
  active: boolean;
  pairGender: PairGender | null;
};
```

| 字段 | 必填 | 语义 | 存储边界 |
|---|---|---|---|
| `playerId` | 是 | 引用稳定 `Player.id` | 随 Session 快照保存 |
| `active` | 是 | 当局是否参与路由 | 随 Session 快照保存 |
| `pairGender` | 是 | Host 为本局选择的“男/女”；`null` 表示未选或旧数据缺失 | 仅限当局；不回写 Player 档案，不进 analytics、AI、日志或导出 |

Session 结束时，`pairGender` 与 Relationship Graph、signal、MATCH 及私密临时态一并清理。

###### 2.2 输入与校验

1. Host 只能为当局参与者选择 `male` 或 `female`；未选统一存为 `null`。
2. 反序列化仅接受 `"male" | "female" | null`；字段缺失或其他值规范化为 `null`，不报错退局，不自动修正为男或女。
3. `playerId` 必须指向当前 Session 中已存在的唯一 Player；重复、空值或悬空引用不得进入 pair pool。
4. Pair 资格谓词固定为：

```ts
eligiblePair(a, b) =
  a.active === true &&
  b.active === true &&
  a.playerId !== b.playerId &&
  a.pairGender !== null &&
  b.pairGender !== null &&
  a.pairGender !== b.pairGender;

pairKey(a, b) = [a.playerId, b.playerId].sort().join("::");
```

5. pair pool 是 `eligiblePair` 对所有 active participants 计算得到的无向、去重边集；以 `pairKey` 作为唯一键。
6. 自环、重复边、非 active 参与者、`pairGender=null` 或同值性别边一律拒绝；不提供手动加边绕过谓词。
7. 所有 Pair/MATCH/5 档专属入口在执行前必须再校验当前 `pairKey` 仍合法，避免使用编辑、暂离或退出前的旧边。

###### 2.3 迁移契约

| 来源 | 迁移动作 | 迁移后行为 |
|---|---|---|
| 旧 Player 档案 | 不改 schema，不回填性别 | 创建 Session 投影时 `pairGender=null`，等待 Host 当局选择 |
| 旧 Session 缺失 `pairGender` | 读取时补 `null` | 若无合法 Pair，安全降级普通玩法 |
| Session 含非法枚举值 | 将该值规范化为 `null` | 不猜测、不尝试文字映射；重算 pair pool |
| 旧 Session 含关系边或 MATCH，但边不符合新谓词 | 删除失效边，废弃其 signal/MATCH/保障 | 不传递或复用到其他 Pair |
| 旧 Session 无可验证的 V2 关系状态 | V2 signal/MATCH 从空开始 | 不从旧轮次或历史行为补算 signal |

迁移必须可重入：对已规范化快照重复执行不改变结果，不新建 Pair、signal 或 MATCH。迁移不得因无合法 Pair 而阻止 Session 恢复。

##### 3. Pair 模式派生态

pair pool 每次在以下时机重算：Session 启动关系主线前、Host 修改 `pairGender`、玩家 active/暂离/返回/退出状态变化时。

```ts
type PairMode = "ACTIVE" | "NO_ELIGIBLE_PAIR";

pairMode = eligiblePairCount > 0 ? "ACTIVE" : "NO_ELIGIBLE_PAIR";
```

- `ACTIVE`：只允许在当前 pair pool 的合法边内运行 Pair Routing、signal、mutual check、MATCH 与 MATCH 专属 5 档候选。
- `NO_ELIGIBLE_PAIR`：保留普通抽卡、全桌与中性玩法；关系主线的计时、候选、互选与保障不运行，不报错、不空转、不补边。
- 从 `NO_ELIGIBLE_PAIR` 恢复为 `ACTIVE` 时，新合法边的 signal、cooldown、MATCH 与 5 档保障均从空状态开始；不回放普通回合，不补算离席期机会。

##### 4. Pair 异常态

###### 4.1 无合法候选 `NO_ELIGIBLE_PAIR`

**进入条件**：`eligiblePairCount === 0`，包括人数不足、所有人未选、字段非法、合法边玩家均非 active，或仅存同性别 active 参与者。

**处理**：

- 立即设置 `pairMode=NO_ELIGIBLE_PAIR`，进入普通玩法。
- 停止 Pair Routing、pair signal、`SYSTEM_MUTUAL_CHECK`、MATCH、MATCH 专属 5 档及其保障的调度与消耗。
- 不发生无限重试，不为凑 Pair 修改字段或生成虚假边。
- 界面可使用中性提示“本局将使用普通玩法”，不公开任何人的字段值。

**退出条件**：Host 补齐/修正当局字段或参与者返回，重算后 `eligiblePairCount > 0`。

###### 4.2 单目标性别 `SINGLE_TARGET_GENDER`

**定义**：当前 active 且 `pairGender != null` 的参与者只出现一种枚举值，即全为 `male` 或全为 `female`。这是 `NO_ELIGIBLE_PAIR` 的可解释原因，不是例外配对规则。

**处理**：

- 不创建同性别边，不把 `null` 猜成缺失性别，不要求系统代选。
- 按 `NO_ELIGIBLE_PAIR` 完整降级，因而不跑 MATCH 和 MATCH 专属 5 档。
- 若后续出现另一个目标性别的 active 参与者，重算 pool，合法新边从空关系态开始。

###### 4.3 中途退出 `PLAYER_EXITED`

**进入条件**：玩家明确退出当局，而非暂时离席。

**原子处理顺序**：

1. 将该参与者设为非 active，使其立即不可被选中。
2. 删除所有含该 `playerId` 的 eligible 边并重算 pool。
3. 废弃这些边的 signal、cooldown 和 MATCH；相关 pending/paused 5 档保障进入终态 `expired`，`terminalReason="expired-player-exit"`。
4. 清除该玩家未消费的私密选择；不转移给其他玩家，不作为新 Pair 的 signal。
5. 如重算后无合法边，立即转入 `NO_ELIGIBLE_PAIR`；否则其余合法边按原状态继续。

退出是终止语义；同一人后续重新加入时，不恢复已废弃的边或 MATCH，按新参与者关系态处理。

###### 4.4 暂离 `PLAYER_TEMPORARILY_AWAY`

**进入条件**：玩家保留本局席位与稳定 `playerId`，但暂时不参与路由。

**暂离时**：

- 从当前可调度 pool 排除所有含该玩家的边，但不删除边的已有 signal/MATCH。
- 暂停相关 cooldown 与 5 档保障；保障标记为 `paused`，`pauseReason="player-away"`，已累计的合格机会计数不清零。
- 离席期不视为合格 pair opportunity，不消耗保障窗口，不产生该玩家的 signal 或互选。
- 如排除后无其他合法边，调度层进入 `NO_ELIGIBLE_PAIR`，但被暂停边的关系态保留待恢复。

**返回时**：

- 根据稳定 `playerId` 和 `pairKey` 重算资格；仅恢复当前仍满足 `eligiblePair` 的边。
- cooldown 和 5 档保障从暂停点继续，不补算暂离期机会、不重置计数。
- 若暂离期间 `pairGender` 已被 Host 修改而使旧边失效，该边不恢复；其 MATCH/保障按 `expired-policy-change` 终止，新合法边从空状态开始。

##### 5. 必须满足的不变式

1. 任何可调度 Pair 在调度当下都满足 `eligiblePair`。
2. `eligiblePairCount=0` 时，Pair/MATCH/MATCH 专属 5 档的下一步候选数必须为 `0`。
3. `pairGender` 缺失或非法永远只能得到 `null`，不能得到推测值。
4. 退出使关系边终止；暂离使关系边暂停，两者不得共用恢复语义。
5. Host 修改 `pairGender` 后先重算资格，再允许任何新的 Pair/MATCH/5 档专属动作。
6. 普通玩法回合、暂离期和迁移过程都不得倒推、补算或伪造 pair signal。

### E. Signal / Mutual / MATCH / Consent

1. Shared / Compatibility / Crowd / Personal / Mutual 分库存储、分别封顶、不得互相升级。
2. Crowd 与 Personal 不能创建 MATCH；行为线索不能推断好感。
3. `SYSTEM_MUTUAL_CHECK` 是独立系统事件，不混入普通卡抽取；单向答案不持久化、不日志、不上传。
4. MATCH 只表达“本局愿意继续了解”，不是恋爱关系、排他关系或身体接触许可。
5. `private-mutual-only` 只显示双方选择交集；无交集→no-action；不得自动换成更轻动作再次施压。
6. `PN-MOST-050` 只允许一次最高 4 档的安全 pair 加赛，不创建 MATCH，不进入 5 档。

### F. 5 档保障

1. 资格前置：全局 Intensity=5、当前 pair 已 MATCH、卡片 `matchRequired/targetMode/heat/边界/同意` 全部合法。
2. **Phase1 契约已关闭（原 blocking P1-01）**：Human D7=A；`FIVE_TIER_GUARANTEE_QUALIFYING_LIMIT=2`、`FIVE_TIER_GUARANTEE_OFFER_EVENT=CARD_PRESENTED`。每个 canonical pair 最多一个 tracker，状态为 `none -> pending <-> paused -> offered | expired`；`offered/expired` 是终态。`createdAtEffectiveCount`、`qualifyingOpportunitiesSeen`、`status`、`pauseReason`、`terminalReason` 可序列化，但不序列化 consent 原始选择。
3. `QUALIFYING_PAIR_OPPORTUNITY`只在 Router 实际选中该 pair，且完成 Intensity/Heat/boundary/consent-mode/matchRequired/used/cooldown 过滤后仍有至少 1 张合法 5 档卡时产生；每个独立 pair 回合最多 `+1`。只“考虑过”、被 cooldown 挡住、无卡、非当前 pair 均不消耗。
4. `pending`在 Intensity<5、pair 暂离、无合法 5 档时进 `paused`，条件恢复后回 `pending`且计数不清零；cooldown 期间不消耗；player 退出、pair policy 使边失效、MATCH 合法撤销、Session 结束进 `expired`。多 MATCH 竞争使用 R5 稳定全序，且不绕过硬 cooldown。
5. **D7=A 终态**：合法 5 档卡发出 `CARD_PRESENTED` 即进 `offered`；之后 completed/skip/swap/consent no-action 都不回滚、不补发、不连续施压。第 1 次 qualifying 未展示 5 档时 `seen=1`，第 2 次若仍有合法 5 档则必须展示；不得存在 `seen=2` 且非 `offered` 的可持久化状态。
6. 保障是“至少提供一次合法 5 档机会”，不是保证完成动作；70/30 只是 MATCH 专属回合的抽取带宽，不得覆盖 consent 与公平规则。

### G. 扩圈 fallback 统一

1. V1.3 Frozen 的唯一默认：40/40 均为 `fallbackPolicy=switch-to-table-version`。
2. 外部参与者拒绝、现场不适合或 Host 主动跳过外部邀请时：立即切本桌替代版本，不二次邀请、不暴露拒绝者、不要求联系方式/饮酒/身体接触。
3. **DRAFT.3 规范性 T037（取代 v6 历史冲突句）**：`V2-T037｜扩圈 40 卡接入 10b metadata；不进 Heat / Pair Score / MATCH；拒绝、不适合或 Host 跳过外邀时，按该 cardId 立即执行 table-only 映射，fallbackPolicy 固定为 switch-to-table-version。`这是 V2 唯一 T037 执行口径；v6 的“拒绝走 table fallback”仅作历史审计记录且明确作废。若要改为“直接跳过”，必须改内容基线并走 Change C，Builder 不得自行解释。
4. **R2｜PASS｜40/40 table-only 映射冻结**：以下映射覆盖 `PN-EXPAND-001..040`，均只由本桌已加入的玩家完成；“随机/抽”由本地系统执行，不联网。

| cardId | table-only fallback | cardId | table-only fallback |
|---|---|---|---|
| PN-EXPAND-001 | 本地随机选 A/B 游戏 | PN-EXPAND-021 | Host 领本桌用水/饮料说一句祝酒词 |
| PN-EXPAND-002 | 系统抽 1–5 决定下轮顺序 | PN-EXPAND-022 | 系统抽 1–10 对应低风险卡 |
| PN-EXPAND-003 | 本桌每人提一个队名，系统随机选一个 | PN-EXPAND-023 | 系统从食物/电影/音乐抽类别，本桌联想接龙 |
| PN-EXPAND-004 | 在两名自愿玩家中本地随机先手 | PN-EXPAND-024 | 系统从真心话/二选一/默契测试抽下轮 |
| PN-EXPAND-005 | 系统抽一个安全关键词，本桌用水/饮料说一句 | PN-EXPAND-025 | 本地随机“继续同玩法/换玩法” |
| PN-EXPAND-006 | 本地随机“继续/换游戏” | PN-EXPAND-026 | 本桌全员回答一题系统预设 1–2 档二选一 |
| PN-EXPAND-007 | 系统抽一个城市，本桌每人说一个联想词 | PN-EXPAND-027 | 本桌随机一名自愿玩家进入 60 秒 1–2 档嘉宾回合 |
| PN-EXPAND-008 | 系统从三个低门槛问题中抽一个，本桌回答 | PN-EXPAND-028 | 本桌每人提一个非外貌/性别/身份称号，系统随机选一个 |
| PN-EXPAND-009 | 系统抽表情符号，本桌模仿 3 秒 | PN-EXPAND-029 | 本桌随机配对两人，各推荐一项电影/歌曲/餐厅/城市 |
| PN-EXPAND-010 | 系统在两个预设安全挑战中随机一个 | PN-EXPAND-030 | 系统抽点赞/剪刀手/举杯，本桌同做 3 秒 |
| PN-EXPAND-011 | 系统抽“安静型/热闹型”，本桌指人 | PN-EXPAND-031 | 系统从三道非外貌第一印象题中抽一道 |
| PN-EXPAND-012 | 系统抽颜色，本桌给当前 Heat 起代号 | PN-EXPAND-032 | 系统从三道安全“谁最可能”中抽一道，本桌投票 |
| PN-EXPAND-013 | 本桌随机一名玩家回答一题低档二选一 | PN-EXPAND-033 | 本桌全员做“3、2、1同时出手势” |
| PN-EXPAND-014 | 系统从旅行/电影/食物/城市抽 30 秒话题 | PN-EXPAND-034 | 本桌随机一名自愿玩家作 10 秒裁判，只判动作相似度 |
| PN-EXPAND-015 | 本地随机两名自愿玩家中的一名答1档真心话 | PN-EXPAND-035 | 系统抽安全话题，本桌每人一句 |
| PN-EXPAND-016 | 系统抽安全关键词，本桌改成一道真心话 | PN-EXPAND-036 | 系统显示简单图形，一名玩家比划、另一名猜 |
| PN-EXPAND-017 | 系统在两个无接触双人姿势中随机一个 | PN-EXPAND-037 | 本桌全员完成咖啡/酒吧、早起/熬夜、计划/随性三连二选一 |
| PN-EXPAND-018 | 本地随机选本桌两个候选队名之一 | PN-EXPAND-038 | 系统抽普通词，本桌依次说不重复联想词 |
| PN-EXPAND-019 | 系统从三个预设安全大冒险中抽一个 | PN-EXPAND-039 | 系统从三张低风险卡中随机一张给本桌 |
| PN-EXPAND-020 | 系统在当前 Intensity/Heat 合法的主游戏中随机下一种 | PN-EXPAND-040 | 本桌用系统预设低风险题运行不超过 90 秒的联合小游戏 |

5. table-only 文案与安全候选集在 DEVELOP 前必须结构化进 SSOT；本表是完整 40/40 产品映射，不授权 Builder 另行生成高风险内容。

### H. 候选池耗尽策略

1. **Phase1 契约已关闭（原 blocking P1-02）**：Human D8=A+；`BUCKET_EMPTY -> PACK_EXHAUSTED -> RELATIONSHIP_GLOBAL_EXHAUSTED -> AWAITING_HOST_EXHAUSTION_DECISION`；每层只能由统一 Exhaustion Controller 处理，Pack 不得自定义另一套回退。
2. `BUCKET_EMPTY`：只允许在同 Heat 下向**较低且仍合法**档位搜索并对存量档重新归一化；永不越权到更高档、被禁边界、未 MATCH 的 5 档或旧 selector。
3. D8=A+ 冻结行为：
   - 当前 bucket 空：同 Heat 内按配置向较低合法 bucket 回退；
   - 当前玩法合法未用卡空：提示“本玩法本局已玩完”，允许切换其他有卡玩法；
   - 所有 relationship-aware 硬合法集在软去重窗口放宽到 0 后仍空：Host 明确选择“结束本局”或“洗牌再玩”；
   - `recentCardIds` 按 `CARD_PRESENTED` 记录 Session 级最近 5 张；若硬合法集非空但全被软去重挡住，按 `5 -> 4 -> 3 -> 2 -> 1 -> 0` 逐步放宽，不得误报耗尽；
   - 洗牌再玩只清 relationship-aware 普通 `usedCardIds`，保留最近 5 张 `recentCardIds`、Heat、Coverage、Signals、MATCH、cooldown 与 5 档保障；
   - 自动 AI 补题不得作为 V2 核心主线的隐式 fallback。
4. Host 未选择时状态为 `AWAITING_HOST_EXHAUSTION_DECISION`，暂停抽卡但 Session 可保存/恢复；不自动洗牌、不自动结束。洗牌用 `sessionId + exhaustionCycle + 1` 作幂等键，重放不得多次清除或多加 cycle。
5. 软去重放宽与洗牌后都只能回到 V2 统一 Router；旧 future deck、`16:8:4:2:1`、`INTENSITY_WEIGHT`、固定高档陡坡、全桌 H5 与 DOUBLE MATCH 不得成为任何 empty/error catch 的 fallback。对应状态机、离线/恢复与旧 Router spy 验证转 DEVELOP 门禁。

### I. Brownfield 迁移与回归

1. V1.6→V2 事务化迁移；失败保留原记录，不清库、不写半迁移 schema。
2. 保留玩家、关系、氛围、Intensity、雷区、active pack 与可安全保留历史；V2 signals/MATCH 从空开始，不从旧历史猜测。
3. 已展示 legacy current card 最多允许完成/跳过一次，不产生 V2 signal、Heat 或保障计数；之后进入 V2 Router。
4. 旧 future deck 不再驱动 relationship-aware 下一张；旧 `16:8:4:2:1`、固定高档陡坡、全桌 H5、DOUBLE MATCH 等生产路径不可达。
5. 四 Tab、首页、组局、游戏包、设置、Provider、BYOK、PWA、offline、PackSwitcher、版本号三处联动规则必须回归通过。

## Out of Scope

1. 不新增账号、支付、云数据库、云端关系图、跨设备秘密投票或多人实时房间。
2. 不做 ML/AI 猜测“谁喜欢谁”，不展示爱情概率/匹配率。
3. 不把 AI 即兴、自定义包强行改造成 relationship-aware。
4. 不重做四 Tab、视觉系统、Provider 或全局状态框架。
5. 不在 V2.0 保存跨 Session 的 MATCH/关系历史；若未来需要，另走显式 opt-in 变更。
6. Phase 1 不改业务代码、不跑 Release、不建立 DEV_BASELINE。

## Technical Approach

1. **V2ContentAdapter**：只从本 Plan 冻结的 ZIP archive member 取原始字节；先过 SHA256 Gate，再解析 schema 2.3，校验 350+40、唯一 ID、枚举与 runtimeRules；生成物只读。
2. **Legacy Migration Adapter**：旧 `seed-*` 卡只作历史保留，不将相同类别/序号视为内容等价；新抽卡从 `PN-*` SSOT 开始，active legacy current card 按一次性收尾规则处理。
3. **Relationship State Slice**：增量扩展现有 Session，不建第二 store；包含 Heat、计数、coverage、pair aggregate、matches、cooldown、used IDs、5档保障。
4. **Heat/Coverage Engine**：纯事件 reducer；所有计数语义由事件表和幂等键固定。
5. **Pair Eligibility + Routing Engine**：先构造合法 pair pool，再计算 Coverage + Signal − Cooldown；无资格时安全返回 neutral relationship state。
6. **Card Router**：动态 eligibility + weighted draw；旧 selector 与 V2 主线路径互斥。
7. **Private Flow Controller**：仅内存，负责 mutual check、one-off mutual、consent intersection；刷新即作废 partial。
8. **Migration Adapter**：事务化迁移旧 Session；保存回滚前记录；迁移与内容 ID mapping 同步验证。
9. **Exhaustion Controller**：统一处理 bucket/pack/global 耗尽，禁止由各 Pack 自写 fallback。
10. 实际文件路径由 DEVELOP 的 pre-implementation path mapping 核验；本 Plan 不臆造尚未核验的 reducer/repository 文件名。

## Data / API

### 目标概念模型

```text
Session.relationshipState
  version
  heat: H1 | H2 | H3 | H4
  heatProgressMode: fixed-20-plus-5
  sessionCompletedRounds
  relationshipEffectiveCardCount
  baseSessionCompletedRoundLimit: 20
  extensionSessionCompletedRoundLimit: 5
  extensionActivated: boolean
  lastMutualCheckAtEffectiveCount
  regularMutualCheckRuns
  playerCoverage[playerId]
    offeredTargeted
    completedTargeted
    consecutiveTargetedSkips
    lowParticipation
  eligiblePairPolicyVersion
  pairState[pairKey]
    sharedEvidence
    compatibilityEvidence
    crowdEvidence
    personalEvidence
    matched
    matchedAt
    cooldownRounds
    pendingFiveGuarantee
      qualifyingOpportunitiesSeen
      qualifyingOpportunitiesLimit
      status: pending | paused | offered | expired
  usedCardIds
  recentCardIds
  exhaustionCycle

Session.participants[playerId]
  pairGender: male | female | null
```

### 禁止持久化

- 单向秘密选择、未提交答案、partial consent、被拒绝的一侧选项、player→target 原始边。
- `pairGender` 只能作为当局 Session participant 快照，禁止回写跨局 Player 档案，禁止进入 analytics/AI/log/export。

### R5｜JSON SSOT 与 Hash Gate

1. **容器路径（仓库相对路径）**：`docs/content/v6/2026-09-24 - MAC - ChatGPT - Party Night V1.3冻结基线-备份 - V1.1.zip`。
2. **主线 SSOT archive member**：`Party Night V1.3 冻结基线/10-卡片元数据.json`；SHA256=`6b6c43f870fe22a86c98423db483cc99734090b1f70c48c31dc3fc6b47c75f33`；schemaVersion=`2.3`；cards=`350`。
3. **扩圈 SSOT archive member**：`Party Night V1.3 冻结基线/10b-扩圈元数据.json`；SHA256=`01ff77acd8eb2f53166a9da84aa403c6a49902e3a6e7a0104f4ea83d9f4c5b8d`；schemaVersion=`2.3`；cards=`40`。
4. **冻结 manifest archive member**：`Party Night V1.3 冻结基线/15-冻结文件清单与SHA256.md`；R1 报告已复核清单 `18/18 PASS`。
5. **Gate 执行顺序（fail closed）**：
   1. 按上述精确 member path 读取 ZIP 内原始 bytes，不换行、不格式化、不重新序列化；
   2. 分别计算 SHA256 并与本节固定值及 manifest 交叉比对；任一不符立即中止 build/test/release；
   3. hash 通过后才解析 JSON，校验 schemaVersion 2.3、cards 350/40、cardId 全局唯一、主线 `runtimeRules` 存在且可转为强类型 RuntimeConfig；
   4. 生成物写入 provenance：`archivePath/memberPath/sha256/schemaVersion/cardCount`，不接受“同名本地解压文件”或 UI/test 常量作第二真源；
   5. R2 table-only 映射、R3 runtime 契约、R4 pair policy 尚未写入上述 V1.3 原冻结 JSON。它们在 DEVELOP 前必须生成**新版本受控 JSON 冻结快照**，重签 SHA256、更新本节路径/值并经 Research Reviewer 复核；原 V1.3 ZIP 保持不可变审计基线。Builder 不得直接把本 Plan prose 当运行真源。
6. 不新增远程 API；Pair Signal/MATCH/秘密答案不发送给 AI 或 analytics。

## Key Assumptions

1. 当前生产事实已核验：硬编码 350 与旧指数 selector 仍在生产可达代码；不假设旧 `seed-*` 与 V1.3 `PN-*` 内容等价，旧卡仅作历史保留。
2. V1.3 Frozen JSON 的精确 archive member 路径、schema、350+40 数量、runtimeRules 与 freeze hash 已核验；但 R2–R4 新契约的受控 JSON 物化及生产构建/发布接入尚未验证。
3. 单设备传手机的私密流程在 4～5 人酒吧场景可接受，仍需真人节奏测试。
4. Host 能为当局参与者完成最小“男/女”字段录入；无合法 pair 的普通玩法降级仍需真人验证是否易理解。
5. expansion/neutral 默认不推进 Heat 是保守方案，不代表已完成用户研究验证。
6. 5档保障能提升高潮可达性，但不会压制全桌公平；需用 4人/5人、多 MATCH fixture 与真人局验证。
7. D8=A+ 已确认洗牌复用保留关系状态、最近 5 张软去重与 Host 显式决策；现场文案与节奏仍需真人局验证，但不再是契约未决。

## Competitor / Research Summary

1. v6 冻结包内第三方全量审查已验证：V1.3 350 主线＋40 扩圈的数量、档位、MD↔JSON、同意与边界元数据一致，旧 P0/P1/P2 已在内容层闭环。
2. 现有内部研究结论支持：互惠披露、共同点、轻量预测、公开选择与秘密双向确认应分阶段出现；Crowd/Personal 不应冒充 Mutual。
3. 安全原则已形成内部共识：跳过无惩罚、动作级 current consent、单向秘密立即删除、明显醉酒时停止高强度互动。
4. **尚未完成的外部验证**：没有本轮独立竞品桌面研究、真实酒吧 4/5 人局节奏数据、私密传手机耗时数据、5档保障命中率与尴尬/泄露观察。上述缺口计入 Readiness 扣分，不能用内部文档自评代替。

## Risks

| 风险 | 级别 | 影响 | 缓解 / Gate |
|---|---|---|---|
| 生产旧 `seed-*` 直接当成新 `PN-*` 导致题面、ID、历史与测试断裂 | 契约已关/实现门禁 | 数据/内容回归 | 旧卡只作历史保留＋新 Router 只读 PN SSOT＋迁移回滚测试 |
| 扩圈 fallback 冲突 | P0已关闭 | 拒绝后流程违反 Frozen 安全规则 | R2 40/40 映射＋DRAFT.3 规范性 T037；旧冲突句作废 |
| Heat 有效卡计数不唯一 | P0已关闭 | Heat、mutual、final 时序漂移 | Human D3=A＋冻结事件表＋20+5＋9/14/19＋幂等契约 |
| 无法从当前 Player 推导合法异性 pair | P0已关闭 | Pair/MATCH 不可实现或错误猜测 | Human D4=A＋Session `pairGender`＋无 pair 普通玩法降级 |
| SSOT 被同名解压件或手写常量替代 | P0已关闭（计划契约） | 运行参数漂移、内容不可追溯 | R5 精确 archive member＋SHA256 fail-closed Gate＋provenance |
| 5档保障定义不完整 | 契约已关/实现门禁 | 保证失真、垄断或强迫感 | 资格/消耗/暂停/过期状态机与多 MATCH 测试 |
| 候选池耗尽无统一策略 | 契约已关/实现门禁 | 空转、重复、越权卡或旧 selector 回流 | Exhaustion Controller＋Host 明确选择＋离线测试 |
| 私密数据进入 IndexedDB/log/export/cache | 契约已关/实现门禁 | 严重隐私事故 | persistence denylist＋刷新/崩溃/日志测试 |
| 旧 router 与 V2 router 双跑 | 契约已关/实现门禁 | 不可预测抽卡 | 单一入口＋legacy reachability test |
| MATCH pair 垄断小局 | P1 非 blocking | 其他玩家变观众 | small-pool 降权、cooldown、coverage、公平 E2E |
| neutral/expansion 语义与用户直觉不符 | P1 非 blocking | 切包后节奏困惑 | UI 提示＋真人局验证＋参数可调 |
| H4/5档节奏参数不佳 | P2 | 体验偏平或过猛 | 本地匿名计数与真人调参，不重写引擎 |

## DoD

### Phase 1 Plan DoD（进入 Human Review 前）

1. P0-01～P0-04 全部关闭，证据路径写入 Plan/Review；计划契约层 blocking P1=0。
2. R1 冻结 Markdown ↔ JSON 350/350 对账证据有效；旧生产卡按“仅历史保留”迁移，不冒充内容等价映射。
3. 扩圈 fallback 在 Frozen、Plan、SPEC、TASKS、测试口径中完全一致。
4. Heat 计数、pair 范围、5档保障、耗尽策略均有唯一状态/事件定义并进入 runtime/schema 契约。
5. 8 项 Human Decision 有明确选项、Planner 建议与影响；Research Reviewer 独立审查完成。
6. Readiness ≥90，关键 brownfield 事实已验证，核心假设有合理验证；`PLAN_GATE=READY_FOR_HUMAN_REVIEW` 后才找用户一次。

### Phase 2 Product DoD（仅供未来 DEV_BASELINE 验收）

1. 350+40 内容真源接入；schema 2.3、数量、唯一 ID、hash 与生成物一致；无第二套 runtime 常量。
2. 旧 350 的历史引用可迁移；新主线路径只走 V2 Router；旧指数 selector 等 legacy 关系逻辑生产不可达。
3. Heat H1→H4、Coverage、Pair、Signal、Mutual、MATCH、5档保障、Consent、Expansion、Exhaustion 全部有 unit/property/integration/E2E。
4. 4人、5人、人数/合法 pair 不均、无 pair、单 pair、多 MATCH、low participation、暂离/返回、刷新/崩溃均安全可继续。
5. 单向秘密不进 IndexedDB、日志、导出、缓存、analytics/AI；Session 结束后敏感关系状态为空。
6. 断网可完整跑 relationship-aware 主链；扩圈拒绝会执行本桌 fallback；全局耗尽不会越权或空转。
7. V1.6 Session 事务迁移通过；失败原数据不丢；legacy current card 只安全收尾一次。
8. 四 Tab、PWA、Provider、BYOK、PackSwitcher、Session 恢复与版本号联动回归全通过。
9. lint/typecheck/unit/integration/e2e/build 全通过；真机弱光 4人局＋5人局各完成一轮，重点验证传手机隐私、节奏、5档时机与耗尽提示。

## P0 / P1 / P2

### P0（非做不可）

- [x] **P0-01｜R1 冻结内容对账**：PASS，350/350 对应、逐题字段/schema 2.3 全齐、异常 0；证据为本 Plan Scope A 列明的报告与 CSV。
- [x] **P0-02｜扩圈 fallback 单一口径**：R2 已冻结 40/40 table-only 映射，T037 唯一规范口径为 `switch-to-table-version`。
- [x] **P0-03｜Heat 计数定义**：Human D3=A；事件表、默认 20 有效回合＋一次 5 回合加玩、Heat `0–3/4–7/8–12/13+`、mutual `9/14/19` 已冻结。
- [x] **P0-04｜Pair 范围与数据来源**：Human D4=A；本局级 `pairGender=male|female|null`、默认男女 pair、无合法 pair 降级普通玩法已冻结。

### P1

- [x] **blocking P1-01｜5档保障状态机（契约已关，实现转 DEVELOP 门禁）**：定义合格机会、消耗、skip、暂停/恢复、无卡、多 MATCH、cooldown、Intensity 下调与 Session end。
- [x] **blocking P1-02｜耗尽策略（契约已关，实现转 DEVELOP 门禁）**：定义 bucket/pack/global 三级耗尽、低档回退、Host 结束/洗牌选择、状态保留、最近去重与离线行为。
- [x] **blocking P1-03｜私密数据生命周期（契约已关，实现转 DEVELOP 门禁）**：形成持久化 allowlist/denylist，并覆盖 refresh/crash/log/export/cache/analytics。
- [x] **blocking P1-04｜单 Router 与迁移原子性（契约已关，实现转 DEVELOP 门禁）**：V2 主线启用后旧 selector 不可达；迁移失败不删数据、不半写。
- [ ] **非 blocking P1-05｜多 MATCH 公平**：小池降权、cooldown、Coverage 与保障窗口竞争规则经 fixture 验证。
- [ ] **非 blocking P1-06｜neutral/expansion 切换提示**：用户能理解“正常可玩但关系推进暂停”。
- [ ] **非 blocking P1-07｜调参可观测性**：仅本地匿名记录 Heat 停留、bucket 命中、skip、mutual 次数与耗尽事件，不含 player→target。

### P2

- [ ] 根据真人局调整 drawBands、首次/间隔卡数、cooldown、small-pool 权重与保障窗口，但不改变引擎语义。
- [ ] 优化 H3/H4、MATCH 与无 MATCH 的文案和动效；弱光、单手、传手机遮罩可用性打磨。
- [ ] 为长期内容迭代建立 V1.3 JSON → 生成物 → 产品包的可视化 diff 报告。
- [ ] 后续评估更包容的 pair preference 模型；不阻塞经 Human Gate 明确限定的 V2.0 范围。
- [ ] 后续评估 opt-in 的匿名本地局后总结；默认不保存跨 Session 关系图。

## Human Decisions Needed

> D3=`A`、D4=`A`、D7=`A`、D8=`A+` 已由 Human 拍板；D1/D2/D5/D6 仍为 `TBD`，不能由 Builder 代选。

1. **D1｜内容切换｜`TBD`**：是否同意 V1.3 Frozen 350+40 成为 V2 运行真源，并按 P0-01 已冻结的自动等价映射 `NONE` 与六条 migration policy 替换生产旧 350？Planner 建议：同意。未拍板前不授权切换内容真源。
2. **D2｜动态 Router｜`TBD`**：是否同意 relationship-aware 主线彻底停止固定 future deck/`16:8:4:2:1`，改为本地逐轮动态路由？Planner 建议：同意；neutral pack 可保留现有 deck 能力。未拍板前不授权 V2 Router 生产切换。
3. **D3｜Heat 计数｜已决 `A`**：采用双计数器与 `fixed-20-plus-5`；任意玩法 completed 轮推进 `sessionCompletedRounds`，仅 relationship-aware completed 普通卡推进 `relationshipEffectiveCardCount`，skip/swap/system/consent 不计。
4. **D4｜Pair 范围｜已决 `A`**：V2.0 仅在当局 Session participant 上增加 `pairGender=male|female|null`，默认只生成男女 pair；禁止猜测，无合法 pair 时降级为普通玩法。
5. **D5｜秘密互选与 MATCH｜`TBD`**：是否同意单设备传手机作为受控例外，并允许同一玩家在同一 Session 有多个非排他 MATCH？Planner 建议：同意；必须配套隐私遮罩与小局公平限制。未拍板前不将每人 active MATCH 有效上限固定为 1 或 2。
6. **D6｜Expansion / Neutral｜`TBD`**：是否同意两者默认不推进 Heat/Signal/mutual interval，扩圈拒绝统一执行 table-only fallback？Planner 建议：同意；扩圈 fallback 文案须逐卡可执行。未拍板前不将 neutral/expansion 的关系推进策略写入 DEV_BASELINE。
7. **D7｜5档保障｜已决 `A`**：新 MATCH 在后续 2 次合格 pair opportunity 内至少提供 1 张合法 5 档；`CARD_PRESENTED` 即进入 `offered` 终态，之后 skip/swap/consent no-action 均不补发。
8. **D8｜耗尽与迁移｜已决 `A+`**：软去重窗口按 `5→4→3→2→1→0` 逐步放宽；全局硬合法集仍空时由 Host 显式选择“结束本局 / 洗牌再玩”，洗牌保留关系状态且永不回退 V1.6 Router。

## Readiness Score（Plan Readiness Score / 计划成熟度，满分 100）

- 产品目标与用户需求（20）：`19/20`。D3/D4/D7/D8 已决，D1/D2/D5/D6 `TBD` 及阻止影响已显性；pair 包容范围待 Human 拍板。
- 核心方案完整性（20）：`18/20`。双计数器、final 抑制、R2/R4、5 档保障与耗尽契约已统一；实现与真人验证留待 DEVELOP。
- 外部事实与竞品验证（20）：`12/20`。P0-01 V1.2 外部包三件存在且数字已抽查；仍缺独立竞品研究与真人酒吧 4/5 人局验证。
- 技术可行性（15）：`12/15`。SSOT 路径/hash/Gate、六条迁移 policy、单 Router/CAS/幂等门禁已明确；实际路径 mapping 与迁移原型未完成。
- 风险与异常场景（10）：`9/10`。契约关闭与实现门禁已分层；实现级否定测试仍待 DEVELOP。
- 开发范围与 DoD（10）：`9/10`。分层 DoD 清晰，P1-01～04 已标记契约关闭；仍需在 Human 决策后转成最终可执行 TASKS/traceability。
- 未决问题（5）：`4/5`。实质 P0=0、计划契约层 blocking P1=0；仅 D1/D2/D5/D6 四项 Human Decision 仍为 `TBD`。
- 合计：`83/100`
- Gate（进 Human Review 条件）：Readiness >= 90 AND P0 = 0 AND blocking P1 = 0 AND 关键事实已验证 AND 核心假设已合理验证

## Research Review Round（第几轮/Reviewer 结论摘要）

- Round 0：Planner 根据 v6 Frozen/SDD、当前生产代码事实与本轮分析形成首版；尚未进入独立 Research Reviewer。
- 下一轮审查重点：P0 四项是否完整、扩圈 fallback 冲突是否消除、Heat/Pair/5档/耗尽是否无死锁、8 项 Human Decision 是否足以进入 Human Gate。

## PLAN_GATE

`IN_PROGRESS`

原因：`PLAN_READINESS_SCORE=83`，P0=0，计划契约层 blocking P1=0，但分数未达 90，且 D1/D2/D5/D6 仍待 Human 拍板，独立竞品研究与真人 4/5 人局验证仍缺；因此保持 `IN_PROGRESS`，不进入 `WAITING_HUMAN_APPROVAL`。
