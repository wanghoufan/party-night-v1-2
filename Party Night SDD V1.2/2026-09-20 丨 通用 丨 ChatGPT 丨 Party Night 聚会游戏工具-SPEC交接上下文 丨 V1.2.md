# Feature Specification: Party Night V1 — 私人聚会游戏引擎

**Feature Branch**: `001-party-night-v1`  
**Created**: 2026-09-20  
**Status**: Freeze candidate — V1.2 Provider Compatibility, Encrypted Secret Storage & UI Safety revision  
**Input**: 个人自用的夜店/酒吧/聚会游戏工具；采用 Party Game Engine + Game Pack 架构，首发真心话大冒险、谁最可能、我从来没有、AI 即兴任务，并采用方案 A｜霓虹夜店风。

## 1. Product Intent

Party Night 是一款为个人使用设计的移动端聚会游戏工具。用户拿出手机后，可以在很短时间内完成组局，系统根据人数、关系、氛围、尺度和雷区，为本局准备一整套游戏内容；游戏开始后尽量本地运行，不要求每轮等待 AI。

核心定位不是“真心话大冒险题库”，而是：

> **Party Game Engine：统一管理玩家、边界、随机、节奏、题卡、Session 和本地存储；具体玩法作为 Game Pack 安装在引擎之上。**

V1 面向单设备、单桌、个人自用，不解决商业化、账号、社区或多人联网同步问题。

## 2. User Scenarios & Testing (mandatory)

### User Story 1 - 20 秒内完成组局并开始今晚一局（Priority: P1）

用户打开 Party Night，点击“今晚开局”，依次选择玩家/人数、彼此关系、今晚氛围、游戏强度，并可选设置雷区；系统随后准备整局内容并进入第一轮。

**Why this priority**：这是产品的核心价值入口。现场使用时，开局速度直接决定工具是否真的会被使用。

**Independent Test**：在全新设备状态下，从首页进入“今晚开局”，完成配置并进入第一轮；不要求注册或登录。

**Acceptance Scenarios**:

1. **Given** 用户首次打开 App，**When** 点击“今晚开局”并完成必要选择，**Then** 系统可以创建一个 Session 并进入生成等待页。
2. **Given** 用户上次已经保存玩家和偏好，**When** 再次组局，**Then** 系统可复用上次配置，用户无需重复输入全部信息。
3. **Given** 用户不想输入每个人名字，**When** 仅选择人数，**Then** 仍可开始游戏，只是涉及点名的内容使用“玩家 1/2…”或群体表述。

---

### User Story 2 - AI 一次生成整局并离线继续玩（Priority: P1）

用户完成组局后，系统一次生成足够支撑一局的题卡，并经过边界、结构与重复检查。生成成功后，抽卡/换题/下一轮等高频操作不再依赖每轮 AI 请求。

**Why this priority**：酒吧/夜店网络不稳定且等待破坏氛围；整局预生成是 Party Night 与普通 AI 聊天式玩法的关键区别。

**Independent Test**：生成一局后断网，继续完成至少 10 轮游戏，确认本地题卡和引擎仍可运行。

**Acceptance Scenarios**:

1. **Given** Session 配置有效且网络可用，**When** 用户开始生成，**Then** 系统得到一个经过校验、过滤、去重的可玩 Deck。
2. **Given** Deck 已成功保存到本机，**When** 网络断开，**Then** 用户仍可完成、换题、跳过和进入下一轮。
3. **Given** AI 超时、返回非法结构或题量不足，**When** 生成失败，**Then** 系统提供重试或使用本地内置题库补齐，而不是卡死。

---

### User Story 3 - 混合模式自动主持整场游戏（Priority: P1）

用户进入“今晚开局”后，无需手动在多个玩法之间来回切换。引擎根据当前阶段、强度、已玩历史和玩家参与情况，在不同 Game Pack 之间安排轮次。

**Why this priority**：混合主持把产品从“几个小游戏合集”提升为“AI 聚会主持人”。

**Independent Test**：启动一个 20 轮 Session，确认至少能在配置允许范围内混合调用多个 Game Pack，且卡片不重复、轮次状态正确。

**Acceptance Scenarios**:

