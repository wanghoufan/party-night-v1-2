# Tasks: Party Night V1.2 — 玩法扩展、主局整合与规则库

**Input**: V1.2 Constitution + SPEC + PLAN + 既有 V1.0 代码  
**Execution Mode**: 连续开发；MVP Gate 仅内部检查点，不暂停；全部任务结束后才进入 Human Gate。  
**Important**: 本 TASKS 是 V1.2 的**增量任务集**，不要求重做 V1.0 已完成内容；实施前先核对实际代码路径并映射到现有文件。

## Format

`- [ ] Txxx [P?] [US?] Description — path`

`[P]` 表示可与同阶段其他标记为 P 的任务并行；同一文件冲突时仍需串行。

## Pre-Implementation Quality Gate（编码前，必须）

- 本 V1.2 文档已做一次人工 Analyze 式交叉检查。
- 如果仓库已安装当前 GitHub Spec Kit，**在执行 T104 前**运行 `/speckit.analyze`（或当前 agent 对应语法）；发现 CRITICAL/HIGH 时先修正文档再编码。
- `Converge` 只能在实现后运行，不得把它当成实现前 Analyze。
- **Test-first 规则**：本文件中凡有对应 unit/integration/E2E 的功能，测试必须先编写并确认对未实现行为失败，再执行对应实现任务；任务编号用于追踪，不代表可以跳过该依赖顺序。


## Phase 1 — Baseline Audit & Safety Net

- [ ] **T104** 建立 brownfield 可审查 baseline：确认/记录当前 git 状态（必要时先 commit/stash）、所在 feature branch/等价隔离环境；随后读取现有 BottomTabBar、首页、组局、游戏包、设置、session-engine、registry、repository 实际路径，形成 path mapping；只记录映射，不迁移目录。— repo audit / git status
- [ ] **T105** 运行现有 lint/typecheck/unit/integration/e2e/build，并记录 Node/package-manager/Next/React/Tailwind 实际版本与 lockfile；检查当前 major 的官方安全更新但不做无关框架迁移。记录 V1.2 开工前 baseline；现有失败先归因，不把历史失败误算成新功能回归。— `package.json` / lockfile / package scripts/tests
- [ ] **T106** [P] 为四 Tab、首页 4 核心卡、组局关系/氛围/尺度、设置 Provider 页面补最小 regression E2E snapshot/semantic assertions。— `tests/e2e/v1-regression.spec.ts`
- [ ] **T107** [P] 对当前 IndexedDB/session schema 做 fixture 快照，准备 V1.0 migration test 数据。— `tests/fixtures/v1-session.json`
- [ ] **T108** 确认现有“组局”Tab 的 active Session 路由/状态职责，统一内部命名注释为 main session，不修改用户可见 Tab 文案。— existing navigation/session files

**Checkpoint A**：能证明“新增前原版可用”，且已锁住不应被改坏的 UI/行为。

## Phase 2 — Domain & Session Foundation

- [ ] **T109** [P] 扩展 GamePack capability schema：minPlayers、renderer、requiresAIContent、supportsLocalSeed、supportsMixedMode。— `lib/domain/schemas.ts` / existing equivalent
- [ ] **T110** [P] 为 GameSession 增加 `currentPackId`、packStates/recentRejectedFingerprints 等等价字段，并提升 schemaVersion。— `lib/domain/schemas.ts`
- [ ] **T111** 实现 V1.0 → V1.1 幂等 migration；缺失 currentPackId 时从最近 round/默认 pack 推导。— `lib/storage/db.ts` / migration module
- [ ] **T112** [P] 编写 migration tests：正常旧数据、缺字段、重复迁移、坏记录隔离。— `tests/unit/session-migration.test.ts`
- [ ] **T113** 实现 `switchPack(packId)`：验证 enabled/minPlayers → 保存稳定状态 → 更新 currentPackId → 初始化 pack state → autosave。— `lib/engine/session-engine.ts`
- [ ] **T114** [P] 编写 switchPack deterministic state-transition tests，验证 Session ID/config/history 不变。— `tests/unit/session-switch.test.ts`
- [ ] **T115** 扩展 RoundHistory：记录 packId/cardId/status/participantIds/result；保持旧记录可读。— domain + repository
- [ ] **T116** [P] 实现 rejection fingerprint 与最近换题历史；不引入向量库。— `lib/engine/card-selector.ts` / util
- [ ] **T117** [P] 编写 rejection/dedupe tests，验证“换一个”后短期不重复相同/近似规范化文本。— `tests/unit/rejection-dedupe.test.ts`

