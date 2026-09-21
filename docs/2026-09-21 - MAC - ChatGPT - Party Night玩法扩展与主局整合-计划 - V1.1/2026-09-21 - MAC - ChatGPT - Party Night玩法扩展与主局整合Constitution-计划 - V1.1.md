# Party Night 项目 Constitution

> 文档版本：V1.2  
> Constitution 版本：1.2.0  
> 制定日期：2026-09-21  
> 取代版本：V1.1 / Constitution 1.1.0  
> 项目状态：既有 PWA 的增量开发基线  
> 适用范围：Party Night 单机自用版 PWA 及其后续兼容迭代

## Sync Impact Report

本次不是推倒重做，而是在既有 Party Game Engine、4 个底部 Tab、组局设置、AI 整局预生成、本地持久化和方案 A 霓虹夜店视觉上继续做增量扩展；V1.2 重点补齐官方 Spec Kit 流程顺序、BYOK/密钥安全、PWA 升级迁移与外部内容渲染边界。

本次治理级变化：

1. **冻结现有四 Tab 信息架构**：`首页 / 组局（主局运行页） / 游戏包 / 设置`，不得收敛成三个 Tab，也不得新增“Party”底部 Tab。
2. **明确 Party Session 只是后台/领域概念**：一场聚会的数据归属；前台继续使用现有“组局”Tab 承载正在进行的主局。
3. **冻结现有组局参数与尺度 UI**：人数、玩家、关系、今晚氛围、1–5 游戏尺度继续沿用；本次不重做尺度、不改选项名称、不新增另一套“轻松/正常/暧昧/成人”体系。
4. **新增 4 个玩法**：二选一、指人游戏、默契测试、转瓶子；继续复用共享 Engine，不复制 Session/AI/存储逻辑。
5. **新增 2 个本地工具**：随机点名、随机分组；不把它们升级成底部导航或复杂游戏。
6. **游戏包增加规则库**：小姐牌、King's Cup、逛三园、逢七过、十五二十、吹牛骰子、数字炸弹、划拳等线下玩法只提供“30 秒看懂”与常见变体，不强行电子化。
7. **主局支持局内切换玩法**：切换玩法不新建 Session、不重走组局、不丢玩家/关系/氛围/尺度/历史。
8. **既有 UI 为视觉真源**：保留深色霓虹、紫粉渐变、卡片体系、底部导航和现有首页/组局/游戏包/设置布局；本次只做局部新增，不重新设计整套产品。
9. **澄清凭据安全边界**：应用自有/系统托管密钥不得进入浏览器；用户主动填写的 BYOK 若现有架构已支持，可按本地模式继续，但必须遮罩显示、禁止日志/导出/Service Worker 缓存，不得复制第二份凭据存储。
10. **补齐升级安全**：V1.0/V1.1 本地 Session 向新 schema 迁移必须幂等、事务化；PWA Service Worker 与 IndexedDB 版本错位不得导致白屏或数据清空。
11. **补齐内容渲染安全**：AI、自定义题卡、玩家昵称、规则文本均视为不可信文本；默认按纯文本渲染并限制长度，不得把模型/用户内容作为原始 HTML/脚本执行。
12. **校正 Spec Kit 质量门顺序**：Analyze 位于 Tasks 之后、Implement 之前；Converge 位于 Implement 之后。V1.2 文档已人工做一次 Analyze 式交叉检查，实施环境仍应在开工前执行正式/等价检查。

## Core Principles

### I. Preserve Before Expand（先保留，再扩展）

1. 本次开发 **MUST** 以现有可用版本为基线增量实现，不得以“统一重构”为理由重做首页、组局设置、游戏包或设置页。
2. 底部导航 **MUST** 保持四项：`首页 / 组局 / 游戏包 / 设置`。
3. 现有首页 2×2 核心卡片（真心话大冒险、谁最可能、我从来没有、AI 即兴）**MUST** 保留其视觉层级与快捷入口。
4. 现有组局设置中的关系、今晚氛围和 1–5 尺度 **MUST** 保留语义与交互；新玩法直接读取同一 SessionConfig。
5. 若现有代码路径与本文示例路径不同，实施者 **MUST** 适配现有路径，禁止为了“对齐文档”制造重复页面或重复模块。

