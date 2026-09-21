# PRODUCT_PLAN｜Party Night V1.4 新基线

- Plan Version：`PRODUCT_PLAN_V1.4`
- 日期：2026-09-22
- PROJECT_PHASE：`PLAN_REOPEN_REQUIRED`（Change C 受控重开；本文件经 Human Gate 批准后才可成为新 `DEV_BASELINE`）
- Product Goal：在不改变 Party Night 单设备、单桌、Local-first 与共享 Session Engine 的前提下，删除产品中已失去独立价值的“AI 即兴”内置玩法，以“随机玩一个”补足首页快速决策入口，收紧玩法启停不变量，并让 setup、主局切换、迁移与生成来源记录使用同一套真实玩法集合。
- Target Users：在酒吧、KTV、家庭或朋友聚会中，由一台手机担任主持人的 2 人及以上线下聚会用户；包含首次使用者、已有本地 Session/自定义玩法的升级用户。
- Problem：
  1. `ai-improv` 与其他题卡玩法边界模糊，却占据首页核心卡位、registry、seed、生成与回归链路，增加选择成本和维护面。
  2. 首页同时存在“更多玩法 / 我的游戏包 / AI 模型设置”三条低频入口，首屏决策过重。
  3. 当前内置玩法可以全部关闭，可能产生空的可玩集合；setup 的中间集合只含内置包，自定义包到下一页才追加，`N` 容易失真。
  4. mixed 的自动抽题限制与主持人主动切换玩法是两个概念，必须避免互相误限。
  5. Session 只能看到最终 Deck，不能区分 Provider 成功与本地 fallback，排障证据不足。
- Core Value：用户打开首页后，不需要理解“AI 即兴”或浏览多条管理入口；可以直接开局、指定一个玩法，或让系统从当前可玩的完整集合中随机选一个，同时旧数据升级安全、现场不出现“零玩法”死路。

## User Flow

### Flow A：首页“随机玩一个”

1. 用户点击首页 2×2 区域第 4 张“随机玩一个”。
2. 系统读取统一启用集合：无 active Session 时读取当前设置（未禁用内置玩法 + `enabled=true` 的自定义玩法）；有 active Session 时读取该局创建时固化的 `SessionConfig.enabledPackIds`，不与当前设置重新合并。
3. 若存在 active Session，再按当前在场人数过滤 `minPlayers`，从快照候选中等概率选一个，复用同一 Session 的主局切换入口；不因 `mode=mixed/single` 缩小主持人主动选择范围。
4. 若不存在 active Session，从启用集合中随机预选一个玩法，进入既有 `/setup?pack=...` 流程；最终人数不满足时，由 setup 在创建前重新从满足人数的启用集合选择，不能创建不可玩的 Session。
5. 若因旧数据、并发或坏记录导致无候选，停留当前页并提示“至少保留一个可玩的玩法”，不得静默选择已禁用玩法。

### Flow B：玩法启停

1. 用户在“游戏包”页关闭某个内置或自定义玩法。
2. 系统基于最终统一启用集合做原子校验。
3. 若关闭后仍至少有 1 个启用玩法，照常保存。
4. 若它是最后一个启用玩法，拒绝写入、保持当前开关为开启，并显示明确提示；不自动替用户启用其他玩法。
5. 自定义玩法的创建、编辑、删除、本地保存、`enabled` 字段和通用 card renderer 语义不改。
6. 若已有 active Session，设置页的启停只更新全局偏好，供下一局创建 Session 时取新快照；当前局的 `SessionConfig.enabledPackIds`、`deckSnapshot`、`currentPackId`、主持人 switcher 与 mixed 自动候选均不随设置变化，统一继续读取该局快照。这样可保证一局内规则稳定、离线/刷新可复现，并避免设置变化触发中途换包、删卡或重生成 Deck。

### Flow C：旧 Session 升级