1. **Given** 用户选择混合模式，**When** 进入连续轮次，**Then** 引擎可在真心话大冒险、谁最可能、我从来没有、AI 即兴任务之间选择下一轮。
2. **Given** 某玩家刚被选中过，**When** 下一轮需要点名，**Then** 系统优先避免连续选择同一玩家。
3. **Given** 本局从早期进入后期，**When** 强度为 3 或以上，**Then** 内容可以逐渐升温，但不得突破雷区。

---

### User Story 4 - 用户始终掌控尺度和边界（Priority: P1）

用户可以在组局前选择 1–5 级强度并配置雷区；游戏中可以随时“太温和 / 刚刚好 / 有点过了”调整后续强度。任何题目都可以无惩罚跳过。

**Why this priority**：这是高刺激社交游戏能够被安心使用的前提。

**Independent Test**：启用多项雷区，生成并执行一局；检查被禁标签不进入 Deck，同时测试局中调整和无惩罚跳过。

**Acceptance Scenarios**:

1. **Given** 用户禁用身体接触和喝酒惩罚，**When** 生成/选择题卡，**Then** 带有相应标签的题卡不得进入可玩队列。
2. **Given** 用户在局中将强度从 3 调整为 4，**When** 后续抽卡，**Then** 引擎按新的允许强度选择内容，但不改变雷区。
3. **Given** 用户不愿执行当前题目，**When** 点击“跳过”，**Then** 直接进入可继续流程，不触发默认惩罚。

---

### User Story 5 - 单个玩法可以快速开始（Priority: P2）

用户不想玩整晚混合模式时，可以从首页直接进入真心话大冒险、谁最可能、我从来没有或 AI 即兴任务，并复用上次的玩家与边界偏好。

**Why this priority**：覆盖“突然想玩一个小游戏”的轻量场景。

**Independent Test**：从首页点击“谁最可能”，使用上次配置在最少步骤内进入第一题。

**Acceptance Scenarios**:

1. **Given** 用户有上次配置，**When** 从首页选择一个单模式，**Then** 系统允许快速开始，不强制重新走完整组局向导。
2. **Given** 用户没有历史配置，**When** 首次进入单模式，**Then** 仅要求完成该模式必要的最小设置。

---

### User Story 6 - 自定义游戏包与题卡（Priority: P2）

用户可以在“我的游戏包”中创建本地 Game Pack，添加/编辑/删除题卡，并将它加入快速模式或混合模式候选。

**Why this priority**：个人自用的长期价值在于可以积累属于自己的玩法和梗，不受内置题库限制。

**Independent Test**：创建一个自定义 Game Pack，添加 3 张题卡，启用后开始一局并至少抽到其中 1 张。

**Acceptance Scenarios**:

1. **Given** 用户进入“我的游戏包”，**When** 创建名称、图标和题卡，**Then** 数据只保存在本机并在重启后存在。
2. **Given** 用户禁用某个自定义 Game Pack，**When** 开启混合模式，**Then** 该 Pack 不参与抽取。
3. **Given** 用户编辑或删除题卡，**When** 下一次新建 Session，**Then** 使用最新版本内容；已进行中的 Session 不被意外改写。

---

### User Story 7 - Session 可暂停、恢复、动态加减玩家（Priority: P2）

聚会过程中用户可能锁屏、刷新、去拿酒或临时有人加入/离开。系统应保存当前 Session，并允许动态管理玩家而不重开整局。

**Why this priority**：这是实际聚会场景中非常常见的中断。

**Independent Test**：进行 5 轮后刷新页面并恢复；增加一名玩家、将另一名玩家设为暂离，继续至少 3 轮。

**Acceptance Scenarios**:

1. **Given** 游戏进行中，**When** 页面被刷新或 PWA 重启，**Then** 系统提示继续未完成 Session，并恢复至最近持久化轮次。
2. **Given** 新玩家加入，**When** 用户在局内玩家管理中添加昵称，**Then** 后续点名逻辑可以包含新玩家。
3. **Given** 玩家暂时离场，**When** 将其设为暂离，**Then** 历史保留，但其不参与新的点名选择。

---

### User Story 8 - 结束本局并看到轻量总结（Priority: P3）

游戏结束时，用户可以看到轮次、时长、参与人数、各玩法分布等轻量总结，并可“再来一局”。

