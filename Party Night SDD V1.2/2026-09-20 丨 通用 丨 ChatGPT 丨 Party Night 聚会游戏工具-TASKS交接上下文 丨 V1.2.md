# Tasks: Party Night V1

**Input**: Constitution 1.2.0, SPEC V1.2, PLAN V1.2, 方案 A UI/原型资产  
**Prerequisites**: SPEC 与 PLAN 已完成；本任务清单按 GitHub Spec Kit 当前 `tasks-template` 的“Setup → Foundational → User Stories → Polish”组织。  
**Tests**: 本项目明确要求 Engine、AI pipeline、持久化和核心用户路径自动化测试，因此测试任务为必需项。

## Format: `[ID] [P?] [Story] Description`

- `[P]`：与同阶段其他任务不修改同一关键文件、可并行。
- `[US#]`：映射 SPEC User Story。
- 每个任务均给出预期文件路径；如实现时路径发生合理调整，必须同步更新 TASKS/PLAN，禁止静默漂移。

## Pre-Implementation Quality Gate（必须先于 T001）

在任何代码实现开始前，必须先按当前 GitHub Spec Kit 质量流程运行一次 **`/speckit.analyze`**（或目标智能体对应的 Analyze 命令），检查 Constitution / SPEC / PLAN / TASKS 的冲突、遗漏和歧义。

- Analyze 结果存在 HIGH / CRITICAL 或明确的 requirement/task gap：**禁止进入 T001**；先回到对应 SPEC / PLAN / TASKS 修正，再重新 Analyze。
- Analyze clean 后，才允许连续执行 T001 → T123。
- T122 保留为实现后的第二轮 Analyze/一致性复核；T123 为 implement → converge 循环直至 Converged。

## Phase 1: Setup (Shared Infrastructure)

**Purpose**：建立可运行 PWA、测试框架、方案 A 资产和代码质量基线。

- [x] **T001** 初始化 Next.js 16.x + TypeScript + App Router 项目，使用 pnpm，创建 `package.json`、`tsconfig.json`、`next.config.ts`。
- [x] **T002** [P] 配置 ESLint、TypeScript strict、格式化规则和脚本，更新 `package.json`、`eslint.config.*`。
- [x] **T003** [P] 安装并配置 Tailwind CSS 4.x、Zod、idb、测试依赖，更新 `package.json` 与 `app/globals.css`。
- [x] **T004** [P] 配置 Vitest + Testing Library，创建 `vitest.config.ts`、`tests/setup.ts`。
- [x] **T005** [P] 配置 Playwright，创建 `playwright.config.ts` 与 `tests/e2e/`。
- [x] **T006** 将方案 A 品牌/图标素材复制到 `public/brand/`、`public/icons/`，保留原始设计资产在仓库 `docs/design-assets/`。
- [x] **T007** 根据 `设计资产/方案 A 丨 UI 设计系统.png` 建立第一版 Design Tokens，在 `app/globals.css` 定义颜色、字体、圆角、阴影、霓虹 glow、spacing variables。
- [x] **T008** 创建基础目录 `components/`、`lib/engine/`、`lib/game-packs/`、`lib/ai/`、`lib/storage/`、`lib/domain/`、`tests/unit/`、`tests/integration/`。
- [x] **T009** [P] 创建 `.env.example` 作为**仅开发测试 fallback**，默认不要求填写真实 Key；正常用户通过 App 内 AI 设置配置。明确禁止 `NEXT_PUBLIC_` 暴露 secret。
- [x] **T010** [P] 创建 `Dockerfile` 和 `.dockerignore`，确保 build 阶段不复制本地 `.env*` secrets。

**Checkpoint**：`pnpm dev`、`pnpm test`、`pnpm typecheck`、Playwright 空 smoke test 均可运行。

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**：完成所有 User Story 共用的领域模型、Engine 接口、存储、AI 契约和 UI 原子组件。

⚠️ **CRITICAL**：Phase 2 未完成前，不进入具体 User Story 页面开发。