**Checkpoint B**：无 UI 也能在测试里同一 Session 切 pack、持久化、恢复。

## Phase 3 — Registry & New Built-in Pack Definitions

- [ ] **T118** [P] [US3] 新增“二选一” pack definition/schema。— `lib/game-packs/would-you-rather.ts`
- [ ] **T119** [P] [US4] 新增“指人游戏” pack definition/schema。— `lib/game-packs/pointing-game.ts`
- [ ] **T120** [P] [US5] 新增“默契测试” pack definition/schema + pack-local state schema。— `lib/game-packs/compatibility-test.ts`
- [ ] **T121** [P] [US6] 新增“转瓶子” pack definition；声明纯本地、无 AI card requirement。— `lib/game-packs/spin-bottle.ts`
- [ ] **T122** 为二选一/指人/默契测试加入可离线 seed cards，标签/尺度覆盖现有 Session 模型。— `lib/game-packs/built-in-seeds/`
- [ ] **T123** 将 4 个新 pack 注册到 registry；默认启用策略与现有内置 pack 一致。— `lib/game-packs/registry.ts`
- [ ] **T124** [P] 扩展 registry contract tests：8 个内置玩法 capability 完整、id 唯一、minPlayers 合法。— `tests/unit/game-pack-registry.test.ts`
- [ ] **T125** 验证 disabled pack 不出现在 mixed selector/主局 switcher 候选。— engine integration + tests

## Phase 4 — AI Generation Extension & Fallback

- [ ] **T126** [P] 更新 prompt builder，使二选一/指人/默契测试能按现有关系/氛围/尺度/雷区批量生成结构化卡。— `lib/ai/prompt-builder.ts`
- [ ] **T127** [P] 扩展 AI card schema/normalizer 支持新增 card types。— `lib/ai/card-schema.ts`, `normalize.ts`
- [ ] **T128** 保证 V1.0 的真心话/谁最可能/我从来没有/AI 即兴 schema 行为不变；新增 regression fixtures。— AI tests
- [ ] **T129** 实现 pack-specific refill：当目标玩法可用卡低于阈值，先从 seed 立即补位，网络可用时后台 refill。— generation orchestration
- [ ] **T130** [P] 编写 Provider failure → new-pack seed fallback integration tests。— `tests/integration/v1-1-generation-fallback.test.ts`
- [ ] **T131** 验证新增 renderer/tool 只调用既有 provider service/adapter，不创建第二套 API Key 存储；区分系统托管 Key 与用户 BYOK，确认完整 Key 不进入日志、错误上报、导出/备份或 Service Worker Cache。— security regression

**Checkpoint C**：新增 AI 玩法即使断网也能开局；Provider 错误不阻断主局。

## Phase 5 — Main Session Pack Switching UI

- [ ] **T132** [US2] 实现 `PackSwitcherSheet`，展示 enabled + minPlayers 满足的玩法，并标记当前玩法。— `components/game/PackSwitcherSheet.tsx`
- [ ] **T133** [US2] 在现有游戏主界面加入轻量“切换玩法”入口，不改主要完成/换题/跳过布局。— `app/game/page.tsx` / current main session page
- [ ] **T134** [US2] 切换后根据 registry renderer 渲染对应 view；不得创建每个玩法独立 Session 页面。— game host/renderer map
- [ ] **T135** [US2] 用户从首页点击另一个玩法且已有 active Session 时，直接 switchPack 并导航到组局主局。— `app/page.tsx` + navigation service
- [ ] **T136** [US2] 无 active Session 点击玩法时，预选 pack 后复用现有 quick/minimal setup，禁止新增第二套设置向导。— home/setup flow
- [ ] **T137** [P] 编写 E2E：同一 Session 连续切换“我从来没有 → 二选一 → 转瓶子 → 真心话”，Session ID/config/尺度不变。— `tests/e2e/pack-switching.spec.ts`
- [ ] **T138** [P] 编写 refresh recovery E2E：刷新后 currentPackId 恢复。— `tests/e2e/session-current-pack-recovery.spec.ts`