**Why this priority**：总结能形成完整闭环，但不应演变为复杂数据分析系统。

**Independent Test**：完成或主动结束一局，确认统计与 RoundHistory 一致，并能基于当前偏好快速再开一局。

**Acceptance Scenarios**:

1. **Given** Session 有已完成轮次，**When** 用户结束本局，**Then** 显示总轮次、时长、参与人数和模式分布。
2. **Given** 用户点击“再来一局”，**When** 新 Session 建立，**Then** 可以复用上局配置，但新的 RoundHistory 和 used-card 状态必须清空。

### User Story 9 - 在 App 内安全配置 AI Provider 与 API Key（Priority: P1）

用户无需修改 `.env` 或重新构建 Docker，即可在“AI 模型设置”中配置 AI。**DeepSeek 官方为默认 Provider**；OpenCode Go 保留为**实验性、手动选择**的兼容入口；另支持自定义 OpenAI Compatible。用户可以填写 API Key、测试连接，并在浏览器能力允许时将 Key 加密保存到当前设备。清空 API Key 属于危险操作，必须经过明显隔离和二次确认。

**Why this priority**：AI 整局生成是核心能力；个人自用场景需要能够随时切换账号/接口，而误清空 Key 会直接造成使用中断。

**Independent Test**：首次进入 AI 设置时 DeepSeek 官方为默认 → 填写 DeepSeek Key → 测试连接 → 加密保存 → 刷新后仍保持已配置；OpenCode Go 默认不自动启用且带“实验性”说明；点击“清空 API 密钥”一次时 Key 不变化；取消确认后 Key 不变化；明确二次确认后 Key 才被删除。

**Acceptance Scenarios**:

1. **Given** 用户从未配置 AI，**When** 打开 AI 模型设置，**Then** **DeepSeek 官方默认选中**，同时可选择“OpenCode Go（实验性）”或自定义 OpenAI Compatible；页面不得出现 OpenCode 免费 Zen 预设。
2. **Given** 用户查看 OpenCode Go，**When** 尚未主动选择/启用，**Then** 系统不得将其作为默认或自动 fallback，并必须展示“官方主要面向 coding agents，Party Night 兼容性可能变化”的说明。
3. **Given** 用户明确手动选择 OpenCode Go，**When** 使用预设，**Then** Base URL 固定/预填为 `https://opencode.ai/zen/go/v1`，默认模型为 `deepseek-v4.1-flash`；适配器使用独立 User-Agent 与稳定 `x-opencode-session`，但 UI 不得宣称官方保证 Party Night 场景。
4. **Given** 用户选择 DeepSeek 官方，**When** 使用预设，**Then** Base URL 固定/预填为 `https://api.deepseek.com`，默认模型为 `deepseek-flash`，并作为 V1 默认 AI Provider。
5. **Given** 用户填写有效 Key，**When** 点击“测试连接”，**Then** 系统只执行最小测试请求并显示成功/失败，不在 UI 或日志中显示完整 Key。
6. **Given** 用户选择“保存到本机”，**When** 浏览器支持 V1 的安全存储能力，**Then** API Key 先经 Web Crypto AES-GCM 加密后再持久化，明文 Key 不写入 IndexedDB。
7. **Given** 浏览器无法可靠持久化 non-extractable CryptoKey，**When** 用户保存 Key，**Then** 系统明确提示“仅本次会话保存”，不得回退为明文持久化。
8. **Given** 用户点击红色“清空 API 密钥”，**When** 第一次点击，**Then** 只打开二次确认弹窗，Key 不发生变化。
9. **Given** 二次确认弹窗已打开，**When** 点击“取消”或返回关闭，**Then** Key 保持原值。
10. **Given** 二次确认弹窗已打开，**When** 明确点击红色“确认清空”，**Then** 当前 Provider 的 Key 才被删除，并显示“API 密钥已清空 / 未配置”。
11. **Given** 当前 Provider Key 被清空，**When** 用户尝试 AI 生成，**Then** 系统提示重新配置/切换 Provider，且仍可选择使用本地 seed deck 开局。

---

## 3. Detailed User Flow

### 3.1 主流程：今晚开局