- [x] **T011** 定义 Player、BoundaryProfile、GameCard、GamePackDefinition、SessionConfig、RoundHistory、GameSession 类型与 Zod schemas，创建 `lib/domain/schemas.ts`、`lib/engine/types.ts`。
- [x] **T012** [P] 定义内置关系、氛围、强度、边界标签常量，创建 `lib/domain/constants.ts`。
- [x] **T013** 建立 Game Pack registry 接口和注册机制，创建 `lib/game-packs/registry.ts`，确保新增 Pack 不依赖 React 页面。
- [x] **T014** [P] 建立 IndexedDB 数据库 schemaVersion=1，创建 `lib/storage/db.ts`，stores 至少含 players/preferences/gamePacks/sessions/sessionSummaries。
- [x] **T015** [P] 实现 `lib/storage/session-repository.ts`、`preferences-repository.ts`、`game-pack-repository.ts` 的 CRUD 与错误隔离。
- [x] **T016** 实现可注入随机源的 `lib/engine/player-selector.ts`，支持单人避免连续、次数平衡、pair 互动平衡。
- [x] **T017** 实现 `lib/engine/card-selector.ts`，支持未使用、人数、强度、雷区与 pack 条件过滤。
- [x] **T018** 实现 `lib/engine/stage-controller.ts`，定义 warm-up / flow / heat-up 权重，不得突破 Session intensity/boundaries。
- [x] **T019** 实现 `lib/engine/session-engine.ts` 的 createSession、startRound、complete、swap、skip、pause、resume、finish 基础接口。
- [x] **T020** [P] 建立 AI `GameCard` 输出 Schema，创建 `lib/ai/card-schema.ts`。
- [x] **T021** [P] 建立 provider adapter 接口，创建 `lib/ai/provider.ts`；endpoint/profile 可配置，Key 由专用 secret 流程在请求时读取，不写入普通 client state/log。
- [x] **T022** 实现 `lib/ai/safety-filter.ts` 与 `normalize.ts`，执行 boundaryTags、强度、人数、最低安全规则和去重 normalization。
- [x] **T023** [P] 建立基础 UI 组件 `components/ui/Button.tsx`、`NeonCard.tsx`、`Tag.tsx`、`Toggle.tsx`、`Slider.tsx`、`Modal.tsx`。
- [x] **T024** [P] 建立品牌组件 `components/brand/PartyNightLogo.tsx`、`NeonBackground.tsx` 并接入方案 A tokens。
- [x] **T025** [P] 建立通用 `components/ui/BottomTabBar.tsx` 与 icon mapping，图标使用真实 SVG/组件而不是截屏裁切。
- [x] **T026** 为 T011–T022 编写基础单元测试，覆盖 schema、filter、card/player selector 和 session state transitions，放在 `tests/unit/`。

**Checkpoint**：Engine 可以在无页面的测试中创建 Session、选择下一张卡、完成/换题/跳过并持久化。

## Phase 3: User Story 9 — AI Provider 配置与 API Key 安全 (Priority: P1)

**Goal**：用户在 App 内配置 AI，不修改 `.env`；**DeepSeek Official 为默认**，OpenCode Go 仅作为 experimental/manual-only，Custom 为高级入口。Key 跨重启保存时使用 Web Crypto 加密，清空操作具备独立 Danger Zone 与二次确认。

**Independent Test**：DeepSeek 默认选中 → 填 Key → 测试 → AES-GCM 加密保存 → 刷新恢复；IndexedDB 无明文 Key；OpenCode Go 不自动启用且显示实验性说明；点击清空一次不删除；取消不删除；明确二次确认后才删除。

### Tests

- [x] **T027** [P] [US9] 编写 `AIProviderProfile` / preset schema tests：DeepSeek Official `isDefault=true`；OpenCode Go `experimental=true`、`autoFallback=false`；Custom 可配置；registry 中不存在 OpenCode Zen。
- [x] **T028** [P] [US9] 编写 encrypted secret repository tests：Web Crypto AES-GCM encrypt/decrypt round-trip、每次随机 IV、non-extractable CryptoKey、IndexedDB 无明文 Key；无法安全持久化 CryptoKey 时只允许 session-only。
- [x] **T029** [P] [US9] 编写 secret redaction tests：完整 API Key 不出现在 formatter、错误对象序列化、UI error message。
- [x] **T030** [P] [US9] 编写 API Key 清空 reducer/service tests：open-confirm 不删除、cancel 不删除、confirmed clear 才调用 repository delete。
- [x] **T031** [P] [US9] 创建 E2E `tests/e2e/ai-settings.spec.ts`，覆盖 DeepSeek 默认、测试连接、加密保存/刷新恢复、Provider 切换、OpenCode Go 实验性提示与手动启用。
- [x] **T032** [P] [US9] 创建 E2E `tests/e2e/api-key-danger-zone.spec.ts`：首次点击删除次数=0、取消保留、确认后删除、状态改“未配置”。

### Implementation