1. 读取旧 Session 时识别 `ai-improv`。
2. `deckSnapshot` 中所有 `packId=ai-improv` 的旧卡直接丢弃，不改写为真心话或任何其他玩法。
3. 若未完成的 `currentRound` 指向被删除卡，则移除该未完成轮；已完成历史可保留原 `packId=ai-improv` 作为历史事实，但不得改名、转包或重新进入出题池。
4. 若 `currentPackId=ai-improv`，回落候选严格按以下顺序：先选已启用且当前人数/capability 可玩的 `truth-dare`；否则选规范启用序列中第一个满足同样条件的玩法。规范序列为内置 registry 固定顺序在前、自定义包按 `createdAt` 升序再按 `id` 升序在后。旧 `ai-improv` 卡只丢弃，绝不转入候选包。
5. migration/resolver 的输入必须包含旧 Session、当前 registry、preferences 与当前 custom packs；有可用 `SessionConfig.enabledPackIds` 时以 Session 快照为准，只有旧记录缺失或快照不可解析时才用当前设置解析一次并固化补齐。快照内已删除/不存在的包只能判为不可用，不能凭空恢复。若最终无合法候选，或依赖数据无法安全读取，则不激活该局，安全回首页提示修复玩法设置。
6. 迁移保持幂等；重复读取同一 fixture 必须得到完全相同的候选、快照与清理结果，不得继续删改非 `ai-improv` 数据，也不得污染真心话题库、使用记录或统计。

### Flow D：生成来源

1. `generationSource` 按最终实际采用的 Deck 卡片判定，而不是按 Provider 请求是否成功判定：只要 Deck 中存在任一 AI 生成卡，即记录 `generationSource=provider`。
2. 若 Deck 中不存在 AI 生成卡，则记录 `generationSource=fallback`；这覆盖全 seed、seed + custom、纯 custom，以及 Provider 成功但安全过滤/去重/阈值处理后没有任何 AI 卡被采用的情况。custom 卡不参与二者竞争：混入 custom 不改变“任一 AI 即 provider，否则 fallback”的结果。
3. 部分 Provider 结果加 seed 补位仍为 `provider`；请求失败或低于阈值并最终只采用 seed/custom 为 `fallback`。background refill 每次形成新的持久化 Deck 后按同一规则重新判定并原子更新，刷新恢复必须保留该值且与 Deck 重算结果一致。
4. 只记录来源枚举，不记录 API Key、Prompt、Authorization、Provider 原始响应或用户雷区原文副本。

## Functional Scope

### Requirements（R-047—R-064）

