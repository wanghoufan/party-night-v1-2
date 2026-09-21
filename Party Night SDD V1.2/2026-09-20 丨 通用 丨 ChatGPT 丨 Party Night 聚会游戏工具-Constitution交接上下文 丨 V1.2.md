# Party Night 项目 Constitution

> 文档版本：V1.2  
> Constitution 版本：1.2.0  
> 制定日期：2026-09-20  
> 项目状态：V1 开发基线  
> 适用范围：Party Night 单机自用版 PWA 及其后续兼容迭代

## Sync Impact Report

- V1.2 修订：在 V1.1 的 AI Provider/密钥管理基础上，补充官方能力边界与浏览器密钥安全：**DeepSeek 官方成为默认 Provider；OpenCode Go 保留为实验性、手动启用的兼容 Provider；API Key 采用 Web Crypto 加密后再持久化；Custom Provider 增强 SSRF 防护；AI 设置页纳入方案 A 正式原型与验收范围；Spec Kit Analyze 前移到 Implement 之前。**
- V1.1 修订：新增 AI Provider 本地配置、API Key 生命周期管理与危险清空操作保护。
- 本 Constitution 是 SPEC、PLAN、TASKS 的最高约束；后续实现若与本文件冲突，必须修改下游设计或实现，不得绕过本原则。
- 已确认视觉基线：**方案 A｜霓虹夜店风**；方案 B/C 仅作为历史探索，不进入 V1 实现。
- 已确认产品基线：**Party Game Engine + 可插拔 Game Pack**，不得将产品实现写死为“真心话大冒险 App”。
- 已确认产品性质：**个人自用，不商业化**。V1 不建设会员、支付、社区、运营后台、公共 UGC、排行榜等商业系统。
- 已确认 AI 接入基线：**DeepSeek 官方为默认 Provider**；**OpenCode Go 为实验性、手动启用 Provider**（不作为默认或自动 fallback，且 UI 必须提示其官方主要面向 coding agents）；另保留自定义 OpenAI Compatible。**不预设 OpenCode 免费 Zen**。
- API Key 由用户在 App 内主动填写。需要跨重启保存时，**MUST 使用 Web Crypto 加密后再写入 IndexedDB**；若安全加密能力不可用，则退化为“本次会话使用、不持久化”，不得明文持久化。

## Core Principles

### I. Local-First & Zero-Account（本地优先、零账号）

1. V1 **MUST** 在不注册、不登录、不绑定手机号/邮箱的情况下完整使用核心功能。
2. 玩家昵称、用户偏好、雷区、游戏包、未结束 Session、历史摘要 **MUST** 优先保存在本机。
3. V1 **MUST NOT** 引入云数据库作为核心运行依赖；网络中断后，只要整局题卡已生成，当前游戏 **MUST** 可以继续。
4. AI API Key **MUST** 由用户在 App 内主动填写；不得同步到云端、提交到仓库、写入分析系统或持久化到服务端。
5. 若用户选择“保存到本机”，API Key **MUST 先使用 Web Crypto AES-GCM 加密**，再将密文与随机 IV 写入 IndexedDB；加密键 **MUST 使用 non-extractable `CryptoKey`**，不得把可导出的原始加密键字符串与密文一起保存。若目标浏览器无法可靠持久化该 CryptoKey，则 **MUST 改为仅本次会话使用，不得回退到明文持久化**。
6. AI 请求 **MUST** 经同源 Proxy/Route Handler 以“request-scoped credential”方式转发；服务端只在当前请求生命周期内读取 Key，**MUST NOT** 将 Key 写入数据库、文件、缓存或日志。
7. 加密持久化只提供“静态存储保护”，**MUST NOT** 被描述为能防住同源 XSS。由于运行时前端仍可调用解密流程，实现 **MUST** 使用严格 CSP、禁用非必要第三方脚本、日志脱敏、最小明文生命周期与独立 secret service 降低泄露风险。
8. 无明确产品必要性时，**MUST NOT** 新增账号、鉴权、远程同步、多人实时房间或遥测采集。

**Rationale**：本项目当前只为个人使用。减少后端和账号系统可以显著降低维护成本，同时保证现场“拿出来就能玩”。

### II. Instant Play & Low-Friction Interaction（即时开局、极低操作负担）