## Phase 6 — Would You Rather UI

- [ ] **T139** [P] [US3] 实现 `WouldYouRatherView`：A/VS/B、可选短倒计时提示、主按钮下一题、弱按钮换一个。— `components/game/WouldYouRatherView.tsx`
- [ ] **T140** [US3] 接入共享 RoundActions/engine：下一题=completed，换一个=swapped/rejected。— renderer + engine adapter
- [ ] **T141** [P] [US3] E2E 覆盖 10 轮、换题、断网 seed fallback、尺度继承。— `tests/e2e/would-you-rather.spec.ts`

## Phase 7 — Pointing Game UI

- [ ] **T142** [P] [US4] 实现 `PointingGameView`：指令卡 + 3/2/1 + 👉 指。— `components/game/PointingGameView.tsx`
- [ ] **T143** [US4] 倒计时提供 reduced-motion/快速跳过表现；不强制统计票数。— renderer
- [ ] **T144** [P] [US4] E2E 覆盖 10 轮、换题、倒计时、无票数输入也可继续。— `tests/e2e/pointing-game.spec.ts`

## Phase 8 — Compatibility Test UI & State

- [ ] **T145** [P] [US5] 实现配对选择器，默认从 active players 中选择两人；少于 2 人时玩法不可用。— `components/game/CompatibilityPairPicker.tsx`
- [ ] **T146** [US5] 实现 `CompatibilityView`：pair、题目、3/2/1、一样/不一样、score/rounds。— `components/game/CompatibilityView.tsx`
- [ ] **T147** [US5] 实现 compatibility reducer/state persistence；score 只在“一样”动作时 +1。— pack state adapter/session engine
- [ ] **T148** [P] [US5] Unit tests 覆盖 score、换 pair、刷新前后序列化。— `tests/unit/compatibility-state.test.ts`
- [ ] **T149** [P] [US5] E2E：配对 → 5 题 → 刷新 → 分数/配对恢复 → 继续。— `tests/e2e/compatibility.spec.ts`

## Phase 9 — Spin Bottle UI & Chaining

- [ ] **T150** [P] [US6] 复用 player-selector 增加 `selectEligiblePlayer` 场景接口，排除 inactive，并可避免连续选同一人。— `lib/engine/player-selector.ts`
- [ ] **T151** [US6] 实现 `SpinBottleView`；先确定 target，再播放指向该 target 的动画。— `components/game/SpinBottleView.tsx`
- [ ] **T152** [US6] 结果页提供“真心话 / 大冒险 / 再转一次”；前两者链入现有 truth-or-dare 而非复制逻辑。— spin action adapter
- [ ] **T153** [P] [US6] 1000 次 selector unit/property-style test：不选 inactive、索引合法、单玩家特殊状态有明确处理。— `tests/unit/spin-bottle-selector.test.ts`
- [ ] **T154** [P] [US6] E2E：注入/固定 RNG，使测试稳定得到预期玩家（例如 Alex）→ 真心话 → 完成 → 返回/再次 spin；禁止依赖真实随机导致 flaky test。— `tests/e2e/spin-bottle.spec.ts`

## Phase 10 — Party Tools