`打开 → 首页 → 今晚开局 → 选玩家/人数 → 关系 → 氛围 → 强度 → 可选雷区 → 生成整局 → 第一轮 → 连续轮次 → 结束总结`

#### Step A：首页

首页必须突出：

- 主 CTA：**今晚开局**。
- 快速模式：真心话大冒险、谁最可能、我从来没有、AI 即兴。
- 次级入口：我的游戏包。

首次进入不弹登录，不强制教程。

#### Step B：玩家/人数

- 支持 `2 / 3–5 / 6–8 / 9+ / 自定义` 或等价交互。
- 用户可只选人数，也可维护昵称列表。
- 最近玩家可复用。

#### Step C：关系

至少支持：

- 第一次见/拼桌
- 刚认识
- 普通朋友
- 熟人局
- 很熟
- 情侣/暧昧

#### Step D：氛围

至少支持多选或等价表达：

- 破冰
- 搞笑
- 暧昧
- 放开玩
- 随机

#### Step E：强度

采用 1–5 级，不使用“safe / 大尺度”二分：

1. 安全破冰
2. 熟悉起来
3. 有点刺激
4. 明显暧昧/放开玩
5. 高能（仍受雷区和安全底线限制）

#### Step F：雷区

内置可选雷区至少包括：

- 身体接触
- 喝酒惩罚
- 前任
- 性/两性经历
- 收入/财富
- 手机隐私
- 发朋友圈/公开发布
- 联系陌生人
- 拍照/视频
- 社交账号
- 自定义文本雷区

#### Step G：生成整局

- 根据配置生成一整局 Deck；目标数量 30–50 张，具体按模式和配置可调整。
- UI 展示“分析配置 / 匹配题库 / 安全过滤 / 生成完整游戏”等进度语言，不暴露内部模型调用细节。
- 成功后 Deck 存入本地 Session。

#### Step H：游戏中

高频操作：

- 完成
- 换一个
- 跳过
- 下一轮（可合并进完成动作）

局中菜单：

- 强度调节：太温和 / 刚刚好 / 有点过了，或 1–5 滑块。
- 玩家管理。
- 暂停。
- 结束本局。

#### Step I：结束

展示：

- 参与玩家数
- 总轮次
- 总时长
- 各玩法轮次分布
- 再来一局

### 3.2 单模式快速流程

`首页 → 选择模式 → 使用上次配置/最小配置 → 准备 Deck → 游戏 → 结束`

### 3.3 AI 模型设置流程

入口：`首页/设置 → AI 模型设置`。AI 未配置时，生成页也可提供“去配置 AI / 使用本地题库”入口。

#### Step A：选择 Provider

V1 仅预设：

- **OpenCode Go**：Base URL `https://opencode.ai/zen/go/v1`，默认模型 `deepseek-v4.1-flash`。URL 中包含 `zen/go` 是 OpenCode Go 官方接口路径，不代表启用免费 Zen。
- **DeepSeek 官方**：Base URL `https://api.deepseek.com`，默认模型 `deepseek-flash`（当前由 DeepSeek-V4.1-Flash 提供服务）。
- **自定义 OpenAI Compatible**：用户填写名称、Base URL、Model ID。

V1 **不提供 OpenCode 免费 Zen** 预设，也不将其作为自动 fallback。

#### Step B：填写与保存 API Key

- API Key 默认掩码显示，仅用户主动点击“显示”时短暂显示。
- 普通操作：显示/隐藏、测试连接、保存。
- ProviderProfile 可直接保存在当前设备；API Key 若跨重启保存，必须先通过 **Web Crypto AES-GCM** 加密，IndexedDB 只保存密文、IV 与必要元数据。
- 加密键使用 **non-extractable `CryptoKey`**。若该安全存储路径不可用，Key 只能保留在当前会话内，禁止明文 fallback。
- 生成/测试时，API Key SHOULD 通过同源请求的 `Authorization` header 临时发送给 Proxy，不放入 URL 或普通 JSON body。
- 服务端 Proxy 仅在一次生成/测试请求内使用 Key，禁止持久化或日志记录完整 Key。

#### Step C：测试连接

`选择 Provider → 填 Key → 测试连接 → 显示结果 → 保存`。