1. 首页 **MUST** 以“今晚开局”为第一主入口，并同时保留单模式快速入口。
2. 完整组局配置 **MUST** 控制在少量连续选择步骤内；进入游戏后，核心高频操作应收敛为“完成 / 换一个 / 跳过 / 下一轮”。
3. V1 **MUST NOT** 在每轮抽卡时调用 AI；AI 应在开局阶段批量准备整局内容，本局运行尽量本地完成。
4. 页面交互、抽卡、换题等本地操作 **MUST** 在用户感知上即时完成，不得因不必要的网络请求阻塞。
5. 任何玩法 **MUST** 提供无惩罚“跳过”；系统不得通过 UI 或默认规则强迫喝酒、身体接触或暴露隐私。

**Rationale**：酒吧/夜店/聚会现场注意力碎片化，复杂设置和等待会直接破坏游戏气氛。

### III. Engine First, Game Packs Second（引擎优先、玩法插件化）

1. Party Game Engine **MUST** 与具体玩法内容解耦。
2. 玩家管理、受约束随机、轮次状态、强度、雷区、去重、Session 恢复等能力 **MUST** 属于共享引擎层。
3. “真心话大冒险 / 谁最可能 / 我从来没有 / AI 即兴任务” **MUST** 作为 Game Pack/规则模块接入，而不是复制四套页面逻辑。
4. 新增玩法时，原则上 **SHOULD** 通过新增 Game Pack 配置、题卡模板与少量规则扩展实现；若必须修改 Engine，必须说明通用性理由。
5. 数据结构 **MUST** 支持未来扩展“二选一、转瓶子、默契测试、拼桌破冰”等玩法而无需破坏已有存档。

**Rationale**：项目的长期价值是私人 Party Game Engine，而不是单一题库应用。

### IV. Boundary-by-Design（边界与安全内建）

1. 每个 Session **MUST** 有明确的强度等级和雷区配置。
2. AI 生成内容 **MUST** 同时经过结构校验、边界标签过滤、重复检测和最低安全规则检查后才可进入可玩 Deck。
3. 系统 **MUST NOT** 默认生成或鼓励危险行为、强迫饮酒、非自愿身体接触、泄露私人信息、违法行为或对特定个人的羞辱/骚扰。
4. 用户自定义题卡可以绕过 AI 生成，但 **MUST** 明确标记来源；引擎仍应尊重用户主动启用的“隐藏/禁用”规则。
5. “强度 5”只代表在用户允许边界内更刺激，**MUST NOT** 被解释为“无底线”。

**Rationale**：刺激与边界并不冲突。安全感会提高用户愿意开启高强度玩法的概率，也让单机工具更可控。

### V. Session Integrity & Graceful Degradation（会话完整性与优雅降级）

1. 当前 Deck **MUST** 做本局去重；同一张卡不得在同一 Session 中无意重复。
2. 玩家选择 **SHOULD** 避免同一玩家连续被选，并尽量平衡玩家/玩家组合的出现频次。
3. 浏览器刷新、PWA 被杀、短暂离线后，未结束 Session **MUST** 可以恢复至最近一次持久化状态。
4. AI 失败、超时、返回无效 JSON 或生成题量不足时，系统 **MUST** 给出可恢复路径：重试一次、使用本地内置题库补齐或回退到本地玩法；不得让用户卡死在等待页。
5. 随机选择逻辑 **MUST** 是可测试的纯逻辑或可注入随机源，关键规则不得只存在于 UI 组件中。

### VI. Visual Fidelity & Nightlife Usability（方案 A 视觉一致性与夜场可用性）

1. V1 **MUST** 以“方案 A｜霓虹夜店风”作为唯一设计源。
2. 颜色、按钮、卡片、图标、Tab Bar、弹窗、状态标签等 **MUST** 从统一 Design Tokens/组件库复用，不允许页面级随意发明新样式。
3. 正文信息的可读性 **MUST** 优先于霓虹效果；光晕不得降低题卡文字、按钮和状态的对比度。
4. 游戏主界面 **MUST** 适合单手操作和昏暗环境；核心按钮触控区域必须足够大。
5. 动画 **SHOULD** 增强悬念但不得拖慢操作；转盘/翻牌等动画必须允许快速完成或跳过，不得成为强制等待。
6. 所有关键状态 **MUST** 不能仅靠颜色表达；完成、换题、跳过等应同时使用文字/图标。

