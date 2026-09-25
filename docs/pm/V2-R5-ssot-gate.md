# V2 R5｜JSON SSOT 与 Hash Gate 契约

> 状态：Phase 1 计划契约。本文只固定 DEVELOP 阶段的路径、生成、校验与版本命名，不授权修改业务代码或发布。

> R5 决策口径：Human 已决 `D7=A`（`CARD_PRESENTED` 即 offered）、`D8=A+`（软去重 5＋逐步放宽窗口＋Host 显式洗牌＋禁止回退 V1.6 Router）。`D1/D2/D5/D6` 仍为 `TBD`；本文不代拍 D5“是否允许同一玩家多 MATCH”，只冻结两种结果共用的安全上限与调度契约。

## 1. 仓库稳定路径

### 1.1 不可变审计源

- 容器：`docs/content/v6/2026-09-24 - MAC - ChatGPT - Party Night V1.3冻结基线-备份 - V1.1.zip`
- 主线 member：`Party Night V1.3 冻结基线/10-卡片元数据.json`
- 扩圈 member：`Party Night V1.3 冻结基线/10b-扩圈元数据.json`
- 冻结清单 member：`Party Night V1.3 冻结基线/15-冻结文件清单与SHA256.md`

上述 ZIP 及 member path 是内容源的审计坐标，永不原地改写。同名解压文件、Markdown 题面、TypeScript 常量、UI fixture 和测试 fixture 均不是 SSOT。

### 1.2 受控 JSON 冻结快照

DEVELOP 阶段必须生成并提交下列三个文件：

```text
content/ssot/content-v1.3/cards.json
content/ssot/content-v1.3/expansion.json
content/ssot/content-v1.3/manifest.json
```

- `cards.json`：350 张主线卡，包含 R3 `runtimeRules` 及 R4 pair policy 的结构化结果。
- `expansion.json`：40 张扩圈卡，包含 R2 table-only 映射的结构化结果。
- `manifest.json`：记录输入 ZIP/member 路径与哈希、输出文件哈希、`schemaVersion`、卡数、Content/App/Session 版本和生成器版本。

`content/ssot/content-v1.3/` 是 `Content V1.3` 在仓库内的唯一运行时 JSON SSOT 根路径。业务代码只能从这里读卡片和运行参数；不得在 `lib/`、`app/`、测试或 UI 内维护第二份卡片/规则真源。

## 2. 生成方式

### 2.1 唯一入口

DEVELOP 阶段实现唯一生成器 `scripts/content/generate-content-ssot.mjs`，并暴露两个命令：

```text
pnpm content:ssot:generate
pnpm content:ssot:check
```

- `generate`：生成或更新三个受控文件；只用于明确的 Content 冻结变更。
- `check`：在临时目录重生成，与仓库已提交文件逐 bytes 比对；不回写工作树。

### 2.2 确定性生成

1. 直接读取 ZIP 内精确 member 的原始 bytes，不使用已解压副本。
2. 先验输入 SHA256，通过后才解析 JSON。
3. 将经 Research Reviewer 通过的 R2–R4 机器可读映射作为受控输入合并；不得在生成器中散落硬编码内容值，也不得从 Plan prose 或 UI 反向生成。
4. 输出固定为 UTF-8、LF、2 空格缩进、单个末尾换行；对象键按生成器规则稳定排序，数组保留审核后的业务顺序。
5. 不嵌入时间戳、本机绝对路径、随机值或环境信息；相同输入必须生成完全相同的 bytes 与 SHA256。
6. 三个输出是同一个原子发布单元：任一生成或校验失败，不得保留部分新输出。

## 3. Hash Gate 校验规则

### 3.1 固定输入哈希

| 输入 | SHA256 | schemaVersion | cards |
|---|---|---:|---:|
| `10-卡片元数据.json` 原始 bytes | `6b6c43f870fe22a86c98423db483cc99734090b1f70c48c31dc3fc6b47c75f33` | `2.3` | 350 |
| `10b-扩圈元数据.json` 原始 bytes | `01ff77acd8eb2f53166a9da84aa403c6a49902e3a6e7a0104f4ea83d9f4c5b8d` | `2.3` | 40 |