- [x] **T033** [P] [US9] 在 `lib/ai/presets.ts` 定义 OpenCode Go experimental preset：Base URL `https://opencode.ai/zen/go/v1`、model `deepseek-v4.1-flash`、`experimental=true`、`autoFallback=false`；手动启用时生成稳定 `x-opencode-session` 并发送 `PartyNight/<version>` 专用 User-Agent；UI/README 明确官方主要面向 coding agents。
- [x] **T034** [P] [US9] 在 `lib/ai/presets.ts` 定义 DeepSeek Official preset：Base URL `https://api.deepseek.com`、model `deepseek-flash`、`isDefault=true`；实现 Custom OpenAI Compatible profile。
- [x] **T035** [US9] 明确禁止注册 OpenCode 免费 Zen；为 provider registry 加 assertion/test，防止后续误加为默认/fallback。
- [x] **T036** [P] [US9] 扩展 IndexedDB schema：`aiProviderProfiles`、`aiSecrets`（仅 ciphertext/IV/version）、`aiCryptoKeys`（non-extractable CryptoKey）；创建 `lib/storage/ai-provider-repository.ts` 与 `lib/security/ai-secret-crypto.ts`；禁止任何明文 Key 落盘。
- [x] **T037** [P] [US9] 创建 `components/ai/ProviderSelector.tsx`、`SecretInput.tsx`、`ConnectionStatus.tsx`；Key 默认掩码，显示动作不得写日志。
- [x] **T038** [US9] 按 `设计资产/方案 A 丨 AI 设置与密钥安全交互原型.png` 实现 `app/settings/ai/page.tsx`：DeepSeek 默认、OpenCode Go 实验性标签与说明、Custom、高可读 API Key 输入、显示/隐藏、测试连接、保存状态。
- [x] **T039** [US9] 实现 `/api/test-provider`：request-scoped Key、`Cache-Control: no-store`、最小测试请求、脱敏错误，不持久化 Key；Custom Provider 先通过 server-side SSRF guard。
- [x] **T040** [US9] 修改 `/api/generate-session` 请求契约：客户端 just-in-time 解密当前 Key 后临时携带；服务端校验 Provider/URL 后转发。DeepSeek 使用 JSON Output；OpenCode Go 只有 explicit experimental 选择时才允许，且不得进入自动 fallback。
- [x] **T041** [P] [US9] 实现 `lib/ai/redaction.ts` 和 server error wrapper，对 `Authorization`、`apiKey`、Bearer token 做统一脱敏。
- [x] **T042** [P] [US9] 配置严格 CSP/安全 headers，V1 不加载非必要第三方脚本/analytics；实现 `lib/security/ssrf-guard.ts`：Custom Provider 仅 HTTPS（localhost dev 例外），解析 A/AAAA 后拒绝 localhost、RFC1918、link-local、multicast、metadata/非公网地址，HTTP client 禁止自动跨主机 redirect。
- [x] **T043** [US9] 在 AI 设置页建立独立 **Danger Zone**，新增 `--color-danger` tokens；红色垃圾桶/危险图标 + 红色文字/边框，与普通“显示/测试/保存”操作分区，删除按钮不得放进 Key 输入框 icon row。
- [x] **T044** [US9] 实现 `ConfirmClearSecretModal`：首次点击只开 modal；默认/返回/外部关闭走 cancel；红色“确认清空”才允许触发 delete。
- [x] **T045** [US9] 实现 `clearApiKey(providerId)` 完成态：删除后重新读取验证为空，Provider 状态变 `unconfigured`，显示“API 密钥已清空”，保留重新填写/切换 Provider 入口。
- [x] **T046** [US9] AI 未配置/Key 被清空时，生成页提供“去配置 AI / 切换 Provider / 使用本地题库开始”，不得卡死。

**Checkpoint**：不接触 `.env` 即可在手机 UI 配好 DeepSeek；OpenCode Go 仅实验性手动启用；持久化 Key 无明文落盘；误触一次绝不会清掉 Key。

## Phase 4: User Story 1 — 20 秒内组局并开始今晚一局 (Priority: P1)

**Goal**：完成首页 + 组局向导，建立 SessionConfig。

**Independent Test**：从首页“今晚开局”进入，选择人数/玩家、关系、氛围、强度、雷区，创建 generating Session。

### Tests

- [x] **T047** [P] [US1] 编写组局 config reducer/schema 单元测试，`tests/unit/session-config.test.ts`。
- [x] **T048** [P] [US1] 编写首页→组局→雷区 E2E 骨架，`tests/e2e/setup-flow.spec.ts`。