- [ ] **T155** [P] [US7] 实现“随机点名” pure random-player tool，支持 injected RNG 与 avoid-immediate-repeat。— `lib/tools/random-player.ts`
- [ ] **T156** [P] [US7] 实现“随机分组” random-groups：shuffle + balanced distribute；组人数差 ≤1。— `lib/tools/random-groups.ts`
- [ ] **T157** [P] [US7] Unit tests 覆盖 2–12 人、2/3 组、两人一组、奇数余数。— `tests/unit/party-tools.test.ts`
- [ ] **T158** [US7] 实现 `RandomPlayerTool` 与 `RandomGroupTool` UI，复用 Session 玩家；无昵称显示占位。— `components/tools/`
- [ ] **T159** [US7] 将工具放入“更多玩法”或游戏包玩法页的“快捷工具”区域，不新增底部 Tab。— home/packs UI

## Phase 11 — Home Additive Entry

- [ ] **T160** [US1] 保留首页原 2×2 核心卡与所有现有快捷入口；新增一个低侵入“更多玩法”入口；核心 pack 被禁用时卡片保留位置并显示禁用态，点击只引导重新启用，不绕过 registry。— `app/page.tsx`
- [ ] **T161** [US1] 实现 `MoreGamesSheet`，列出 4 新玩法 + 2 工具；视觉复用现有卡片/霓虹 tokens。— `components/game/MoreGamesSheet.tsx`
- [ ] **T162** [P] 回归 360/390/430px 首页，确认无横向溢出、原入口无位置破坏到不可接受。— visual/e2e

## Phase 12 — Game Pack Page Integration

- [ ] **T163** [US8] 在现有“我的游戏包”增加 `玩法 / 规则` 二级切换；默认仍进入玩法。— `app/packs/page.tsx`
- [ ] **T164** [US8] 玩法页列出 8 个内置玩法，保留现有启用/禁用状态和自定义玩法创建。— packs UI/registry
- [ ] **T165** [US8] 在玩法页增加“快捷工具”分区或等价入口；工具不使用“已启用”语义。— packs UI
- [ ] **T166** [P] 回归现有自定义 Pack CRUD，确保新增 segment 不破坏新增/编辑/禁用。— `tests/e2e/custom-pack-regression.spec.ts`

## Phase 13 — Rule Library Data

- [ ] **T167** [P] [US8] 定义 RuleEntry/RuleStep/RuleVariant schema。— `lib/rules/types.ts`
- [ ] **T168** [P] [US8] 编写小姐牌规则条目，明确“常见版本/变体”。— `lib/rules/entries/miss-card.ts`
- [ ] **T169** [P] [US8] 编写 King's Cup 规则条目，明确 house rules。— `lib/rules/entries/kings-cup.ts`
- [ ] **T170** [P] [US8] 编写逛三园规则条目。— `lib/rules/entries/three-gardens.ts`
- [ ] **T171** [P] [US8] 编写逢七过规则条目。— `lib/rules/entries/seven-pass.ts`
- [ ] **T172** [P] [US8] 编写十五二十规则条目。— `lib/rules/entries/fifteen-twenty.ts`
- [ ] **T173** [P] [US8] 编写吹牛骰子规则条目。— `lib/rules/entries/liars-dice.ts`
- [ ] **T174** [P] [US8] 编写数字炸弹规则条目。— `lib/rules/entries/number-bomb.ts`
- [ ] **T175** [P] [US8] 编写划拳规则条目并标注地域差异。— `lib/rules/entries/finger-guessing.ts`
- [ ] **T176** [US8] 聚合 `catalog.ts`，校验 id 唯一、字段完整、所有 house-rule 项有变体提示。— `lib/rules/catalog.ts`
- [ ] **T177** [P] [US8] 对 8 条规则做公开资料交叉核验；只修正文案事实，不改变 SDD 交互结构。— research + rule source comments
- [ ] **T178** [P] [US8] 编写 catalog schema/required-field tests。— `tests/unit/rule-catalog.test.ts`

## Phase 14 — Rule Library UI