### 3.2 fail-closed 顺序

Gate 必须严格按以下顺序执行：

1. 校验 ZIP 容器和三个精确 member path 存在，禁止 basename 模糊匹配。
2. 对两个 JSON member 原始 bytes 计算 SHA256，同时与本文固定值、ZIP 内冻结 manifest 交叉比对。
3. 哈希通过后才解析，并校验 `schemaVersion=2.3`、主线 350、扩圈 40、`cardId` 跨两集全局唯一。
4. 校验主线 `runtimeRules` 存在且可完整转为强类型 RuntimeConfig；校验 R2 table-only 映射、R4 pair policy 的必需字段已结构化，不存在仅靠自由文字表达的运行规则。
5. 校验所有 schema 约束、枚举、引用 ID、唯一性、数量和交叉引用，任一 unknown field 或未解析引用都失败。
6. 以确定性规则重生成 JSON，计算两个输出的 SHA256，与 `manifest.json` 固定值比对。
7. 校验 `manifest.json` 的 provenance 至少包含 `archivePath/memberPath/inputSha256/outputPath/outputSha256/schemaVersion/cardCount/contentVersion/appVersion/sessionVersion/generatorVersion`。
8. `content:ssot:check` 在临时目录重生成并与已提交的三个文件逐 bytes 比对；有差异即失败，不自动修复。

任一步失败都必须以非零状态中止 build、test 和 release。不允许降级为 warning，不允许以重新格式化、重签哈希或改读同名文件绕过。

### 3.3 变更规则

- 仅 App 代码变更，JSON bytes 不变：不升 Content 版本，不重签内容哈希。
- 任一卡片、元数据、结构化运行规则或 JSON schema 变更：必须新建 Content 版本目录，重新审核、生成和签发；禁止原地改写 `content-v1.3` 后只替换哈希。
- Session 持久化结构变更：按 Session 版本迁移规则处理，不得通过升 Content 或 App 版本隐式替代迁移。
- 发布产物必须可回报实际加载的 `contentVersion` 与输出 SHA256，以便生产 smoke 与问题回溯。

## 4. 版本命名三分法

| 维度 | 本计划的标准写法 | 表示什么 | 何时变更 |
|---|---|---|---|
| Content | `Content V1.3` | 卡片、元数据、结构化运行规则与其冻结哈希 | JSON 内容、规则或 schema 任一改变 |
| App | `App V1.6` | 应用产品/发布线版本，包含 UI、Engine、Router 与构建产物 | 应用按发布规则升版 |
| Session | `Session v2` | 本地持久化 Session schema 与迁移兼容边界 | 持久化数据结构或兼容契约改变 |

三者独立升版，不锁步。任何计划、日志、manifest、测试证据和发布说明都必须带类型前缀，禁止只写歧义的 `V1.3`、`V1.6` 或 `v2`。本计划的组合身份为：

```text
Content V1.3 / App V1.6 / Session v2
```

App 每次启动或恢复当局时，分别校验“当前 App 允许的 Content 版本/哈希”与“Session schema 可迁移范围”；不得因 App 可运行就默认 Content 或 Session 兼容。

## 5. D7=A｜5 档保障状态机

### 5.1 Runtime 常量与单一计数口径

`runtimeRules` 必须物化以下常量，Builder 不得在 Router/UI 中另写默认值：

```text
FIVE_TIER_GUARANTEE_QUALIFYING_LIMIT = 2
FIVE_TIER_GUARANTEE_OFFER_EVENT = CARD_PRESENTED
MATCHES_PER_PLAYER_HARD_CEILING = 2
MATCH_PAIR_HARD_COOLDOWN_EFFECTIVE_ROUNDS = 1
ROUTER_SOFT_DEDUP_WINDOW = 5
```

每个 `canonicalPairId` 最多一个 tracker：`none -> pending <-> paused -> offered | expired`。`offered/expired` 是终态，不可回到 `pending`；重放同一 `eventId` 不得二次计数。