- **R-047｜移除 AI 即兴定义**：从内置 registry、内置 ID/核心卡 ID、首页/主局/设置关联标签、AI prompt 可用玩法、seed 聚合与新建 Session 候选中移除 `ai-improv`。不得把它改名伪装成新玩法；历史兼容仅由 migration 负责。
- **R-048｜旧 AI 即兴卡直接丢弃**：迁移时过滤 `deckSnapshot` 中全部 `ai-improv` 卡，并清理指向这些卡的未完成轮/使用引用；禁止把卡的 `packId/type/content` 改写成 `truth-dare`，禁止合并到真心话 seed 或自定义包。
- **R-049｜旧 currentPack 回落**：旧 Session 的 `currentPackId=ai-improv` 时，先取已启用且人数/capability 可玩的 `truth-dare`，否则取规范序列中第一个已启用且可玩的玩法；规范序列为内置 registry 固定顺序，其后为自定义包按 `createdAt`、`id` 升序。resolver 接收旧 Session、registry、preferences、custom packs；可用 Session 快照优先，缺失/坏快照才从当前设置补齐并固化。无候选或依赖不可读时安全回首页。旧 `ai-improv` 卡直接丢弃且不得转入任何回落包；已完成历史仍保留原始标识，不伪造历史。
- **R-050｜随机卡替换原卡位**：首页原 2×2 的第 4 个 AI 即兴卡位替换为“随机玩一个”；前三张真心话大冒险、谁最可能、我从来没有的顺序、视觉层级与快捷入口保持不变。
- **R-051｜随机候选口径**：“随机玩一个”的候选必须来自统一最终启用集合；无 active Session 取当前设置，有 active Session 取该局 `enabledPackIds` 快照并满足当前 active player 数量和 capability，不得因设置已改变而重写快照，且不得包含已删除的 `ai-improv`。随机逻辑可注入 RNG，便于无 flaky 测试。
- **R-052｜随机入口复用既有流程**：有 active Session 时随机结果走 `switchPackAndDeal` 等价入口并保持 Session ID/config/history；无 active Session 时走既有 quick setup，不新增第二套组局向导。随机结果不得绕过禁用状态。
- **R-053｜首页删三项**：仅从首页删除“更多玩法”“我的游戏包”“AI 模型设置”三项快捷入口及其占位间距；底部四 Tab、游戏包页、自定义玩法能力和设置页 AI 配置能力继续保留，可从既有底部导航进入。
- **R-054｜最后一个内置玩法不可关闭**：当某内置玩法是统一启用集合中的最后一项时，关闭操作必须被拒绝，开关保持开启，并展示“至少保留一个玩法”类可见提示；不得先写库再补偿。
- **R-055｜最后一个自定义玩法不可关闭**：自定义玩法开关参与同一最终集合校验；当它是最后一个启用玩法时同样保留当前项并提示。快速连点/并发保存不得短暂落成零玩法。
- **R-056｜启用集合单一真源与 Session 快照优先级**：统一 resolver 接收 registry、`disabledPackIds`、custom packs，以及可选的 `SessionConfig.enabledPackIds`、player count 和 capability policy；先按 ID 去重并剔除不存在/已退役定义，输出顺序固定为内置 registry 顺序在前、自定义 `createdAt`、`id` 升序在后，人数/capability 只在调用方要求时过滤。首页无 active Session、setup 和游戏包开关读取当前设置；创建 Session 时把结果固化为 `enabledPackIds`。存在 active Session 时，首页随机、主局 switcher、mixed 自动抽题统一以该 Session 快照为准；设置变化不回写当前 Session，只影响下一局。switcher 与 mixed 复用同一快照，但分别应用 R-057 规定的 capability policy。
- **R-057｜主局 switcher 不受 mixed 限制**：主持人主动打开主局 switcher 时，候选只看“启用 + 人数/capability 可玩”，不得因 Session 的 `mode` 或 `supportsMixedMode/mixable` 排除玩法；mixed 限制只作用于自动抽题候选。当前实现符合该方向，V1.4 以回归测试锁定。
- **R-058｜自定义玩法语义不动**：自定义玩法继续使用现有 schema、CRUD、本地持久化、`enabled`、卡片校验与通用 renderer；V1.4 不改自定义 Pack 数据结构，不把自定义玩法转成内置玩法，也不因移除 AI 即兴删除用户自定义数据。
- **R-059｜setup N 等于最终全量**：setup 中的 `N` 及最终 `SessionConfig.enabledPackIds` 必须在创建 Session 前一次性按最终集合计算，包含未禁用内置玩法与所有已启用自定义玩法，去重后计数；不得先显示/保存内置 N，再到 boundaries 页偷偷追加自定义包。指定单包 quick start 仍保持 `mode=single` 与单目标语义。
- **R-060｜Session 记录生成来源**：新生成 Session 在 Deck 确定时记录 `generationSource: "provider" | "fallback"`。判定只看最终持久化 Deck：任一 AI 生成卡即 `provider`；没有 AI 卡即 `fallback`，包括全 seed、seed + custom、纯 custom、请求失败，以及 Provider 成功但最终未采用 AI 卡。custom 卡不改变判定；部分 AI + seed/custom 补位仍为 `provider`。background refill 后按新 Deck 同规则重算并原子持久化；尚未完成生成时可为空，完成生成后必须有值，刷新恢复后必须一致。
- **R-061｜来源记录隐私最小化**：Session、summary、日志、导出与错误对象不得因 R-060 新增 API Key、Prompt、Authorization、Provider 原始响应或其他可反推出隐私配置的字段；不得把 Provider 名称/模型 ID 偷塞进 `generationSource`。
- **R-062｜V1.4 迁移与 schema**：若 R-048/R-060 需要提升 Session schema，迁移必须幂等、非破坏、兼容现有 quarantine/version-skew 机制；旧记录不得为满足新字段而伪造 Provider 成功事实，允许迁移记录在下一次实际生成前无 `generationSource`。
- **R-063｜指定真机验收**：发布候选必须通过 Redmi Note 11T Pro 的 USB ADB 真机测试，直接访问 production 站；覆盖首页 2×2、随机玩一个、三项入口已删除、最后一项关闭拦截、setup 最终 N、active Session 主局切换、旧 Session 回落、Provider/fallback 两条来源路径与刷新恢复。截图/录屏、ADB 设备信息、production URL、构建/commit 标识和结果进入 QA 证据。
- **R-064｜版本统一为 V1.4**：产品可见版本、Plan、测试证据、发布说明、迁移标识与新基线统一使用 `V1.4`；不得继续把本次需求标作 V1.2/V1.3，也不得改写封存的 V1.1 四份基线。