失败时必须给可理解的状态（鉴权失败、网络失败、模型不可用、格式错误），但不得回显 Key。

#### Step D：清空 API Key（Danger Zone）

危险操作必须在普通配置区下方独立呈现：

```text
普通配置区
[ 显示/隐藏 ]   [ 测试连接 ]
[ 保存 ]

------------------------
危险操作
清空后需重新填写密钥才能继续使用此接口
[ 红色垃圾桶图标  清空 API 密钥 ]
```

第一次点击“清空 API 密钥”只打开确认弹窗：

```text
确认清空 API 密钥？

清空后，本设备将无法继续使用该 AI 接口生成内容，
除非重新填写密钥。

[ 取消 ]        [ 红色：确认清空 ]
```

交互硬约束：

- 一次点击绝不直接删除。
- “取消”为默认安全路径；弹窗外点击/返回键等价于取消。
- 红色删除入口必须与普通图标分区，不能放入输入框右侧的常用小图标组。
- 只有明确点击“确认清空”才删除。
- 删除后即时显示“未配置”，并给出重新填写或切换 Provider 的路径。
- 触控热区至少满足移动端可用尺寸，避免小图标误触。

## 4. Edge Cases

- AI 请求超时或无网络。
- AI 返回非 JSON、字段缺失、非法强度、未知 Game Pack ID。
- 用户设置雷区过多导致可用题卡不足。
- Deck 在游戏中耗尽。
- 2 人局中“所有人同时指”类规则不适配。
- 用户未输入昵称但题卡要求点名。
- 同一玩家被连续抽中。
- 同一双人组合出现过于频繁。
- 浏览器刷新/关闭后恢复。
- 自定义题卡被删除，但当前 Session 已引用它。
- 用户将强度调低后，Deck 中已有高强度题卡尚未使用。
- 新玩家中途加入、玩家暂离、重新加入。
- 自定义雷区是自然语言，无法可靠映射标签。
- 本地存储版本升级或数据损坏。
- PWA 运行在较小屏幕/横屏/字体放大模式。
- API Key 测试连接成功但加密保存失败、CryptoKey 无法持久化或存储空间异常。
- API Key 已保存但 Provider 模型名或 Base URL 后续失效。
- 用户误触清空入口、在确认弹窗取消、或浏览器返回关闭弹窗。
- 清空的是当前默认 Provider，而另一个 Provider 仍有有效 Key。
- 自定义 Provider Base URL 非 HTTPS、解析到 localhost/私网/link-local/metadata 地址、发生 DNS rebinding 风险或返回跨主机重定向。

## 5. Requirements (mandatory)

### Functional Requirements

#### App & Navigation

- **FR-001**: 系统 MUST 在无账号、无登录的情况下进入首页并使用核心功能。
- **FR-002**: 首页 MUST 提供“今晚开局”主入口以及 4 个首发 Game Pack 的快速入口。
- **FR-003**: 系统 MUST 提供“我的游戏包”入口以管理本地自定义玩法/题卡。

#### Session Setup

- **FR-004**: 用户 MUST 能设置玩家人数，并可选为玩家设置昵称。
- **FR-005**: 系统 MUST 保存并允许复用最近玩家列表和上次组局偏好。
- **FR-006**: 用户 MUST 能设置玩家关系类别。
- **FR-007**: 用户 MUST 能选择一种或多种聚会氛围。
- **FR-008**: 用户 MUST 能设置 1–5 级游戏强度。
- **FR-009**: 用户 MUST 能启用/禁用内置雷区并输入自定义雷区。

#### AI Deck Generation

- **FR-010**: “今晚开局” MUST 在开始游戏前准备一整局 Deck，而不是每轮临时调用 AI。
- **FR-011**: AI 请求 MUST 使用结构化输出契约，系统 MUST 对返回数据做 Schema 校验。
- **FR-012**: 系统 MUST 对生成题卡执行雷区/标签过滤。
- **FR-013**: 系统 MUST 对生成题卡执行重复检测和去重。
- **FR-014**: 若生成内容不足，系统 MUST 能重试或使用本地内置内容补齐。
- **FR-015**: AI API Key MUST 由用户主动填写并仅保存在当前设备；不得提交到源码、同步到云端、写入服务端持久化存储或记录完整 Key 到日志。
- **FR-016**: 生成完成后 Deck MUST 持久化到本地 Session，以支持断网继续。