### Implementation

- [x] **T049** [P] [US1] 按方案 A 实现首页 `app/page.tsx`：今晚开局、4 个模式、我的游戏包。
- [x] **T050** [P] [US1] 实现 `components/party/PlayerPicker.tsx` 与最近玩家选择，接 `players` repository。
- [x] **T051** [P] [US1] 实现 `components/party/RelationshipSelector.tsx`、`VibeSelector.tsx`、`IntensitySelector.tsx`。
- [x] **T052** [US1] 实现 `app/setup/page.tsx`，组装人数/玩家、关系、氛围、强度并保存临时配置。
- [x] **T053** [P] [US1] 实现 `components/party/BoundaryList.tsx` 与自定义雷区输入。
- [x] **T054** [US1] 实现 `app/boundaries/page.tsx`；提交时创建 status=`generating` 的 GameSession 并进入生成页。
- [x] **T055** [US1] 将最近玩家、上次关系/氛围/强度/边界写入 `preferences-repository.ts` 并在下次组局预填。
- [x] **T056** [US1] 完成 `tests/e2e/setup-flow.spec.ts`，验证无注册、最小输入也可进入生成状态。

**Checkpoint**：用户可以在不接 AI 的情况下完成完整组局配置并得到合法 SessionConfig。

## Phase 5: User Story 2 — AI 一次生成整局并离线继续玩 (Priority: P1)

**Goal**：实现服务端 AI Proxy、Deck pipeline、fallback 与生成等待页。

**Independent Test**：Mock AI 生成成功后关闭网络，Deck 仍存在且 Engine 可连续选择卡片。

### Tests

- [x] **T057** [P] [US2] 编写 AI JSON schema/invalid payload tests，`tests/unit/ai-card-schema.test.ts`。
- [x] **T058** [P] [US2] 编写 boundaries + dedupe pipeline tests，`tests/unit/ai-pipeline.test.ts`。
- [x] **T059** [P] [US2] 编写 AI failure → local seeds fallback integration test，`tests/integration/generation-fallback.test.ts`。

### Implementation

- [x] **T060** [P] [US2] 实现 `lib/ai/prompt-builder.ts`，输入 SessionConfig、目标数量和 Pack definitions，明确要求 **json** 并附 JSON schema/example；为 DeepSeek JSON Output 设置合理 max_tokens，避免整局 JSON 截断。
- [x] **T061** [US2] 实现 `app/api/generate-session/route.ts`：读取 request-scoped Provider/Profile 与 Authorization secret，设置超时、`no-store` 和安全脱敏错误响应；DeepSeek Official 默认带 `response_format: {"type":"json_object"}`；空 content/截断/非法 JSON 仅自动重试 1 次，再进入本地 fallback；`.env` 仅显式开发 fallback。
- [x] **T062** [US2] 实现 generation orchestration service `lib/ai/generate-deck.ts`：parse → normalize → filter → dedupe → distribution check → fallback。
- [x] **T063** [P] [US2] 为 4 个内置 Pack 准备基础本地 seed cards，存放 `lib/game-packs/built-in-seeds/`，确保 AI 不可用仍能开始基础游戏。
- [x] **T064** [US2] 实现 `app/generating/page.tsx`，按方案 A 显示生成步骤、进度/状态和可恢复错误 UI。
- [x] **T065** [US2] 生成成功后将 Deck snapshot 写入 `session-repository.ts`，status 改为 active 并导航至 `/game`。
- [x] **T066** [US2] 生成失败时实现“重试一次 / 使用本地题库开始”路径，不允许无限 loading。
- [x] **T067** [US2] 完成 offline integration/E2E test：Deck 保存后模拟网络离线仍可进入游戏并抽取卡。

**Checkpoint**：AI 是增强能力，不再是每轮运行依赖；断网不阻断已生成 Session。

## Phase 6: User Story 3 — 混合模式自动主持整场游戏 (Priority: P1)

**Goal**：落地 4 个 Game Pack 和统一游戏主界面。

**Independent Test**：20 轮混合 Session 中能出现多个 Pack；无重复卡；玩家选择符合公平规则。

### Tests

- [x] **T068** [P] [US3] 为 4 个 Game Pack registry definitions 编写 contract test，`tests/unit/game-pack-registry.test.ts`。
- [x] **T069** [P] [US3] 编写 mixed selection/stage tests，`tests/unit/mixed-session.test.ts`。
- [x] **T070** [P] [US3] 编写 player fairness deterministic tests，扩展 `tests/unit/player-selector.test.ts`。