### II. One Party Session, Many Games（一场局，多种玩法）

1. Party Session **MUST** 是一场聚会的唯一会话根对象，保存玩家、关系、氛围、尺度、雷区、启用玩法、当前玩法、轮次历史和恢复状态。
2. “组局”Tab 是 Party Session 的前台运行空间；`Party` 仅为内部领域概念，**MUST NOT** 新增同名底部 Tab。
3. 用户在同一场局中从“我从来没有”切到“二选一/转瓶子/真心话”等，**MUST NOT** 重建 Session 或重复询问组局参数。
4. 切换玩法 **MUST** 保留统一 RoundHistory，并单独记录 packId / gameType，便于恢复和总结。
5. 未创建 Session 时点击某个玩法，系统 **MUST** 使用“选中玩法作为预选目标”的方式完成最小组局，然后进入主局。

### III. Phone as Host, People as the Game（手机主持，人和人互动）

1. 手机的主要职责是：出题、随机、倒计时、选择玩家、展示规则、推进下一轮。
2. “谁最可能 / 指人 / 二选一 / 默契测试”等 **MUST NOT** 强迫每名玩家逐个在手机上录入答案或票数。
3. V1 **MUST NOT** 新增多人联网、房间码、每人一台手机投票、实时同步等系统。
4. 一屏高频操作 **SHOULD** 收敛为 1 个主按钮 + 最多 1 个弱辅助操作；局中设置放入 sheet/modal。
5. 任意题目 **MUST** 可无惩罚跳过；不得强迫饮酒、身体接触或公开隐私。

### IV. Engine First, Pack-Specific UI Only Where Needed（共享引擎优先）

1. 玩家、Session、随机、尺度、雷区、去重、持久化、AI 生成、fallback **MUST** 属于共享层。
2. 真心话大冒险、谁最可能、我从来没有、AI 即兴、二选一、指人游戏、默契测试、转瓶子 **MUST** 通过 Game Pack/能力声明接入。
3. 二选一/指人/默契测试可以拥有专属 renderer/state，但不得复制 Session 生命周期。
4. 转瓶子的人选必须使用本地可测试随机逻辑；选中后可链入已有真心话/大冒险 Pack。
5. 随机点名、随机分组属于 `Party Tools`，使用同一玩家池，但不参与 AI Deck。

### V. AI Is Enhancement, Not Runtime Dependency（AI 是增强，不是每轮依赖）

1. 沿用 V1.0：组局后优先批量准备本局可玩内容，不在每一轮强制实时调用 AI。
2. AI 输出 **MUST** 经 Schema 校验、边界过滤、去重和 normalization 后才进入 Deck。
3. 新增 AI 玩法的题卡必须支持本地 seed/fallback；Provider 超时、限流或断网时游戏仍可继续。
4. “换一个”表示拒绝/跳过当前内容，系统 **MUST** 短期避免生成或抽到高度相似内容；“下一题/完成”表示本题已玩完。
5. AI Provider/API Key **MUST** 沿用当前已实现的请求与存储路径，不得为新玩法新建第二套凭据机制。
6. **应用自有/系统托管密钥 MUST NOT 进入浏览器**；若项目采用服务端代理，密钥只存在服务端环境。
7. **用户主动填写的 BYOK** 若当前版本已支持，可继续采用本地模式；必须默认遮罩、不得写入日志/错误上报/导出包/Service Worker Cache，并在清空时保留显著危险样式与二次确认。浏览器直连 Provider 仅在该 Provider 明确支持浏览器/CORS 且用户主动配置时使用。**浏览器持久化 BYOK 只能视为个人自用的便利模式，不得宣称具备强机密性**；若需要真正隐藏密钥，应使用服务端代理/外部 secret store。

### VI. Rule Library Is Reference, Not Forced Digitization（规则库只做该做的事）