#### Party Game Engine

- **FR-017**: 引擎 MUST 将玩家、Session、随机、强度、雷区、Deck、RoundHistory 与具体 Game Pack UI 解耦。
- **FR-018**: 引擎 MUST 支持混合模式自动选择下一种 Game Pack。
- **FR-019**: 同一 Session 中，同一 GameCard MUST 默认只出现一次。
- **FR-020**: 需要点名时，引擎 SHOULD 避免同一玩家连续两轮成为主玩家。
- **FR-021**: 需要双人互动时，引擎 SHOULD 优先选择本局互动次数较少的玩家组合。
- **FR-022**: 引擎 MUST 根据 Session 当前强度过滤不适配题卡。
- **FR-023**: 用户局中修改强度后，后续抽取 MUST 使用新强度约束。

#### Game Packs

- **FR-024**: V1 MUST 提供“真心话大冒险”Game Pack。
- **FR-025**: V1 MUST 提供“谁最可能”Game Pack。
- **FR-026**: V1 MUST 提供“我从来没有”Game Pack。
- **FR-027**: V1 MUST 提供“AI 即兴任务”Game Pack。
- **FR-028**: 每个 Game Pack MUST 通过统一接口声明 id、名称、图标、支持人数、卡片类型/规则和是否可参与混合模式。
- **FR-029**: 新 Game Pack SHOULD 可在不复制 Session/玩家/存储逻辑的情况下接入。

#### Gameplay Interaction

- **FR-030**: 游戏主界面 MUST 提供“完成 / 换一个 / 跳过”或语义等价操作。
- **FR-031**: “跳过” MUST 无默认惩罚。
- **FR-032**: 游戏主界面 MUST 显示当前轮次、玩法类型以及题目主体。
- **FR-033**: 倒计时/转盘/翻牌等表现效果 MUST 不阻塞用户跳过或快速进入下一步。
- **FR-034**: 用户 MUST 能在局中暂停、继续和结束 Session。
- **FR-035**: 用户 MUST 能在局中新增玩家或将玩家设为暂离/恢复。

#### Persistence & Recovery

- **FR-036**: 系统 MUST 在本地保存未结束 Session 的配置、Deck、已用卡、轮次和玩家状态。
- **FR-037**: App 重启或页面刷新后 MUST 能检测并恢复未结束 Session。
- **FR-038**: 本地持久化数据 MUST 有 schemaVersion 以支持未来迁移。
- **FR-039**: 本地数据损坏时 MUST 安全回退到可启动状态，并避免整个 App 白屏。

#### Custom Game Packs

- **FR-040**: 用户 MUST 能创建、编辑、启用/禁用和删除本地自定义 Game Pack。
- **FR-041**: 用户 MUST 能在自定义 Game Pack 中添加、编辑和删除 GameCard。
- **FR-042**: 已开始 Session MUST 使用建立时的题卡快照，不因用户随后编辑 Game Pack 而改变历史轮次。

#### Summary

- **FR-043**: 结束本局后 MUST 显示总轮次、游戏时长、参与人数和模式分布。
- **FR-044**: “再来一局” MUST 可复用上一局配置，同时创建新的 Session ID 并清空上一局的轮次/已用卡状态。

#### Visual / Usability

- **FR-045**: V1 MUST 采用“方案 A｜霓虹夜店风”的 Design System、图标方向和核心页面视觉。
- **FR-046**: UI MUST 使用真实可交互组件实现，不得将设计稿整屏作为位图背景替代交互。
- **FR-047**: 核心文字和按钮 MUST 在暗色霓虹背景中保持可读；关键状态不得仅依赖颜色区分。
- **FR-048**: PWA MUST 提供可安装的 manifest 与移动端主屏图标资产。

#### AI Provider & Secret Management