- [ ] **T179** [US8] 实现 Rules tab：搜索 + 规则卡片 + 可选分类 chips。— `components/packs/RuleList.tsx`
- [ ] **T180** [US8] 实现详情：标题/别名、道具、人数、30 秒看懂、详细规则/牌义、常见变体。— `components/packs/RuleDetail.tsx`
- [ ] **T181** [US8] 详情页不展示“开始手机游戏”主 CTA；只提供返回/收藏（若现有收藏能力存在）等轻操作。— rules page
- [ ] **T182** [P] [US8] E2E：从游戏包 → 规则 → 小姐牌，3 次点击内打开详情；8 条均可导航。— `tests/e2e/rules-library.spec.ts`
- [ ] **T183** [P] [US8] 搜索 empty state test；禁止搜索不到时调用 AI 猜规则。— rules tests

## Phase 15 — Settings & Scale Regression

- [ ] **T184** [P] [US1] E2E 锁定现有关系选项、今晚氛围选项、尺度 slider 行为；本次不改文案/档位。— `tests/e2e/setup-regression.spec.ts`
- [ ] **T185** [P] [US1] E2E 锁定设置页深/浅色、AI Provider/Model/Base URL/API Key 配置入口，并验证清空 API Key 仍有危险样式区分与二次确认。— `tests/e2e/settings-regression.spec.ts`
- [ ] **T186** 确认新增玩法全部读取现有 `SessionConfig.intensity/vibe/relationship/boundaries`，不存在第二套尺度字段。— code audit + unit tests

## Phase 16 — Persistence, Recovery & PWA

- [ ] **T187** [US9] 在重要动作后 autosave：switch pack、completed/swapped/skipped、compatibility score、spin stable result。— session repository/service
- [ ] **T188** [P] [US9] E2E：进行新玩法后刷新/PWA reload，恢复 currentPack 与局部 state。— `tests/e2e/v1-1-recovery.spec.ts`
- [ ] **T189** [US9] Service Worker/cache regression：新静态 rule catalog/seed assets 可离线；AI endpoint、Provider 响应、API Key/导出数据不得被 cache；使用版本化 cache 并验证旧 cache 不会锁死不兼容 bundle。— PWA config/tests
- [ ] **T190** [US9] 坏 Session migration/deserialize 失败时隔离记录并安全回首页，禁止白屏。— repository/error boundary

## Phase 17 — Visual QA & Interaction Polish

- [ ] **T191** [P] 对新增 UI 做 Design Token audit：颜色、圆角、边框、字号、间距、glow 与现有页面一致。— UI audit
- [ ] **T192** [P] 检查主游戏页“一主一辅”动作原则；次要设置移入 sheet/menu。— game views
- [ ] **T193** [P] reduced-motion、focus、按钮语义、44px 触控目标、文字对比基础检查。— accessibility pass
- [ ] **T194** [P] 真机/移动浏览器 smoke：360/390/430px；弱光场景可读性；底栏/safe-area 无遮挡。— QA
- [ ] **T195** 检查新增动画不成为强制等待；转瓶/倒计时允许快速继续或 reduced-motion 简化。— UX QA

## Phase 18 — Security, Compatibility & Upgrade Hardening