### VII. Traceable Quality（可追踪质量）

1. 每个 Functional Requirement **MUST** 能映射到至少一个 User Story、实现模块和验收/测试任务。
2. Engine、Deck 生成、过滤、去重、Session 恢复、AI Schema 校验 **MUST** 有自动化测试。
3. 核心用户路径（打开 → 组局 → 生成 → 游戏 → 结束）**MUST** 有端到端测试。
4. 任何引入复杂依赖、远程服务或新增状态系统的改动 **MUST** 在 PLAN 的 Complexity Tracking 中说明理由。
5. 每次实现完成后 **MUST** 对照 SPEC/PLAN/TASKS 做一致性检查；若使用 Spec Kit，应执行 analyze，并在 implement 后执行 converge 直到无未满足项。

### VIII. Secret & Destructive Action Safety（密钥与危险操作保护）

1. V1 **MUST** 提供独立的“AI 模型设置”入口。**DeepSeek 官方 MUST 为默认 Provider**；**OpenCode Go MUST 标记为“实验性”且只能由用户手动选择/启用，不得作为默认或自动 fallback**；另提供自定义 OpenAI Compatible。OpenCode 免费 Zen **MUST NOT** 作为预设、fallback 或默认入口。
2. OpenCode Go 的 UI **MUST** 明确提示“官方主要面向 OpenCode/同类 coding agents，Party Night 属非典型流量，兼容性可能变化”；实现不得宣称 OpenCode 官方保证 Party Night 使用场景。若用户仍手动启用，适配器应使用独立 User-Agent 与稳定的 `x-opencode-session`，但这些 header **不得被表述为改变其官方使用边界**。
3. API Key 输入框 **MUST** 默认掩码显示；显示/隐藏、测试连接、保存属于普通操作，必须与清空 Key 的危险操作视觉分区。
4. “清空 API 密钥”**MUST** 位于独立 Danger Zone，使用红色危险视觉（红色垃圾桶或等价危险图标 + 红色文字/边框），并与普通操作保持明显空间隔离，不得和“显示/测试/保存”等按钮紧密并排。
5. 第一次点击“清空 API 密钥”**MUST NOT** 修改任何数据，只能打开二次确认弹窗。
6. 二次确认弹窗 **MUST** 明确说明后果，并提供“取消 / 确认清空”；默认安全路径为取消，取消后 Key 必须保持原值。
7. 只有用户在确认弹窗中明确点击红色“确认清空”后，系统才可删除当前 Provider 的 Key，并立即将该 Provider 标记为“未配置”。
8. 清空后 **MUST** 给出可见结果反馈；若该 Provider 当前被选中，生成流程必须提示重新配置或切换 Provider，同时仍允许使用本地 seed deck。
9. Key 的完整值 **MUST NOT** 出现在 console、错误消息、网络错误回显、测试快照、analytics 或持久化日志中。
10. 自定义 OpenAI Compatible Provider 经服务端 Proxy 请求时 **MUST** 做 SSRF 防护：仅允许 `https:`（localhost 开发例外）、拒绝 localhost/私网/link-local/metadata 地址、DNS 解析后再次验证目标为公网地址，并默认禁止自动跟随跨主机重定向。

**Rationale**：个人 API Key 一旦误删需要重新查找/创建，且过去容易因小图标误触被清空。危险删除必须比普通配置操作更难误触、更容易撤销。

## Product Scope Guardrails

### V1 必须包含

- PWA/移动浏览器可用的 Party Night。
- 首页“今晚开局”混合模式。
- 4 个首发 Game Pack：真心话大冒险、谁最可能、我从来没有、AI 即兴任务。
- 玩家人数/昵称、关系、氛围、强度、雷区配置。
- AI 一次生成整局题卡并缓存。
- 本地题库回退与本局去重。
- 完成 / 换一个 / 跳过。
- 局中调整强度、玩家加入/暂离、暂停/恢复。
- 本地自定义 Game Pack/题卡基础能力。
- 结束总结与“再来一局”。
- 方案 A UI、图标与 Design System 的落地。
- App 内 AI Provider 设置：**DeepSeek 官方（默认） / OpenCode Go（实验性、手动启用） / 自定义 OpenAI Compatible**。
- API Key 本地加密保存（Web Crypto AES-GCM；不支持时仅会话保存）、连接测试、Provider 切换，以及独立 Danger Zone + 二次确认清空。
- 方案 A 的 **AI 设置与密钥安全交互原型**，与原有首页/组局/雷区/生成/游戏/总结共同构成核心视觉验收范围。