`QUALIFYING_PAIR_OPPORTUNITY` 仅在以下条件同时成立时将 `qualifyingOpportunitiesSeen +1`：Router 实际选中该 pair，Intensity=5，该 MATCH 仍有效，且通过 Heat、boundary、current-consent mode、`matchRequired`、used 与硬 cooldown 后至少有 1 张合法 5 档卡。第 1 次可按正常路由选卡；若第 1 次未展示合法 5 档，第 2 次必须在当时合法 5 档集内选卡。不得出现 `seen=2` 且非 `offered` 的可持久化状态。

### 5.2 D7=A 消耗与终态

| 事件/条件 | 是否消耗 qualifying opportunity | tracker 结果 | 冻结语义 |
|---|---:|---|---|
| 合法 5 档卡发出 `CARD_PRESENTED` | 是（若本 pair 本回合尚未计） | `offered` 终态 | 展示即完成保障；之后 completed/skip/swap/consent no-action 都不回滚、不补发、不连续施压 |
| 第 1 次 qualifying 中展示非 5 档合法 pair 卡 | 是 | 保持 `pending`，`seen=1` | 这是已消耗的第 1 次机会；下一次 qualifying 必须展示合法 5 档 |
| 静态合法性过滤后无任何 5 档卡 | 否 | `paused/no-legal-five-card` | 卡片或边界条件恢复才回 `pending`；不得伪造一次机会 |
| Intensity 从 5 下调到 1–4 | 否 | `paused/intensity-below-five` | 下调不是终态，不清零已见机会；恢复到 5 后从原计数继续 |
| pair 被硬 cooldown 挡住 | 否 | 保持 `pending`或原 `paused` | cooldown 先于保障，保障不得越过；期间不补算机会 |
| player 暂离 | 否 | `paused/player-away` | 返回且 pair 仍合法时原计数继续 |
| player 退出/pair policy 变更使边失效/MATCH 合法撤销 | 否 | `expired` 终态 | reason 分别为 `player-exit/policy-change/match-revoked` |
| `SESSION_END` | 否 | `expired/session-end` 终态 | 未用机会作废，禁止跨 Session 恢复 |

“保障”只保证在最多 2 次合格机会内**展示** 1 张合法 5 档，不保证玩家完成动作，也不改变 current consent 交集。

### 5.3 必过状态机测试

- `presented -> skip/swap/no-action` 后仍为 `offered`，不得再生成补偿 tracker。
- 第 1 次 qualifying 未出 5 档、第 2 次有合法 5 档时必定展示；若无合法卡则不增计数。
- Intensity `5 -> 4 -> 5`、away/return 保留计数；cooldown 期间 `+0`；`SESSION_END` 后不可恢复。
- 同一 `CARD_PRESENTED eventId` 重放不得重复更新 tracker、Coverage 或 used IDs。

## 6. D8=A+｜耗尽、软去重与 Host 洗牌

### 6.1 三层耗尽的唯一判定

Exhaustion Controller 是唯一决策者，状态顺序固定为 `BUCKET_EMPTY -> PACK_EXHAUSTED -> RELATIONSHIP_GLOBAL_EXHAUSTED -> AWAITING_HOST_EXHAUSTION_DECISION`：

1. `BUCKET_EMPTY`：在同 Heat 内只向更低且仍合法的档位扩展，每扩展一档重算合法集；不得向更高档、越过 boundary/current consent/MATCH/cooldown，不得调 V1.6 selector。
2. `PACK_EXHAUSTED`：当前 pack 在档位扩展后仍无合法卡，显示“本玩法本局已玩完”，只能切换到统一 Router 证明有合法卡的其他 pack。
3. `RELATIONSHIP_GLOBAL_EXHAUSTED`：将软去重窗口放宽到 0 后，所有 relationship-aware pack 仍无合法卡才成立。进入等待 Host 决策，不自动洗牌、结束或 AI 补题。

“无合法卡”指通过 capability、Intensity/Heat、boundary/current consent、target/pair/MATCH、used 与硬 cooldown 全部过滤后仍为空；不能把“被最近 5 张软去重暂时遮住”误报为耗尽。