## Out of Scope

- 不新增游戏 Pack、规则条目、底部 Tab、账号、联机房间、云数据库、社区、支付或遥测。
- 不重做关系、氛围、1–5 强度、雷区、自定义 Pack schema、Game Engine 或视觉系统。
- 不删除游戏包页和 AI 设置页本身；R-053 只删除首页快捷入口。
- 不把 `ai-improv` 历史卡迁入真心话、自定义包或任何替代包。
- 不保存 Prompt、API Key、Provider 响应正文或额外生成隐私数据。
- 不在 PLAN 阶段修改业务代码、运行发布或变更 production。

## Technical Approach

### 1. Registry 与入口收敛

- `lib/game-packs/registry.ts` 不再导入/注册 `aiImprovPack`；同步收敛 `BUILTIN_PACK_IDS`、`CORE_PACK_IDS`、seed 聚合、名称/icon 映射和相关测试 fixture。
- 首页 2×2 不再完全等价于四个具体 pack：前三格仍由固定 pack 定义提供，第 4 格为动作型“随机玩一个”。不要为随机入口伪造一个 GamePackDefinition。
- 删除首页 `MoreGamesSheet`、`/packs`、`/settings/ai` 三个快捷展示，不要求删除其目标页或底层组件；无人引用的首页专属组件可由实现阶段按 code review 结论清理。

### 2. 统一启用集合与原子 Guard

- 抽出/收敛一个 resolver，规范输入为内置 registry、`disabledPackIds`、custom packs、可选 Session `enabledPackIds`、可选 player count 与 capability policy。它先按 ID 去重、剔除不存在/退役定义，再按“registry 固定顺序 → custom `createdAt`/`id` 升序”输出；人数与 capability 是显式调用参数，不得藏在基础启用判断中。
- resolver 有两种唯一上下文：无 active Session 时以当前 preferences/custom 状态解析，并在建局时固化快照；有 active Session 时以 `SessionConfig.enabledPackIds` 为权威输入。设置页改动不得更新 active Session 的快照、Deck、`currentPackId` 或候选，只影响下一局。理由是一局内必须保持规则稳定、离线与刷新可复现，且不能因局外设置变更触发中途删卡或重生成。
- 关闭动作先基于最新持久化状态计算 next set；`next.length===0` 时不写 preferences/gamePacks，并向 UI 返回结构化拒绝原因，确保 toggle 保持原值。
- 自定义创建/编辑/删除逻辑不改；仅自定义 `enabled` 从 true 切 false 时应用最后一项 guard。
- setup 在进入草稿阶段就加载最终集合；boundaries 只更新 boundaries 并创建 Session，不再二次追加 custom IDs。

### 3. 主局选择与 mixed 分层

- `listSwitchablePacks` 继续按 registry → enabled → minPlayers 构造主持人主动候选，不读取 `mode`/`supportsMixedMode`。
- mixed 自动出题继续在 card selector/generation 层尊重 mixed capability；两条路径以独立测试锁定，避免后续“复用过滤器”造成回归。

### 4. Session migration 与生成来源

- migration 在 schema parse 前完成 `ai-improv` 清理与 currentPack fallback；过滤需同步维护 `deckSnapshot`、`usedCardIds` 与未完成轮引用的一致性。
- migration 调用 resolver 时传入旧 Session、registry、preferences、custom packs；优先使用可用 Session 快照，只有快照缺失/坏损时才以当前设置补齐并固化。回落顺序锁死为“可玩的 `truth-dare` → 规范序列首个可玩项”；没有候选或依赖不可读则安全回首页。旧 `ai-improv` 卡只删除，不转写、不转入回落包。
- 已完成 `rounds` 保留原始历史标识；summary 对未知/退役 pack 使用安全展示名，不触发 registry 启动。
- `generationSource` 属于 Session 运行元数据，不属于 Card `source`；两者不可混用。Deck 首次生成与每次 background refill 都由同一纯函数扫描最终持久化卡：存在任一 AI 卡返回 `provider`，否则返回 `fallback`；custom 卡忽略，不改变上述结果。Deck 与枚举在同一 repository command/事务中持久化。
- 迁移旧 Session 时不猜来源；旧记录可缺省，只有新的实际生成完成事件才落 `provider/fallback`。