1. 传统线下游戏若用实体扑克/骰子/手势已经足够好玩，手机只负责快速解释规则。
2. 规则库 **MUST** 位于“游戏包”体系内，不新增底部“规则”Tab。
3. 规则详情 **MUST** 优先展示：道具、适合人数、一句话规则、步骤/牌义、常见变体。
4. “小姐牌”等存在地区变体的玩法 **MUST** 标注“常见规则/常见变体”，不得声称某一套为唯一官方规则。
5. V1 **MUST NOT** 为小姐牌等线下玩法增加“每抽一张牌都点一次手机”的强制流程。

### VII. Existing Visual Language Is the UI Contract（现有 UI 即视觉合同）

1. 深色夜场背景、紫/粉/蓝霓虹渐变、圆角深色卡片、白色主文字、灰紫次文字、紫色选中边框 **MUST** 延续。
2. 现有四 Tab 图标与布局、首页主要层级、组局按钮矩阵、尺度滑杆、游戏包列表、设置页 provider 卡片 **MUST** 视觉连续。
3. 新增页面/组件 **MUST** 复用现有 Design Tokens 和组件；禁止另起一套视觉语言。
4. 用户当前已认可的尺度 UI **MUST NOT** 在本次改版中重新设计。
5. 关键题卡必须适合手机放在桌中央多人共看；文字层级和触控面积优先于装饰光效。

### VIII. Local-First, Recovery & Privacy（本地优先、可恢复、少采集）

1. 核心功能继续支持零账号使用。
2. 未结束 Session **MUST** 在刷新、锁屏、PWA 被杀后可恢复。
3. 当前玩法、该玩法必要的局部状态（如默契分数/当前配对）**MUST** 被持久化或可安全重建。
4. 自定义 Game Pack、玩家昵称、偏好和规则收藏默认本地保存。
5. 本次 **MUST NOT** 引入与功能无关的云数据库、遥测、公共社交或账号系统。

### IX. Security, Content & Update Safety（凭据、内容与升级安全）

1. AI 输出、自定义题卡、玩家昵称、规则正文等外部/用户内容 **MUST** 作为不可信文本处理；React/UI 层不得直接注入原始 HTML，禁止用 `dangerouslySetInnerHTML` 渲染这些内容，除非经过明确、可测试的 sanitizer 且存在真实需求。
2. AI Schema **MUST** 对主要文本字段设置合理最大长度；超长、非法结构、控制字符异常等内容应被拒绝或规范化，防止题卡撑爆 UI 或造成资源滥用。
3. 安全过滤 **MUST** 拦截强迫饮酒、危险挑战、非自愿身体接触、违法危险行为和针对个人的羞辱/骚扰；高尺度只代表在允许边界内更刺激，不代表取消安全约束。
4. **MUST NOT** 生成涉及未成年人的露骨性内容；参与者年龄未知时，不生成露骨性任务/问题。涉及亲密互动的任务必须允许跳过，且不得把醉酒状态视为同意。
5. V1.0/V1.1 → V1.2 本地数据迁移 **MUST** 幂等、事务化、非破坏性；迁移失败时隔离坏记录并提供安全恢复路径，不得直接清空全部本地数据。
6. PWA 更新 **MUST** 考虑 Service Worker / JS bundle / IndexedDB schema 版本错位；旧缓存不得无限期锁死旧 bundle，API/AI 响应不得进入离线缓存。

### X. Traceability & Continuous Verification（可追踪与持续验证）

1. SPEC 的每项 FR 必须映射到 PLAN 的模块和 TASKS 的任务/测试。
2. 新增玩法必须有单元或集成测试；主局切换、恢复、规则库导航必须有 E2E。
3. MVP Gate 只作为内部检查点，**不得**在连续开发时要求人工停下来逐项确认。
4. 完整 V1.2 全部完成后才进入 Human Gate。
5. 按当前 GitHub Spec Kit 思路，四核心产物之后应执行实现与质量闭环；有歧义时可用 Clarify/Checklist/Analyze，实施后用 Converge 校验剩余差距。

## Product Scope Guardrails — V1.2

### V1.2 必须保留