- **FR-049**: V1 MUST 提供独立“AI 模型设置”入口；**DeepSeek 官方 MUST 为默认 Provider**；OpenCode Go MUST 以“实验性”入口存在且仅用户手动选择时启用；另提供自定义 OpenAI Compatible。
- **FR-050**: V1 MUST NOT 提供 OpenCode 免费 Zen 预设、自动 fallback 或默认入口。
- **FR-051**: DeepSeek 官方预设 MUST 使用 `https://api.deepseek.com` 与默认模型 `deepseek-flash`。OpenCode Go 预设 MUST 使用 `https://opencode.ai/zen/go/v1` 与默认模型 `deepseek-v4.1-flash`，并明确标为实验性、不得自动 fallback；手动启用时适配器 SHOULD 使用独立 User-Agent 与稳定 `x-opencode-session`，同时 UI MUST 提示其官方主要面向 coding agents。
- **FR-052**: API Key 输入 MUST 默认掩码；完整 Key MUST NOT 出现在 console、错误 UI、测试快照、analytics 或持久化服务端日志。
- **FR-053**: 用户 MUST 能测试当前 Provider 连接，并获得脱敏的成功/失败反馈。Custom Provider 请求 MUST 仅允许 HTTPS（localhost 开发例外），服务端 MUST 拒绝 localhost/私网/link-local/metadata 目标、DNS 解析后的非公网地址，并默认禁止自动跟随跨主机重定向。
- **FR-054**: ProviderProfile MAY 直接保存在 IndexedDB；API Key 若持久化，MUST 使用 Web Crypto AES-GCM 加密，IndexedDB 只保存密文/IV/必要元数据，并使用 non-extractable `CryptoKey`。若安全加密持久化不可用，MUST 退化为 session-only，不得明文持久化。服务端 Proxy 只能在当前请求生命周期内使用 Key。
- **FR-055**: “清空 API 密钥” MUST 位于独立 Danger Zone，使用红色危险图标/文字/边框，与显示、测试、保存等普通操作明显分隔。
- **FR-056**: 第一次点击“清空 API 密钥” MUST NOT 删除任何数据，只能打开二次确认弹窗；取消或关闭弹窗后 Key MUST 保持原值。
- **FR-057**: 只有在二次确认中明确点击红色“确认清空”后，系统才能删除当前 Provider Key，并立即将状态改为“未配置”并给出可见反馈。
- **FR-058**: 当前 Provider 没有有效 Key 时，AI 生成 MUST 提供“去配置 / 切换 Provider / 使用本地 seed deck”至少一种不阻塞的恢复路径。


### Key Entities

- **Player**：一个本地玩家；包含 id、displayName、active/inactive 状态、创建/最近使用时间。
- **SessionConfig**：人数/玩家、关系、氛围、强度、雷区、启用的 Game Packs、单模式/混合模式。
- **BoundaryProfile**：内置边界布尔项、自定义雷区文本、内容强度上限。
- **GamePackDefinition**：玩法元数据及规则能力声明；可为内置或用户自定义。
- **GameCard**：可玩的最小内容单元；包含 type、packId、content、intensity、tags、participants、source 等。
- **SessionDeck**：本 Session 的 GameCard 快照、顺序/候选池、usedCardIds。
- **RoundHistory**：每轮选中的卡、玩家、状态（completed/swapped/skipped）、时间戳。
- **GameSession**：本局根对象；关联 config、deck、currentRound、history、status、startedAt/endedAt。
- **AppPreferences**：上次配置、最近玩家、UI 偏好等本地设置。
- **AIProviderProfile**：Provider 类型、显示名称、Base URL、Model ID、协议、是否默认、脱敏状态等；Key 仅本地存储。
- **AISecretRecord**：按 ProviderProfile 关联的本地**加密密钥记录**；保存 ciphertext、IV、算法版本等，不保存明文 API Key；不得进入 Session、日志或服务端持久化。
- **AICryptoKeyRecord**：用于 AES-GCM 的 non-extractable Web Crypto `CryptoKey`；不可导出为原始字符串。若浏览器无法可靠持久化该对象，则 Secret 改为 session-only。

## 6. Success Criteria (mandatory)

### Measurable Outcomes