## Data / API

- `GameSession` 增量建议：`generationSource?: "provider" | "fallback"`。新 Session 在 `generating` 阶段允许缺省；进入 `active` 且本轮完成 Deck 生成后必填。
- `SessionConfig.enabledPackIds`：建局时由当前设置解析并固化的最终去重全集，是 active Session 内首页随机、switcher 与 mixed selector 的启用真源；设置后续变化不修改该快照。mixed 在快照上再应用自动混合 capability；single quick start 只含目标 pack。
- Preferences：继续使用 `disabledPackIds`；不新增随机入口偏好、不记录随机历史。
- CustomGamePack：schema 与 repository 不变。
- API：`/api/generate-session` 请求/响应协议无新增隐私字段；生成来源由客户端/编排层扫描最终采用卡判定，不信任请求成功状态或 Provider 自报的 `meta.provider`。
- Migration：旧 `ai-improv` 卡只删除、不转写、不转入；`currentPackId` 按“可玩的 `truth-dare` → 规范启用序列首项”回落；输入需含旧 Session、registry、preferences、custom packs，已完成历史不改写。

## Key Assumptions

1. “删更多玩法/我的游戏包/AI模型设置三项”指删除首页三条快捷入口，不是删除游戏包和设置能力；该解释与“四 Tab 保留”“自定义语义不动”同时成立。
2. “随机玩一个”是动作入口，不是新的 Game Pack；它从统一启用集合中选择真实 pack。
3. “最后一个”按内置与自定义合并后的统一启用集合计算；只有 toggle 关闭受阻，自定义删除流程本轮不扩写新语义。
4. setup 的 `N` 指最终写入 `SessionConfig.enabledPackIds` 的去重数量；不存在单独的统计口径。
5. 已完成 `ai-improv` round 是历史事实，保留比改写或抹除更安全；“直接丢弃”适用于可再次出题的旧卡与未完成引用。
6. Redmi Note 11T Pro 可通过 USB ADB 连接并访问 production；这是发布验收前置条件，不是 Plan Readiness 的外部未决问题。
7. Session 创建时的启用集合是该局的规则快照；局外设置只影响下一局。此取舍优先保证现场一致性、离线/刷新可复现和历史可审计，不在进行中自动同步设置。
8. `generationSource` 描述最终 Deck 是否实际采用 AI 卡，不描述请求是否成功；custom 卡是中性来源，不改变“任一 AI 为 provider、否则 fallback”的二值判定。

## Competitor / Research Summary

- 本轮是已实现产品的范围收敛与一致性修订，不依赖新的竞品结论。
- V1.1 四份基线已证明单 Session、多 Pack、Local-first、fallback 与四 Tab 架构可行；V1.4 只缩减一个内置包和首页入口，并修复集合/迁移/可观测性口径。
- 代码事实已核验：当前 registry/常量/seed 仍含 `ai-improv`；首页第 4 格仍由 core pack 生成；setup 草稿先含内置包、boundaries 再追加 custom；主局 switcher 当前不受 mixed 限制；Session schema 当前未记录 generation source。

## Risks

| 风险 | 等级 | 控制措施 |
|---|---|---|
| 删除 registry 后旧 Session 因 currentPack/card 引用失效而白屏 | P0 | 先写 migration fixture 与回落测试；保留 quarantine/version-skew；禁止直接清库 |
| 把旧 AI 即兴卡误转成真心话，污染题库和统计 | P0 | R-048 逐字段断言“删除而非改写”；加入负断言检查 truth-dare 内容未增加 |
| 启停并发导致短暂零玩法 | P0 | 最新状态上原子预检；拒绝时不写库；双击/跨内置与自定义测试 |
| 随机入口抽到禁用、人数不足或已退役 pack | P1 blocking | 候选只取统一 resolver；active Session 加 capability 过滤；固定 RNG 测试边界 |
| setup 展示 N 与最终 config 不一致 | P1 blocking | 一次加载最终集合；UI N、draft、persisted config 三处同源断言 |
| active Session 与新设置分叉后两条出题路径口径不一 | P1 blocking | Session 快照优先；首页随机/switcher/mixed 共用快照 fixture，设置只在下一局生效 |
| 误把 switcher 与 mixed 共用过滤器，主动切换丢玩法 | P1 blocking | 两条候选函数/测试分离；single/mixed 各做 switcher 回归 |
| 旧 `ai-improv` 回落因候选排序或依赖缺失而漂移 | P1 blocking | 固定 registry/custom 顺序；显式注入 Session/preferences/custom/capability；无候选安全回首页；重复迁移 fixture |
| generationSource 泄露 Provider 或 Prompt 隐私 | P0 | 仅枚举；schema 白名单；日志/导出/IDB fixture 泄漏审计 |
| Provider 部分成功或 refill 后来源枚举失真 | P1 blocking | 每次按最终 Deck 的 AI 卡存在性判定，并与 Deck 原子持久化、刷新重算核对 |
| 首页入口删除被误解为删除底层功能 | P1 non-blocking | E2E 从底部 Tab 验证游戏包与设置仍可达，自定义 CRUD 不回归 |
| 真机与桌面自动化表现不同 | P1 blocking（Release） | Note 11T Pro USB ADB 访问 production 完整验收，证据绑定 commit/build |