### Implementation

- [x] **T071** [P] [US3] 实现 `lib/game-packs/truth-or-dare.ts`，定义 truth/dare card types 与 player requirements。
- [x] **T072** [P] [US3] 实现 `lib/game-packs/most-likely.ts`。
- [x] **T073** [P] [US3] 实现 `lib/game-packs/never-have-i-ever.ts`。
- [x] **T074** [P] [US3] 实现 `lib/game-packs/ai-improv.ts`，允许 content 引用当前玩家/Session context，但运行时仍使用预生成 card snapshot。
- [x] **T075** [US3] 将 4 个 Pack 注册进 `lib/game-packs/registry.ts` 并配置 mixed weights/capabilities。
- [x] **T076** [P] [US3] 实现 `components/game/GameCardView.tsx`，按 card type 渲染统一框架并保持方案 A 卡片视觉。
- [x] **T077** [P] [US3] 实现 `components/game/RoundHeader.tsx`、`RoundActions.tsx`（完成/换一个/跳过）。
- [x] **T078** [US3] 实现 `app/game/page.tsx`：读取 active Session、创建 round、选择 Pack/card/player、执行动作、保存 history。
- [x] **T079** [US3] 实现可快速完成/跳过的轻量转盘/倒计时/翻牌动画；prefers-reduced-motion 时降低动画。
- [x] **T080** [US3] 完成 20-round integration test，验证 no duplicate、pack mix、fairness、round persistence。

**Checkpoint**：完整混合游戏可玩，且 Engine/Pack/UI 分层没有互相写死。

## Phase 7: User Story 4 — 尺度、雷区与局中控制 (Priority: P1)

**Goal**：确保用户边界在生成阶段和运行阶段均生效，支持局中调节。

**Independent Test**：开启身体接触/喝酒雷区，调节 intensity，连续运行，禁用内容始终不出现。

### Tests

- [x] **T081** [P] [US4] 建立 boundary tag matrix tests，`tests/unit/boundary-matrix.test.ts`。
- [x] **T082** [P] [US4] 编写 intensity change invalidates future candidate test，`tests/unit/intensity-update.test.ts`。
- [x] **T083** [P] [US4] E2E 测试“跳过无惩罚 + 局中调节”，`tests/e2e/in-game-controls.spec.ts`。

### Implementation

- [x] **T084** [US4] 在 `session-engine.ts` 增加 updateIntensity/updateBoundaries（如果允许局中改边界）并确保 selector 每轮读取当前值。
- [x] **T085** [P] [US4] 实现局中设置 sheet/modal `components/game/InGameSettings.tsx`，包含太温和/刚刚好/有点过了或 slider。
- [x] **T086** [US4] 确保 `skipRound` 只记录 status=`skipped` 并进入下一轮，不触发 penalty callback 或隐式惩罚。
- [x] **T087** [US4] 当强度下调时，不删除 Deck 快照，但 card selector 必须过滤掉高于当前强度的未用 cards。
- [x] **T088** [US4] 完成边界 E2E/单测并修复所有冲突项。

**Checkpoint**：边界规则是 Engine hard constraint，不依赖用户“自己注意”。

## Phase 8: User Story 5 — 单模式快速开始 (Priority: P2)

**Goal**：首页任何一个首发 Pack 都能以最小配置快速开局。

**Independent Test**：有历史偏好时，从点击“谁最可能”到第一题无需完整重新走向导。

- [x] **T089** [P] [US5] 设计 `QuickStartConfig` 派生逻辑与测试，`lib/engine/quick-start.ts`、`tests/unit/quick-start.test.ts`。
- [x] **T090** [US5] 首页模式卡支持 `?pack=` 或等价状态进入 quick-start flow，更新 `app/page.tsx`。
- [x] **T091** [US5] 若历史配置完整，提供“使用上次设置”并直接生成/本地启动；若缺失则只询问必要字段。
- [x] **T092** [US5] 确保单模式 Session 的 `enabledPackIds` 仅含目标 Pack，Engine 不混入其他玩法。
- [x] **T093** [US5] 编写 `tests/e2e/quick-start.spec.ts` 覆盖首次与复用配置两种路径。

## Phase 9: User Story 6 — 自定义游戏包与题卡 (Priority: P2)

**Goal**：用户可以长期积累属于自己的本地玩法内容。

**Independent Test**：创建 Pack + 3 cards → 启用 → 新 Session 中可抽取。