- [ ] **T196** [P] 先编写安全渲染 unit/component tests：AI 题目、自定义题卡、玩家昵称、规则文本含 `<script>`、事件属性、超长文本时不得执行 HTML/JS；超长字段按 schema 拒绝/规范化。— `tests/unit/safe-content-rendering.test.tsx` / existing equivalent
- [ ] **T197** 实现/收敛安全文本渲染与长度约束；优先使用 React 默认转义/现有安全绑定，禁止对不可信内容使用原始 HTML 注入。— shared renderer/schema utilities
- [ ] **T198** [P] 编写凭据泄漏审计：检查 logs/error serialization/export/backup/Service Worker caches，确保完整 API Key 不出现；系统托管 Key 仅服务端，BYOK 仅沿用既有本地存储；核对设置文案不把浏览器持久化 BYOK 宣称为强机密存储。— security tests/audit
- [ ] **T199** [P] 编写 E2E：禁用任一首页核心 pack → 首页卡仍可见且标记禁用 → 点击不能直接开始 → 可跳转游戏包重新启用。— `tests/e2e/disabled-core-pack.spec.ts`
- [ ] **T200** [P] 编写 V1.x → V1.2 升级 E2E：旧 Session fixture + 旧 cache/新 bundle 组合，验证迁移幂等、active Session 可恢复、失败不清库。— `tests/e2e/pwa-schema-upgrade.spec.ts`
- [ ] **T201** 实现必要的事务化 migration/version-skew guard：升级失败保留旧记录并安全回退；禁止 destructive clear 作为默认修复。— IndexedDB migration + app bootstrap
- [ ] **T202** [P] 编写 safety red-team fixtures/tests：强迫饮酒、危险挑战、非自愿接触、违法危险行为、未成年人/年龄未知露骨性内容必须被 safety filter 拒绝。— `tests/unit/safety-redteam.test.ts`
- [ ] **T203** [P] 编写 E2E：目标 AI pack 无缓存 + 断网时，switchPack 后立即使用 local seed 进入可玩状态，不出现阻塞 loading。— `tests/e2e/offline-pack-switch.spec.ts`

**Checkpoint D**：密钥不泄漏、外部文本不执行、旧数据可安全升级、禁用语义一致、断网切玩法不阻塞。

## Phase 19 — Full Regression & Convergence

- [ ] **T204** 运行全部 lint/typecheck/unit/integration/e2e/build，修复新引入失败。— CI/local
- [ ] **T205** 手工回归 V1.0 主路径：今晚开局 → 现有 4 玩法 → 游戏包自定义 → 设置 → Session 恢复。— smoke checklist
- [ ] **T206** 手工回归 V1.2 主路径：更多玩法 → 4 新玩法 → 主局切换 → tools → 规则库。— smoke checklist
- [ ] **T207** 执行 FR-001–FR-046 pre-release traceability audit；任何未覆盖 FR 必须补 task/test。— traceability audit
- [ ] **T208** 执行 pre-release cross-artifact consistency review，确认实施过程中没有产生 Constitution/SPEC/PLAN/TASKS drift；若发现意图变化先回写 SPEC/PLAN/TASKS。— release consistency audit
- [ ] **T209** 实施完成后执行 Converge 思路：对照 spec/plan/tasks 检查 missing/partial/contradicts/unrequested；有 gap 则追加 convergence tasks 并继续开发，直到无剩余关键 gap。— convergence
- [ ] **T210** 最终 Human Gate：仅在 T104–T203 全部完成、T209 Converge 已无关键 gap 且自动检查通过后请求一次完整 V1.2 验收。— human review


## Dependencies & Suggested Parallelism

```text
Phase 1 Baseline
   ↓
Phase 2 Session Foundation
   ↓
Phase 3 Registry/Packs ───────┬──────── Phase 4 AI Extension
   ↓                          │
Phase 5 Main Switching        │
   ↓                          │
┌──────────── New Game UIs ───┤
│ P6 Would You Rather         │
│ P7 Pointing                 │
│ P8 Compatibility            │
│ P9 Spin Bottle              │
└─────────────────────────────┘
   ↓
P10 Tools      P11 Home      P12 Pack Page
   └────────────┬──────────────┘
                ↓
        P13 Rule Data → P14 Rule UI
                ↓
 P15 Regression → P16 Recovery → P17 Visual QA
                ↓
       P18 Security/Upgrade
                ↓
       P19 Full Regression/Converge
```

可并行重点：

- T118–T121 四个 Pack definitions。
- T139/T142/T145/T150 之后，四个玩法 UI 可由不同执行者并行。
- T168–T175 八条规则内容可并行，T176 统一聚合。
- T184/T185、T191–T194 可并行。

## MVP Gate（内部检查点，不暂停）

当 T104–T154 完成，内部自动检查以下条件：

- 既有 UI/四 Tab 无回归。
- 同 Session 切玩法可用。
- 新 4 玩法全部基础可玩。
- AI fallback 可用。
- 尺度系统未被重做。