## DoD

1. R-047—R-064 全部实现，FR 追踪矩阵每项均有代码与测试证据。
2. 全仓业务路径不再把 `ai-improv` 注册为可启动内置玩法；新建 Session、首页随机、setup、主局 switcher、mixed selector、Provider prompt 均不能选到它。
3. 旧 Session fixture 升级后：AI 即兴 Deck 卡被删除且未转入任何包、未完成引用被清理、已完成历史未改写；回落按“可玩的 `truth-dare` → registry 顺序首项 → custom `createdAt`/`id` 首项”确定。覆盖真心话禁用、人数不足、已删除 custom、依赖不可读/无候选安全回首页及二次迁移完全相同，并断言真心话卡数/内容未被污染。
4. 首页保持 2×2：前三格固定，第 4 格“随机玩一个”；“更多玩法 / 我的游戏包 / AI 模型设置”三条首页入口不可见，但底部 Tab 可进入游戏包和设置。
5. 随机入口在有/无 active Session、single/mixed、禁用项、自定义项、人数不足、固定 RNG 边界下均行为确定；active Session 期间修改设置后，首页随机、switcher、mixed selector 仍读取原 Session 快照，当前局候选与 Deck 不变，新设置只在下一局生效。
6. 内置与自定义玩法都无法通过关闭开关把统一集合降为 0；拒绝时状态和持久化均保持不变，并有用户可见提示。
7. setup 的 N、draft 与最终持久化 `enabledPackIds` 一致，包含启用自定义玩法且无重复；single quick start 不受破坏。
8. 主局 switcher 在 single/mixed 下均展示全部“启用 + 人数可玩”玩法，不受 mixed capability 限制；自动 mixed 抽题仍遵守自身限制。
9. 完整 AI、部分 AI + seed/custom 补位均落 `provider`；请求失败、阈值失败、全 seed、seed + custom、纯 custom、Provider 成功但零 AI 卡被采用均落 `fallback`。background refill 后依最终 Deck 原子重算，刷新恢复值与 Deck 一致；相关日志、summary、导出、缓存中无 Key、Prompt、Authorization、Provider 原始响应。
10. 自定义 Pack CRUD、现有 7 个保留内置玩法、规则库、Party Tools、四 Tab、关系/氛围/1–5 强度/雷区、刷新恢复均回归通过。
11. `lint`、`typecheck`、全部 unit/integration/E2E、production build 与 production smoke 全绿；无新增 console error、白屏或数据清空。
12. Redmi Note 11T Pro 通过 USB ADB 对 production 站完成 R-063 清单，QA 证据含设备、URL、commit/build、时间和截图/录屏，结果 PASS。
13. 所有产品与发布标识为 V1.4；V1.1 封存文档未被修改。

## P0 / P1 / P2

- P0（非做不可）：无 Plan 未决项。开发执行 P0 为 R-047—R-064、迁移不污染、至少一玩法不变量、generationSource 隐私、自动化全绿及指定真机 production 验收。
- P1（blocking）：无 Plan 未决项。实现阶段任何随机候选、setup N、switcher/mixed 分层、底层功能可达性或真机验收失败均阻塞 Release。
- P1（非 blocking）：无。
- P2：不在 V1.4 扩展随机权重、最近玩过去重、随机历史、首页个性化或新的 Pack 推荐算法。