- [x] **T094** [P] [US6] 定义 custom GamePack/GameCard Zod schema 与版本字段，扩展 `lib/domain/schemas.ts`。
- [x] **T095** [P] [US6] 完成 custom pack repository CRUD tests，`tests/unit/game-pack-repository.test.ts`。
- [x] **T096** [US6] 实现 `app/packs/page.tsx`，列出内置/自定义 Pack、启用状态和新增入口。
- [x] **T097** [US6] 实现 `app/packs/[packId]/page.tsx`，支持 Pack 名称、图标、卡片新增/编辑/删除。
- [x] **T098** [US6] 将启用的 custom packs 动态合并到 registry runtime view，但不修改内置 source files。
- [x] **T099** [US6] Session 创建时对 custom cards 做 snapshot，保证后续编辑不改写当前 Session。
- [x] **T100** [US6] 编写 custom pack E2E，`tests/e2e/custom-pack.spec.ts`。

## Phase 10: User Story 7 — Session 暂停/恢复/动态玩家 (Priority: P2)

**Goal**：真实聚会中断不会导致重开整局。

**Independent Test**：5 轮后刷新恢复；添加/暂离玩家后继续游戏。

- [x] **T101** [P] [US7] 编写 session repository round-trip + corrupted record tests，`tests/unit/session-repository.test.ts`。
- [x] **T102** [US7] App 启动时实现 unfinished Session detection，创建 `components/game/ResumeSessionPrompt.tsx` 并接入 `app/page.tsx`。
- [x] **T103** [US7] 在每个重要状态迁移后 autosave，统一通过 `session-repository.ts`，避免页面自行拼存储逻辑。
- [x] **T104** [P] [US7] 实现 `components/game/PlayerManager.tsx`：新增、暂离、恢复。
- [x] **T105** [US7] Engine player selector 仅从 `active=true` 玩家中抽取，历史记录保留离场玩家。
- [x] **T106** [US7] 实现 corrupted session 隔离与安全回首页逻辑，禁止白屏。
- [x] **T107** [US7] 编写刷新恢复 + 动态玩家 E2E，`tests/e2e/session-recovery.spec.ts`。

## Phase 11: User Story 8 — 结束总结 (Priority: P3)

**Goal**：形成轻量闭环，不扩展为数据分析产品。

**Independent Test**：结束一个有多种 Pack 的 Session，统计与 rounds 精确一致。

- [x] **T108** [P] [US8] 编写 summary calculator 与测试，`lib/engine/session-summary.ts`、`tests/unit/session-summary.test.ts`。
- [x] **T109** [US8] 实现 `app/summary/page.tsx`，按方案 A 展示总轮次、时长、玩家数、模式分布。
- [x] **T110** [US8] finishSession 时写轻量 `sessionSummaries`，当前 Session 标记 finished。
- [x] **T111** [US8] 实现“再来一局”：复用 config，生成新 Session ID，清空 deck/history/usedCardIds。
- [x] **T112** [US8] 编写 summary/replay E2E，`tests/e2e/summary.spec.ts`。

## Phase 12: PWA, Visual Fidelity & Cross-Cutting Polish

**Purpose**：把功能实现收敛为可安装、可靠、与方案 A 一致的 V1。

- [x] **T113** [P] 实现 `app/manifest.ts`，生成/接入完整 icon sizes，确保主图标来自方案 A 图标规范。
- [x] **T114** 实现 Service Worker/App shell offline cache，确保 AI endpoint 不被错误缓存；静态资源和 seed deck 可离线。
- [x] **T115** [P] 按方案 A 对**首页、组局设置、雷区、生成、游戏、总结、AI 设置/密钥安全**7 类页面逐屏视觉比对；AI 设置页必须对照新增原型检查 Provider 层级、experimental 标签、连接状态、Danger Zone、二次确认、清空成功/未配置状态。统一 spacing、glow、radius、font scale。
- [x] **T116** [P] 完成可访问性基础检查：按钮语义、focus、触控面积、关键状态文字化、reduced motion。
- [x] **T117** [P] 优化移动端布局：至少覆盖 360px、390px、430px 宽度和常见刘海安全区。
- [x] **T118** 检查 bundle 与 runtime，移除未使用依赖，保证游戏轮次不因动画/大图明显卡顿。
- [x] **T119** [P] 完成 README：本地开发、App 内 AI Provider/API Key 配置、可选开发 env fallback、Docker、PWA 安装、数据清除/备份说明，写入 `README.md`。
- [x] **T120** 运行全部 `lint/typecheck/unit/integration/e2e/build`，修复所有阻断问题。
- [x] **T121** 使用生产 build 进行移动端手工 smoke：首次开局、DeepSeek 默认 AI、OpenCode Go 实验性手动入口、encrypted secret、Danger Zone 防误触、Custom SSRF guard、AI fallback、离线、恢复、自定义 Pack、结束总结。
- [x] **T122** 实现完成后执行第二轮 SPEC/PLAN/TASKS 一致性审查；若使用 Spec Kit，再运行一次 `/speckit.analyze` 作为额外复核并处理任何新发现。**注意：真正的实现前 Analyze 已在本文件顶部 Pre-Implementation Quality Gate 完成。**
- [x] **T123** 执行 implement 后的 convergence：核对 FR-001–FR-058、SC-001–SC-013；若使用 Spec Kit，重复 `/speckit.converge` → implement，直到 Converged。