- **SC-001**: 在**已有可用 AI Provider，或选择本地 seed deck 模式**的前提下，熟悉产品的用户可以在 **20 秒内** 从首页完成必要组局并触发“开始生成/开始游戏”；首次 AI 配置不计入该指标。
- **SC-002**: Deck 已生成后，完成/换题/跳过/下一轮等本地交互在正常设备上 **无需等待网络响应**。
- **SC-003**: 同一 Session 中，系统默认 **0 次无意重复题卡**。
- **SC-004**: 启用某个结构化雷区后，带有对应禁用标签的题卡进入可玩 Deck 的数量为 **0**。
- **SC-005**: AI 返回非法 JSON、请求失败或题量不足时，用户始终存在 **至少 1 条可恢复路径**，不会停留在不可操作状态。
- **SC-006**: 页面刷新或 PWA 重启后，最近未完成 Session 可以恢复到最后一次已持久化的轮次，核心状态恢复成功率在自动化场景中为 **100%**。
- **SC-007**: 4 个首发 Game Pack 均可独立快速开始，也均可按规则参与混合模式。
- **SC-008**: 方案 A 设计中的**首页、组局、雷区、生成、游戏、总结、AI 设置/密钥安全**共 7 类核心页面全部由真实组件实现，并共享统一 Design Tokens；Danger Zone 使用明确的危险色语义例外。
- **SC-009**: 从“今晚开局”到“结束总结”的核心 E2E 测试在目标浏览器环境全部通过。
- **SC-010**: 不引入账号、支付、公共社区、多人实时同步或云数据库即可完成 V1 所有 P1/P2 用户故事。
- **SC-011**: DeepSeek 官方首次进入时默认选中；OpenCode Go 显示“实验性”且自动默认/自动 fallback 次数为 **0**；自定义 OpenAI Compatible 可配置；界面中 OpenCode 免费 Zen 预设数量为 **0**。
- **SC-012**: 自动化测试证明“清空 API Key”首次点击删除次数为 **0**；取消确认后 Key 保留率 **100%**；只有明确二次确认后才删除。
- **SC-013**: 任何测试日志、错误回显和 UI 状态中完整 API Key 泄露次数为 **0**；IndexedDB 中可直接读取到明文 API Key 的记录数为 **0**。

## 7. Assumptions

- 当前为个人自用，默认同一时间只有一个主要操作者控制同一台手机。
- 用户允许在开局时短暂联网以生成整局 AI 内容；生成成功后可能断网。
- AI Provider 可更换；V1 以 DeepSeek 官方为默认，OpenCode Go 为实验性手动入口，自定义 OpenAI Compatible 为高级入口。Key 由用户在 App 内本地管理，不依赖重新构建 Docker。
- 用户自定义自然语言雷区无法百分百语义判定；V1 将结构化雷区作为强约束，自定义雷区作为 AI Prompt + 文本/标签补充约束。
- 喝酒不是默认玩法；相关行为仅在用户明确允许且题卡规则需要时出现。
- V1 使用中文界面和中文题卡为主，多语言不在本版本范围。
- PWA 是首选形态；原生 iOS/Android App 不在 V1 范围。

## 8. Explicitly Out of Scope

- 注册、登录、OAuth、账号找回。
- 会员、订阅、支付、广告。
- 多人手机实时同步、房间码、WebSocket 房间。
- 公共 UGC 社区、排行榜、内容市场。
- 云端玩家画像和社交关系图谱。
- 商业化运营/审核后台。
- Kindle/阅读器/其他无关项目能力。
- OpenCode 免费 Zen Provider 预设或 fallback。
- API Key 云同步、服务端数据库保存、跨设备密钥同步。

## 9. Visual Baseline

开发必须以打包目录 `设计资产/` 中以下文件为视觉源：

1. `方案 A 丨 原型流程与六屏 UI.png`
2. `方案 A 丨 手机 UI 资产板.png`
3. `方案 A 丨 UI 设计系统.png`
4. `方案 A 丨 App 图标设计规范.png`
5. `方案 A 丨 AI 设置与密钥安全交互原型.png`

若图像中的个别文字因生成式视觉稿存在错字，以本 SPEC 的功能文案和业务含义为准；视觉布局、色彩、层级、氛围和组件语言以方案 A 为准。AI 设置页现已由 `方案 A 丨 AI 设置与密钥安全交互原型.png` 正式补入设计资产，MUST 作为第 7 类核心页面执行逐屏实现与验收；Danger Zone 的红色危险视觉是功能语义例外，必须与普通霓虹主色形成清晰区分。