**通过后继续执行，不请求人工确认。**

## V1.2 Human Gate

T104–T203 全部完成后一次验收：

1. 首页、组局、游戏包、设置还是不是原来熟悉的结构。
2. 新玩法是否自然融入，而不是像拼了第二个 App。
3. 一场局切换游戏是否真的不重新设置。
4. 尺度/关系/氛围是否全玩法一致继承。
5. 转瓶子→真心话/大冒险串联是否顺。
6. 规则库是否真的 30 秒能看懂，且没有把线下游戏搞复杂。
7. 断网/刷新/AI 失败能否继续。
8. 真机弱光环境是否好读、好按。
9. BYOK/系统密钥是否没有泄漏到日志/缓存/导出。
10. 旧 Session/PWA 更新是否能安全恢复。
11. 恶意 HTML/超长 AI 文本是否不会执行或破坏 UI。
12. 高尺度 safety red-team fixture 是否全部被拦截。

## Requirements Traceability Matrix

| FR | Main Tasks | Test/Verification |
|---|---|---|
| FR-001 | T106, T160–162 | four-tab/home regression |
| FR-002 | T106, T160–162 | home primary-pack regression |
| FR-003 | T106, T184, T186 | setup/scale regression |
| FR-004 | T106, T131, T185 | settings + API credential regression |
| FR-005 | T110, T113–115 | session model/switch tests |
| FR-006 | T113–114, T132–138 | same-session switching E2E |
| FR-007 | T115, T137 | RoundHistory assertion |
| FR-008 | T111–112, T138, T187–190 | refresh recovery |
| FR-009 | T123–125, T132 | enabled/minPlayers switcher tests |
| FR-010 | T128, T205 | truth-or-dare regression |
| FR-011 | T128, T205 | most-likely regression |
| FR-012 | T128, T205 | never-have-I-ever regression |
| FR-013 | T128, T205 | AI-improv regression |
| FR-014 | T118, T139–141 | would-you-rather E2E |
| FR-015 | T119, T142–144 | pointing E2E |
| FR-016 | T120, T145–149 | compatibility E2E |
| FR-017 | T121, T150–154 | spin-bottle E2E |
| FR-018 | T122, T126–130, T186 | context inheritance tests |
| FR-019 | T139–144, T192 | no per-player input UX check |
| FR-020 | T120, T145–149, T187–188 | pair/score recovery |
| FR-021 | T150–154 | spin → truth/dare chain |
| FR-022 | T155, T158–159 | random-player tool |
| FR-023 | T156–159 | random-group tool |
| FR-024 | T155–159 | no-AI dependency unit test/audit |
| FR-025 | T126–130 | batch/cache/fallback integration |
| FR-026 | T126–130 | schema/filter/dedupe tests |
| FR-027 | T116–117, T140 | rejection fingerprint tests |
| FR-028 | T122, T129–130 | provider failure fallback |
| FR-029 | T163, T179–183 | rules inside game-pack E2E |
| FR-030 | T168–176, T182 | eight-entry navigation test |
| FR-031 | T167–180 | rule schema/detail test |
| FR-032 | T168–178 | house-rule/variant validation |
| FR-033 | T181, T206 | no forced digitization UX review |
| FR-034 | T110–112, T187–190 | active Session recovery |
| FR-035 | T147–149, T187–188 | pack-local state recovery |
| FR-036 | T163–183 + existing repositories | local persistence review |
| FR-037 | T161–162, T191–195 | visual token audit |
| FR-038 | T161, T179–180, T191 | component/token reuse audit |
| FR-039 | T139–159, T192–195 | mobile usability/real-device smoke |
| FR-040 | T184, T186 | no scale redesign regression |
| FR-041 | T131, T185, T198 | secret boundary/leak audit |
| FR-042 | T196–204 | safe rendering + length-limit tests |
| FR-043 | T107, T111–112, T189–190, T200–208 | migration/version-skew recovery |
| FR-044 | T125, T160, T199 | disabled core-card behavior |
| FR-045 | T129–130, T203 | offline seed-first switch |
| FR-046 | T126–130, T202 | safety filter/red-team tests |