## Dependencies & Execution Order

### Phase Dependencies

```text
Phase 1 Setup
   ↓
Phase 2 Foundational
   ↓
Phase 3 AI Provider & Secret Safety (US9)
   ↓
┌────────────── P1 ──────────────┐
US1 Setup → US2 Generation → US3 Gameplay → US4 Boundaries
└────────────────────────────────┘
   ↓
┌────────────── P2 ───────────────────────────┐
US5 Quick Start | US6 Custom Packs | US7 Recovery
└──────────────────────────────────────────────┘
   ↓
US8 Summary (P3)
   ↓
PWA / Visual / Polish / Post-Implement Analyze / Converge
```

### User Story Dependencies

- **US9**：依赖 Phase 2 的 schema/storage/AI adapter；必须在真实 AI generation E2E 前完成。
- **US1**：只依赖 Phase 2。
- **US2**：依赖 US1 能产出 SessionConfig；AI pipeline 本身可提前并行开发。
- **US3**：依赖 Engine foundation + US2 的 Deck，内置 Pack definitions 可与 US2 并行。
- **US4**：依赖 US3 游戏主循环，但 filter 单测可提前。
- **US5**：依赖 US1/US2/US3；只是另一条入口。
- **US6**：依赖 registry + storage；与 US5 可并行。
- **US7**：依赖 Session engine/repository；与 US5/US6 可并行。
- **US8**：依赖 RoundHistory 稳定。

## Parallel Execution Examples

### Example A — Foundational

可以并行：

- T014–T015 存储
- T020–T022 AI schema/filter
- T023–T025 UI 原子组件

前提：T011 domain schema 与接口命名先冻结。

### Example B — 首发 Game Packs

T071、T072、T073、T074 可以并行；T075 在四者完成后统一注册。

### Example C — P2

US5、US6、US7 可由不同执行者并行推进，因为主要修改不同页面/模块；合并前统一跑 Session integration tests。

## Implementation Strategy

### MVP Gate（内部检查点，不要求停工等待）

当 T001–T088 完成时（其中包含 US9 AI Provider/Secret Safety），形成真正可玩的核心 V1：

- 完整组局
- AI 整局生成 + 本地 fallback
- 4 个 Game Pack
- 混合主持
- 雷区/强度
- 游戏主界面

该 Gate 用于自动检查，不代表需要中断开发；若开发编排器采用连续执行，可继续完成 P2/P3 与 Polish，最后再进行 Human Gate。

### V1 Human Gate

T001–T123 全部完成、自动测试通过、交叉一致性检查完成后，再进行一次人工验收：

1. 视觉是否达到方案 A。
2. 手机现场操作是否够快。
3. AI 内容是否好玩且边界可控。
4. 离线/刷新是否真的不丢局。
5. 自定义 Pack 是否方便长期使用。
6. DeepSeek 是否默认可配置/测试/加密保存；OpenCode Go 是否只以“实验性、手动启用”存在且无自动 fallback。
7. API Key 是否无明文落盘；安全持久化不可用时是否正确退化为 session-only。
8. API Key 清空是否与普通操作显著分离，并确保误触一次绝不删除。
9. Custom Provider 的 SSRF 防护是否在服务器端生效。
10. AI 设置页是否与新增方案 A 原型逐状态一致。

## Requirements Traceability Matrix