## Human Decisions Needed

- 无。GAP-01—GAP-10 已由用户逐项闭合；本轮不再询问产品口径。
- Human Gate 只需确认本文件作为 `DEV_BASELINE=PRODUCT_PLAN_V1.4`；未获得明确“第二阶段，开发”前不得修改业务代码。

## FR 追踪矩阵

| Requirement | 主要实现面 | 必测证据 |
|---|---|---|
| R-047 | registry/constants/seeds/labels/prompt | registry 唯一性、全仓启动路径无 `ai-improv` |
| R-048 | session migration | 旧卡/未完成引用删除；truth-dare 负污染断言；幂等 |
| R-049 | migration fallback/summary | 同一 fixture 锁定 truth-dare 优先、registry/custom 稳定次序；真心话禁用、人数不足、已删 custom、无依赖/无候选回首页；旧卡不转入、历史不改写、重复迁移幂等 |
| R-050 | home card model/UI | 2×2 顺序与第 4 动作卡视觉/E2E |
| R-051 | enabled resolver/random selector | builtin+custom、disabled、minPlayers、fixed RNG |
| R-052 | pack entry/quick setup/switcher | active Session ID 不变；无 Session 复用 setup |
| R-053 | home page | 三入口消失；四 Tab及目标页仍可达 |
| R-054 | builtin enablement | 最后内置关闭拒绝且不写 preferences |
| R-055 | custom enablement | 最后自定义关闭拒绝、并发/双击一致 |
| R-056 | shared enabled resolver | 同一 fixture 断言 home/setup/pack page 取当前设置；active Session 的 home random/switcher/mixed 同取快照；改设置当前局不变、下一局生效；排序/去重/不存在定义/capability 边界 |
| R-057 | listSwitchablePacks | single/mixed 均不受 mixable 限制；人数限制仍生效 |
| R-058 | custom repository/UI | CRUD、enabled、renderer、旧数据回归 |
| R-059 | setup/boundaries/session config | N=draft=persisted final IDs，含 custom、去重 |
| R-060 | session schema/generation activation | 完整 AI、部分 AI+补位、请求失败、阈值失败、全 seed、seed+custom、纯 custom、零采用 AI、background refill 的唯一判定及原子落库/刷新恢复 |
| R-061 | redaction/export/cache/log audit | Key/Prompt/Auth/response 不落 Session 或日志 |
| R-062 | schema migration/repository | legacy/current/newer/quarantine/version-skew/幂等 |
| R-063 | production + USB ADB QA | Note 11T Pro 真机清单、截图/录屏、URL/commit/build |
| R-064 | version surfaces/docs/release | V1.4 字符串审计；V1.1 文档 git diff 为零 |

## 旧条款替换清单

> 以下是 V1.4 对 V1.1 四份封存基线的语义替换。封存文件不原地修改；开发与验收遇到冲突时，以本清单和 R-047—R-064 为准。未列条款继续有效。

| V1.1 旧条款/位置 | V1.4 替换口径 |
|---|---|
| Constitution §I.3：首页 2×2 四个具体玩法必须保留 | 前三玩法保留；第 4 格由 AI 即兴替换为动作型“随机玩一个” |
| Constitution §IV.2：8 个内置 Pack 均接入 | 删除 `ai-improv`，保留 7 个内置 Pack；自定义语义不变 |
| Constitution §V 中“新增 AI 玩法/AI 即兴”相关保留口径 | AI 仍是其他内容玩法的增强；不再存在独立 AI 即兴 Pack |
| Constitution Product Scope“现有首页及 4 个内置 AI 玩法” | 改为首页前三固定玩法 + 随机动作卡；可玩内置集合为 7 包 |
| SPEC §2.2/§5.2：原 4 核心卡 + 更多玩法 + 我的游戏包 + AI 模型设置 | 删除 AI 即兴、更多玩法、我的游戏包、AI 模型设置首页入口；底层页面/能力保留 |
| SPEC FR-002：首页保留原 4 核心 AI 玩法 | 由 R-050 替换 |
| SPEC FR-013：AI 即兴继续可用 | 由 R-047—R-049 反向替换：退役且只做安全迁移 |
| SPEC FR-009/Edge Case：switcher 展示启用玩法 | 由 R-057 明确：主持人主动 switcher 不受 mixed 限制 |
| SPEC FR-036：自定义 Pack 本地持久化 | 继续有效，并由 R-055/R-058 增加最后一项 guard、但不改其余语义 |
| PLAN §3.2/§7/§8：AI 即兴参与 registry、Deck 与回归 | 从所有新建候选移除；仅 migration 识别历史 ID |
| PLAN §12：缺 currentPackId 从旧数据推导 | 增加“可玩的 `truth-dare` → registry 固定顺序首项 → custom `createdAt`/`id` 首项”的显式回落；旧 `ai-improv` 卡只过滤、不转入 |
| TASKS T106/T128/T160/T164/T205：原 4 核心/AI 即兴回归、8 内置玩法 | 改为 7 内置玩法 + 首页随机卡 + 退役迁移回归 |
| TASKS T159/T161：“更多玩法”首页入口 | 首页入口删除；工具与玩法仍可从既有对应页面/主局进入 |
| 现有 setup：内置草稿 + boundaries 追加 custom | 由 R-059 替换为创建前一次性最终全量集合 |
| 现有 Session schema：无生成来源 | 由 R-060—R-062 增加最小枚举元数据与兼容迁移 |
| V1.1 真机泛化要求 | 由 R-063 收紧为 Note 11T Pro、USB ADB、production 站指定证据 |