## Cross-Document Consistency Review（已完成）

### 发现并解决的冲突/歧义

1. **“三个 Tab”建议 vs 现有四 Tab**  
   解决：正式冻结四 Tab；规则进入游戏包；设置保留；不新增 Party Tab。

2. **“Party”与“主局/组局”概念重叠**  
   解决：Party Session = 后台一场局数据；组局 = 前台主局运行空间。UI 不增加 Party 导航。

3. **新建议的三/四档尺度 vs 现有 1–5 尺度**  
   解决：完全沿用现有尺度，不新增第二套体系。

4. **首页一次展示 8 个游戏可能过密**  
   解决：保留原 2×2 核心卡；新增“更多玩法”轻入口，低侵入承载 4 新玩法 + 2 工具。

5. **规则库是新 Tab 还是游戏包内容**  
   解决：规则库属于游戏包，使用页面内“玩法/规则”二级切换。

6. **传统酒桌游戏是否全部 App 化**  
   解决：不。小姐牌/King's Cup/骰子等只做规则参考；真正需要手机主持的玩法才进入可玩 Engine。

7. **“谁最可能”和“指人游戏”过于相似**  
   解决：数据/Prompt 类型分开。谁最可能是“概率判断/投票感”，指人游戏是直接指令 + 倒计时，且不要求统计票数。

8. **转瓶子是否是 AI 玩法**  
   解决：随机选择纯本地；只在选择真心话/大冒险后复用 AI/Deck 内容。

9. **默契测试是否需要两台手机/秘密输入**  
   解决：V1.1 单机同桌，双方同时口头回答，Host 点击一样/不一样。

10. **AI 是每轮生成还是整局生成**  
    解决：沿用 V1.0 整局预生成 + local seed；只在不足时可后台 refill。

11. **新规则内容是否可直接视为“官方规则”**  
    解决：只写“常见规则/常见变体”；实施前对首批 8 项再次公开资料交叉核验。

12. **V1.0 已有功能是否需要重做任务**  
    解决：本 TASKS 从 T104 起作为增量集；已有功能只做 regression 和必要接口扩展。

13. **Spec Kit Analyze 被放在实现末尾**  
    解决：V1.2 明确 Analyze 在 Tasks 后、Implement 前；Phase 19 仅保留 pre-release consistency audit + Converge。

14. **V1.0“密钥不得进浏览器”与现有 BYOK UI 的冲突**  
    解决：区分系统托管 Key 与用户主动 BYOK；前者绝不进浏览器，后者沿用本地模式但禁止日志/导出/缓存泄漏。

15. **禁用内置玩法 vs 首页固定四卡冲突**  
    解决：首页位置保留，但卡片进入禁用态；不能绕过游戏包禁用设置直接开始。

16. **PWA 更新 + IndexedDB schema 迁移风险**  
    解决：增加事务化 migration、version-skew guard、旧 cache/新 bundle E2E。

17. **AI/用户文本的 XSS 与超长内容边界缺失**  
    解决：统一纯文本安全渲染、长度上限和恶意 fixture 测试。

18. **高尺度内容安全边界过于笼统**  
    解决：补充强迫饮酒/危险挑战/非自愿接触/未成年人露骨性内容的 hard filter，并规定年龄未知时不生成露骨内容。

### 最终检查

- Constitution → SPEC：**PASS**
- SPEC → PLAN：**PASS**
- PLAN → TASKS：**PASS**
- FR-001–FR-046 → Tasks/Tests：**PASS**
- 现有 UI → V1.1 增量 UI：**PASS（保留优先）**
- 新玩法 → Engine/Session 共享：**PASS**
- Rules → Game Pack IA：**PASS**
- Scale → Existing model：**PASS**
- Out-of-scope 控制：**PASS**

**结论：V1.2 可作为当前唯一增量开发基线；正式编码前先执行 pre-implementation Analyze，实施后用 Converge 收敛。**