| Requirement Group | User Story | Main Tasks | Verification |
|---|---|---|---|
| FR-001–003 App入口/无账号 | US1/US5/US6 | T049, T090, T096 | setup/quick/custom E2E |
| FR-004–009 组局配置 | US1 | T050–T055 | T047/T056 |
| FR-010–016 AI Deck | US2 | T060–T067 | T057–T059/T067 |
| FR-017–023 Engine | US3/US4 | T016–T019, T075–T080, T084–T088 | selector/mixed tests |
| FR-024–029 Game Packs | US3/US6 | T071–T075, T094–T100 | registry/custom tests |
| FR-030–035 游戏交互 | US3/US4/US7 | T077–T079, T085–T086, T104–T105 | in-game E2E |
| FR-036–039 恢复 | US7 | T101–T107 | recovery tests |
| FR-040–042 自定义 Pack | US6 | T094–T100 | custom E2E |
| FR-043–044 总结 | US8 | T108–T112 | summary E2E |
| FR-045–048 视觉/PWA | Cross-cutting | T006–T007, T023–T025, T113–T117 | visual smoke/PWA |
| FR-049–058 AI Provider/Secret | US9 | T027–T046 | provider/secret unit + AI settings/danger-zone E2E |

## Cross-Document Consistency Review（已完成）

本轮在输出前已按当前 `/speckit.analyze` 规则手工做跨文档检查；**真正进入仓库实现前仍必须执行 Pre-Implementation Analyze Gate**：

### 已发现并解决的潜在冲突

1. **原始想法“App/小程序/H5待定” vs 当前实现形态**  
   已冻结为 **PWA**。理由：个人自用、单设备、最少维护；SPEC 明确原生 App 不在 V1。

2. **原始想法“小尺度/大尺度” vs 后续 1–5 强度**  
   已统一为 **1–5 强度**，所有文档一致，不再保留二档模型。

3. **“AI 即兴”是否每轮实时生成**  
   已统一为 **开局整局预生成**；AI 即兴的内容可以引用 Session Context，但仍作为 Deck snapshot 运行，避免每轮等待。

4. **多人同步是否需要**  
   已明确 **V1 不做**。单机传递为唯一基线。

5. **Supabase 是否需要**  
   已明确 **V1 不需要**；本地 IndexedDB 足够，PLAN/TASKS 不创建云 DB。

6. **方案 A 设计稿中的个别生成式文字与真实功能可能不完全一致**  
   已规定：**视觉以方案 A 为准，功能文案/行为以 SPEC 为准**，避免开发者照抄视觉稿中的错字或示例数据。

7. **“自定义内容”在前期讨论中容易被忽略**  
   已补为 US6、FR-040–042，并加入 Pack CRUD/Snapshot tasks，避免 V1 与最初设想不一致。

8. **强度 5 与安全边界的潜在冲突**  
   已统一定义为“允许边界内高能”，BoundaryProfile 永远高于 Stage/Intensity。

9. **Session 恢复与 Game Pack 编辑冲突**  
   已采用 **Session Deck snapshot**，当前局不受后续 Pack 编辑影响。

10. **原 `.env` 主配置 vs App 内本地填 Key**：已统一为 App 内 Provider/Key 为正常路径；`.env` 仅开发 fallback。
11. **OpenCode Go 官方使用边界**：不再作为普通默认 Provider；改为 experimental/manual-only/no-auto-fallback，并显示 coding-agent 使用边界说明。
12. **浏览器明文 Secret 风险**：不再要求明文 IndexedDB；改 AES-GCM ciphertext + non-extractable CryptoKey，无法安全持久化时 session-only。
13. **Custom Provider SSRF**：从“基础 URL 校验”升级为 server-side DNS/IP/redirect guard。
14. **危险清空误触**：SPEC 定义二次确认；PLAN 定义 Danger Zone/secret lifecycle；TASKS 增加 unit + E2E，三层一致。
15. **AI 设置原型缺口**：新增 `方案 A 丨 AI 设置与密钥安全交互原型.png`，并纳入 7 类核心页面视觉验收。
16. **Spec Kit Analyze 时序**：新增 Implement 前强制 Analyze Gate；实现后 T122 再复核一次。

### 最终检查结论

- Constitution → SPEC：**PASS**
- SPEC → PLAN：**PASS**
- PLAN → TASKS：**PASS**
- FR → Tasks 覆盖：**PASS（FR-001–FR-058 均有实现与验证路径）**
- UI/原型 → 功能范围：**PASS（以方案 A 为视觉基线，SPEC 为行为真源）**
- V1 范围控制：**PASS（无账号、支付、多人实时、云数据库等越界项）**

**结论：V1.2 为 Freeze Candidate。进入代码实现前必须先通过 Pre-Implementation Analyze Gate；Analyze clean 后即可作为开发冻结基线。**