- 四 Tab：`首页 / 组局 / 游戏包 / 设置`。
- 现有首页及 4 个内置 AI 玩法。
- 现有组局关系、氛围、1–5 尺度及已实现雷区/边界能力。
- 本地优先、Session 恢复、AI fallback、Game Pack 架构。
- 现有设置页（含深/浅色与 AI Provider/模型配置能力）。
- 既有 BYOK/Provider 能力，但按“系统密钥不进浏览器、用户 BYOK 不进日志/导出/缓存”的安全边界执行。

### V1.2 新增

- 二选一。
- 指人游戏。
- 默契测试。
- 转瓶子。
- 随机点名。
- 随机分组。
- 主局局内切换玩法。
- 游戏包内的“玩法 / 规则”二级切换或等价无破坏结构。
- 规则库首批：小姐牌、King's Cup、逛三园、逢七过、十五二十、吹牛骰子、数字炸弹、划拳。
- V1.x 本地 Session/IndexedDB 的安全迁移与 PWA 版本错位保护。
- AI/用户内容纯文本安全渲染与长度限制。

### V1.2 明确不做

- 底部导航从 4 个改 3 个。
- 新增“Party”底部 Tab。
- 重做尺度体系或改成新的 3/4 档模式。
- 多设备实时房间/联网投票。
- 强制玩家逐人录入答案。
- 账号/会员/支付/社区。
- 把规则库玩法全部做成手机内可操作游戏。
- 为本次增量迁移框架、状态库或数据库技术。

## Constitution Check（PLAN 必须全部 PASS）

1. 是否保留四 Tab 和现有页面层级？
2. 是否保持组局关系/氛围/尺度不变？
3. 是否把 Party Session 作为后台状态而非新 Tab？
4. 是否实现同一 Session 内无重开切换玩法？
5. 是否所有新增玩法复用 Engine/Storage/AI 基础设施？
6. 是否把规则库放在游戏包中并避免强行电子化？
7. 是否支持 AI 失败 fallback 与 Session 恢复？
8. 是否保持现有霓虹视觉和组件体系？
9. 是否没有引入联网多人、账号、云数据库等越界复杂度？
10. 是否区分“系统密钥”与“用户 BYOK”，并保证密钥不进入日志/导出/Service Worker 缓存？
11. 是否所有 AI/用户文本按不可信输入安全渲染并有长度上限？
12. 是否具备事务化本地数据迁移与 PWA 版本错位保护？
13. 是否具备 FR → Module → Task → Test 的可追踪性？

任一关键项 FAIL，不得进入实现。

## Governance

- **Authority**：Constitution > SPEC > PLAN > TASKS > 临时口头实现决定。
- **Amendments**：改变底部 IA、尺度体系、Local-first、多人联网边界或 Engine/Pack 关系时必须先修改 Constitution。
- **Versioning**：MAJOR = 反转核心治理原则；MINOR = 新增/扩大治理原则；PATCH = 非语义澄清。
- **本次版本变更**：1.1.0 → 1.2.0，原因是补充 BYOK/系统密钥边界、外部内容安全渲染、PWA/IndexedDB 升级安全，并校正 Spec Kit Analyze/Implement/Converge 顺序。
- **Spec Kit 对齐**：用户交付仍保留 Constitution / SPEC / PLAN / TASKS 四份 Markdown；按当前 Spec Kit，Constitution 通常项目级维护，单个 feature 的核心执行流为 Specify → Plan → Tasks → Implement → Converge；Clarify / Checklist / Analyze 按需要加入，其中 Analyze 必须在 Implement 前。

**Version**: 1.2.0 | **Ratified**: 2026-09-20 | **Last Amended**: 2026-09-21

## 官方规范参考

- GitHub Spec Kit README: https://github.com/github/spec-kit/blob/main/README.md
- Agentic SDD: https://github.com/github/spec-kit/blob/main/docs/reference/agentic-sdd.md
- Plan Template: https://github.com/github/spec-kit/blob/main/templates/plan-template.md
- Tasks Template: https://github.com/github/spec-kit/blob/main/templates/tasks-template.md