### 6.2 软去重 5 与放宽窗口

- `recentCardIds` 按 `CARD_PRESENTED` 记录 Session 级最近 5 个 cardId，completed/skip/swap 均不改变“已展示”事实。
- 每次抽取先用窗口 `5`；若硬合法集非空但全被软去重挡住，按 `5 -> 4 -> 3 -> 2 -> 1 -> 0` 逐步放宽，在第一个非空窗口停止并记录 `dedupWindowApplied`。
- 放宽只移除最早的 recent 约束，不改动硬过滤、used 或 cooldown；窗口降到 0 也不是 V1.6 权重路由的入口。

### 6.3 Host 显式洗牌

Host 只能在 `AWAITING_HOST_EXHAUSTION_DECISION` 选“结束本局”或“洗牌再玩”。洗牌事件以 `sessionId + exhaustionCycle + 1` 为幂等键，成功后仅清理 relationship-aware 普通 `usedCardIds` 并将 `exhaustionCycle +1`；保留 `recentCardIds` 最近 5 张、Heat、Coverage、Signals、MATCH、cooldown、5 档 tracker、Intensity、边界与 active pack。恢复/重放不得多清一次或多加一个 cycle。

洗牌后仍只能进入 V2 统一 Router；旧 future deck、`16:8:4:2:1`、`INTENSITY_WEIGHT`、固定高档陡坡、全桌 H5 与 DOUBLE MATCH 路由在生产中均不可达。

### 6.4 必过耗尽 fixture

- bucket 空但低档有卡：只在同 Heat 向下扩展，不报 pack/global 耗尽。
- pack 空但其他 pack 有卡：只提示切 pack，不允许局部 selector 自行洗牌。
- 硬合法集只含最近卡：必须从窗口 5 逐步放宽后出卡，不得误报耗尽。
- 全局耗尽：只出现 Host 二选一；离线保存/恢复后状态与幂等键不变；重放洗牌事件只生效一次。
- 5 档专属池耗尽只暂停对应 tracker，不消耗机会，不允许越过 consent/边界或调用旧 Router。

## 7. 多 MATCH 条件契约（D5 仍 TBD）

### 7.1 D5 只剩一个布尔决策

- 若 D5=“不允许”：`effectiveMatchesPerPlayer=1`。一名玩家已有 active MATCH 时，后续双向选择不建第二条 MATCH，不建候补名单，原始秘密答案仍立即清理。
- 若 D5=“允许”：`effectiveMatchesPerPlayer=2`，且 `MATCHES_PER_PLAYER_HARD_CEILING=2` 不得配置为更高值。同一 canonical pair 始终最多一条 active MATCH。
- 同一 mutual check 同时产生多条双向边时，按 `mutualSubmittedAt ASC -> canonicalPairId ASC` 入场，超过有效上限的边不建 MATCH、不持久化候补或单向信息。

因此 Human Gate 只需决定“有效上限为 1 还是 2”；其余入场、公平、调度、cooldown 和 Coverage 语义不再随 D5 变动。

### 7.2 公平、排序、cooldown 与 Coverage

1. 每轮先做 pair 合法性与硬 cooldown 过滤；MATCH 和 5 档保障都不能复活被过滤边。
2. 某 pair 出现 targeted `CARD_PRESENTED` 后，接下来 `MATCH_PAIR_HARD_COOLDOWN_EFFECTIVE_ROUNDS=1` 个 relationship-aware effective round 不可再选该 pair；无其他合法 pair 时也不豁免，Router 应选非 pair 合法卡或进入耗尽控制。
3. 多个 `pending` tracker 竞争时用稳定全序：`qualifyingOpportunitiesSeen DESC -> matchedAt ASC -> coverageDebt DESC -> lastTargetedPresentedAt ASC(NULL first) -> canonicalPairId ASC`。“已用 1 次但尚未 offered”的 pair 先避免过期；仍相同时照顾早 MATCH 与 Coverage 欠账。
4. 非第 2 次强制保障位继续使用 R3 已冻结的 `Coverage + Signal - Cooldown` 排序与小池降权；MATCH 只能在合法候选内影响 Signal，不得覆盖 Coverage 净优势。
5. targeted `CARD_PRESENTED` 立即给该 pair/player 的 offered Coverage 记账一次；completed 另记 completed Coverage，skip/swap/no-action 不撤销 offered Coverage。因此获得 5 档保障的 pair 会自动降低后续 Coverage 欠账优先级。