### V1 明确不做

- 用户注册/登录。
- 支付、订阅、会员。
- 公共社区、公开分享、UGC 市场。
- 多设备实时同步、房间码联机。
- 云端玩家关系图谱。
- 复杂运营后台、数据分析平台。
- 面向商业用户的合规/审核工作台。
- OpenCode 免费 Zen 预设或 fallback。
- 服务端持久化 API Key、云端同步 API Key。

## Development & Review Standards

- 代码应优先使用小而清晰的模块；业务规则不得散落在 React 页面组件中。
- 类型、Schema 和存储版本必须显式定义；持久化数据升级需要迁移策略。
- AI 输出一律按“不可信外部输入”处理。
- UI 组件优先语义化、可复用；禁止以整屏大图代替真实可交互 UI。
- 无障碍要求以不显著增加复杂度为前提，至少确保按钮语义、焦点和文字对比可用。
- 任何“以后可能用”的后端系统，如果当前 SPEC 没有需求，不得提前建设。

## Constitution Check（所有 PLAN 必须回答）

PLAN 在进入实现前必须逐项给出 PASS/FAIL：

1. 是否仍为 zero-account/local-first？
2. 是否保证生成完 Deck 后可本地继续玩？
3. 是否保持 Party Game Engine 与 Game Pack 解耦？
4. 是否实现雷区/强度/安全过滤和无惩罚跳过？
5. 是否具备 Session 恢复和 AI 失败回退？
6. 是否严格落地方案 A 视觉资产与 Design Tokens？
7. 是否建立 FR → Story → Task → Test 的追踪关系？
8. AI Provider/Key 是否仅本地管理，并保证服务端不持久化 secret；持久化 Key 是否加密且不存在明文 fallback？
9. DeepSeek 是否为默认 Provider，OpenCode Go 是否仅实验性手动启用且无自动 fallback？
10. API Key 清空是否有独立红色 Danger Zone + 二次确认，且一次点击绝不删除？
11. Custom Provider 的 Proxy 是否执行严格 SSRF 防护？
12. 是否引入了 SPEC 未要求的复杂系统？如有，是否有必要性说明？

任一关键项 FAIL 时，不得进入实现。

## Governance

- **Authority**：本 Constitution 高于 SPEC、PLAN、TASKS 和临时口头约定；下游制品不得与 MUST 原则冲突。
- **Amendments**：改变产品治理原则时必须修改本文件，并同步审查 SPEC/PLAN/TASKS；普通功能新增不需要修改 Constitution。
- **Versioning**：采用 SemVer。MAJOR = 删除/反转既有核心原则；MINOR = 新增原则或扩大治理范围；PATCH = 不改变语义的澄清。
- **Review**：每个大功能或架构变更都需重新执行 Constitution Check；复杂度偏离需要记录理由。
- **Spec Kit 基线**：本项目采用 GitHub Spec Kit 当前 SDD 流程。功能级完整质量路径为：**Constitution（项目一次）→ Specify → Clarify（按需）→ Plan → Checklist（按需）→ Tasks → Analyze → Implement → Converge**。对于本项目，`Analyze` 是 Implement 前的必过质量门禁；实现完成后可再执行一次 Analyze 作为额外复核。

**Version**: 1.2.0 | **Ratified**: 2026-09-20 | **Last Amended**: 2026-09-20

## 官方规范参考

- GitHub Spec Kit README: https://github.com/github/spec-kit/blob/main/README.md
- Agentic SDD Reference: https://github.com/github/spec-kit/blob/main/docs/reference/agentic-sdd.md
- Spec Template: https://github.com/github/spec-kit/blob/main/templates/spec-template.md
- Plan Template: https://github.com/github/spec-kit/blob/main/templates/plan-template.md
- Tasks Template: https://github.com/github/spec-kit/blob/main/templates/tasks-template.md

- OWASP HTML5 Security Cheat Sheet（IndexedDB/Secrets）: https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html
- OWASP SSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