## Readiness Score（Plan Readiness Score / 计划成熟度，满分 100）

- 产品目标与用户需求（20）：20。目标是明确的首页减法、退役迁移和启用集合一致性，用户已逐项拍板。
- 核心方案完整性（20）：20。已补齐 active Session 快照优先级、旧局稳定回落序与最终 Deck 来源判定；入口、随机、启停、setup、switcher、migration、来源字段与发布验收均有唯一契约。
- 外部事实与竞品验证（20）：18。本轮不依赖新竞品假设；仓库代码事实已核验。真机结果属于实现后 Release 证据，不影响 Plan 成熟度。
- 技术可行性（15）：15。resolver 输入、稳定顺序、快照优先级、migration 依赖和 Deck 来源纯判定均可沿用现有 registry、repositories、migration 与 Session schema 实现。
- 风险与异常场景（10）：10。覆盖设置/Session 分叉、旧卡污染、候选依赖缺失、currentPack 失效、零玩法、并发启停、混合 Deck/refill 来源、隐私泄漏与版本错位。
- 开发范围与 DoD（10）：10。R-047—R-064、DoD、追踪矩阵和旧条款替换完整，三个原 blocking P1 均有同 fixture 验收断言。
- 未决问题（5）：5。Research Review V1.4 第 2 轮的 P1-01—P1-03 已在契约层闭合，无待拍板产品问题；是否通过仍待 Reviewer 第 3 轮独立复核。
- 合计：**98 / 100**。
- Gate（进 Human Review 条件）：**待复核**。Planner 自评 Readiness ≥ 90、Plan P0=0、文内 blocking P1=0，且三个打回项已有明确回归路径；但第 2 轮 Reviewer 结论为 FAIL，须经第 3 轮 Research Reviewer 确认后才能进入 Human Review。

## Research Review Round

- V1.4 第 2 轮 Research Review：`FAIL`，打回 P1-01（active Session 与设置优先级）、P1-02（旧 `ai-improv` 回落排序/依赖）、P1-03（混合 Deck 的 `generationSource`）。
- 本轮 Planner 修订：设置变化只影响下一局、active Session 统一以创建快照为准；旧局按可玩 `truth-dare` → 规范序列首项回落且旧卡只丢弃；最终 Deck 任一 AI 卡为 `provider`、否则为 `fallback`，custom 不改变判定。上述规则已同步进入 Flow、R、Technical Approach、Data/API、Risks、DoD 与追踪矩阵。
- 下一环节：Research Reviewer 第 3 轮复核三项契约及验收断言；通过后才可将 `PLAN_GATE` 置为 `READY_FOR_HUMAN_REVIEW`。

- PLAN_GATE：`IN_PROGRESS`

---

目标：形成可由 Human Gate 锁定的 Party Night V1.4 新开发基线。  
剩 P0：0（Plan 阶段）。  
下一步：Research Reviewer 第 3 轮复核；通过后由 TM 请求 Human Gate，只有用户明确说“第二阶段，开发”才进入 DEVELOP。