必过 fixture 至少覆盖：4 人与 5 人、D5=1 与 D5=2、单 pair/玩家共享两条 MATCH/两条不重叠 MATCH、第 2 次保障竞争、cooldown 全挡、Coverage 欠账反转，并断言相同输入的 pair/card 顺序完全确定。

## 8. 单 Router 可达性与迁移原子性可测契约

### 8.1 单 Router 不可达门禁

- relationship-aware 的 start/resume/next/skip/swap/pack-switch/exhaustion-shuffle 全部必须收敛到同一 V2 Router 公开入口；Pack/UI/reducer 不得直接选卡。
- 唯一 legacy 例外是升级时已展示的 current card 可 completed 或 skip **一次**；它不写 V2 Heat/Signal/Coverage/5 档计数，收尾后下一张必须进 V2 Router。
- DEVELOP 门禁必须同时包含：静态 import graph 断言旧 selector/旧 future-deck 不可由上述入口到达；生产集成测试给旧 selector 注入抛错 spy，走完全部入口与耗尽/洗牌后调用数仍为 `0`；构建产物扫描禁止出现 `INTENSITY_WEIGHT` 或 `16:8:4:2:1` 的可执行路由引用。
- V2 Router 返回 empty/error 时只能进入本文 §6 Exhaustion Controller 或显式失败状态，绝不得 catch 后调旧 selector。

### 8.2 事务迁移契约

V1.6→V2 迁移必须是纯函数式 `oldSnapshot -> candidateSnapshot | MigrationError`：

1. 先完整读取并保留旧 bytes/版本，在隔离的 candidate 上完成 ID mapping、schema 升级、legacy current 标记、旧 future deck/路由字段删除与全量验证。
2. 验证通过后才用 old version/hash 作 compare-and-swap 单次替换；不得边读边写、先删旧数据或分步提交。
3. 任一 parse/mapping/schema/storage/CAS 失败时，原记录 bytes 与版本必须不变，不留 V2 半成品；返回可恢复错误并允许重试。
4. 迁移可重入：对已规范化 V2 snapshot 再运行，输出 bytes 完全一致；V2 Signal/MATCH/5 档 tracker 从空开始，不从旧历史、轮次、暂离或普通卡倒推。
5. 无合法 pair 不是迁移失败；Session 以 `NO_ELIGIBLE_PAIR` 可恢复，且不创建任何推测边。

必过测试：每个支持的旧 schema fixture 成功迁移；在 parse/mapping/validate/persist/CAS 每一阶段注入失败后深比原记录不变且无半写；并发修改触发 CAS 拒绝；成功结果再迁移 bytes 相同；legacy current 只可收尾一次，下一张的旧 Router spy 为 `0`。

## 9. DEVELOP 接入完成标准

- 三个受控 JSON 文件、唯一生成器和两个脚本命令均已落盘。
- 输入哈希、schema/语义、输出哈希、provenance 和逐 bytes 重生成比对全部纳入本地与 CI 必过 Gate。
- 生产可达的卡片/RuntimeConfig 读取只指向 `content/ssot/content-v1.3/`，且有测试防止业务硬编码成为第二真源。
- `manifest.json` 和发布证据均显式记录 `Content V1.3 / App V1.6 / Session v2`。
- Research Reviewer 复核 R2–R4 的结构化物化结果和新输出哈希；在此之前 Builder 不得直接以 Plan prose 或旧生产 `seed-*` 作为 V2 运行真源。
- D7=A 状态机、D8=A+ 耗尽/洗牌、D5 两分支公平 fixture、单 Router 不可达与迁移原子性测试全部通过；`D1/D2/D5/D6` 在 Human Gate 前仍不得由 Builder 选值。
