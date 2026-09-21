# Implementation Plan: Party Night V1

**Branch**: `001-party-night-v1` | **Date**: 2026-09-20 | **Spec**: `./2026-09-20 丨 通用 丨 ChatGPT 丨 Party Night 聚会游戏工具-SPEC交接上下文 丨 V1.2.md`  
**Input**: Party Night V1 feature specification + Constitution 1.2.0 + 方案 A UI/原型资产

## 1. Summary

V1 实现一个**移动优先、可安装的 PWA**。应用采用单仓库 Next.js 架构：浏览器负责 UI、Party Game Engine 与 IndexedDB 本地数据；服务端仅提供 AI Proxy/Route Handler，保护 API Key 并把组局配置转换为结构化 Deck。

关键技术策略：

1. **一次生成整局**：开局阶段生成 30–50 张候选题卡，Schema 校验 → 雷区过滤 → 去重 → 本地持久化；游戏过程中不逐轮请求 AI。
2. **Engine 与 Game Pack 解耦**：所有玩法共享玩家、Session、随机、强度、存储与安全机制。
3. **Local-first**：IndexedDB 保存自定义 Game Pack、偏好和当前 Session；不使用账号/云数据库。
4. **AI 可替换**：通过 OpenAI-compatible provider adapter（或等价适配层）调用模型，Provider 通过 App 内本地 AI 设置选择；**DeepSeek 官方为默认**；OpenCode Go 作为**实验性手动 Provider**；另支持自定义 OpenAI Compatible。API Key 若跨重启保存，先使用 Web Crypto AES-GCM 加密后写入本机，再按请求临时解密并送入同源 Proxy。
5. **失败可玩**：AI 失败时回退本地 seed decks；游戏不会因 Provider 不可用而完全失效。
6. **视觉唯一基线**：方案 A｜霓虹夜店风，建立 Design Tokens 后再实现页面，禁止将效果图当整屏位图。

## 2. Technical Context

**Language/Version**: TypeScript 5.x；Node.js **24.x LTS**  
**Framework**: Next.js **16.3.3 Active LTS**（App Router）+ React 19  
**Styling**: Tailwind CSS 4.x + CSS Custom Properties（Design Tokens）；必要动画使用 CSS/WAAPI，避免重型动画依赖  
**Validation**: Zod（AI JSON、导入数据、持久化对象）  
**Local Storage**: IndexedDB（`idb` 轻量封装）；仅极少量非关键 UI 偏好可用 localStorage。API Key 不允许明文进入任一本地 store；持久化 Secret 使用 Web Crypto AES-GCM + non-extractable CryptoKey；不支持时 session-only  
**State**: React Context + `useReducer` / domain services；不额外引入全局状态框架，除非实现时出现明确复杂度需求  
**AI**: Next.js Route Handler `/api/generate-session` + `/api/test-provider` + provider adapter；Provider/Profile/Key 由 App 内本地设置管理。**DeepSeek 官方（`https://api.deepseek.com`, `deepseek-flash`）为默认**；OpenCode Go（`https://opencode.ai/zen/go/v1`, `deepseek-v4.1-flash`）标记 experimental/manual-only；Custom OpenAI Compatible 为高级入口；`.env` 仅允许作为开发测试 fallback，不作为正常用户配置路径  
**Testing**: Vitest + Testing Library + Playwright  
**Target Platform**: iOS/Android 现代浏览器与 PWA；桌面浏览器作为辅助  
**Project Type**: 单仓库 Full-stack Web/PWA（前端为主，单个轻量服务端 AI Route）  
**Deployment**: Docker 可部署；个人自用推荐放在可信私有网络/HTTPS 环境。V1 不依赖特定云厂商  
**Performance Goals**: 已生成 Deck 后换题/下一轮本地响应 <100ms；核心动画目标 60fps；普通移动网络下首屏尽量 <2.5s 可交互  
**Constraints**: zero-account、single-device、local-first、暗光高可读性、AI 仅在生成阶段为核心依赖  
**Scale/Scope**: 单用户个人使用；4 个内置 Game Pack；约 9 类核心页面；单 Session 30–50+ cards；本地历史以轻量摘要为主

> 版本核验基线（2026-09-20）：Next.js 官方 2026-08 安全公告要求 Active LTS 16.3.3；Node.js 官方当前将 24.x/22.x 标记为 LTS。开发时允许安装相同 major 的最新安全 patch，但不得降到已知存在高危漏洞的 patch。

## 3. Constitution Check

| Gate | Result | Plan Evidence |
|---|---|---|
| Zero-account / local-first | PASS | 无 auth、无云 DB；IndexedDB 为主存储 |
| Deck 生成后可本地继续 | PASS | 整局预生成并写入 SessionDeck |
| Engine / Game Pack 解耦 | PASS | `lib/engine` 与 `game-packs` 分离 |
| 雷区 / 强度 / 无惩罚跳过 | PASS | filter pipeline + gameplay actions |
| Session 恢复 / AI 回退 | PASS | IndexedDB autosave + seed deck fallback |
| 方案 A 视觉一致 | PASS | design tokens + reusable components + 5 份资产 |
| FR → Story → Task → Test 可追踪 | PASS | TASKS 按 User Story 分组，测试显式标注 |
| AI Provider/Secret local-only | PASS | Profile 本地；Key 仅以 AES-GCM 密文持久化，或 session-only；Proxy request-scoped，不持久化 |
| Destructive secret deletion safety | PASS | Danger Zone + 红色隔离 + 二次确认 + 自动化测试 |
| 无不必要复杂系统 | PASS | 无账号、实时同步、Supabase、远程分析 |

**Pre-Phase 0 Gate**: PASS  
**Post-design Gate**: PASS（本 PLAN 已按 Constitution 复核，无需 Complexity Tracking 例外）

## 4. Architecture

```text
┌──────────────────────────────────────────────┐
│                 Mobile PWA                   │
│                                              │
│  UI Screens / Components                    │
│         │                                    │
│         ▼                                    │
│  Party Game Engine                          │
│  ├─ Session state                           │
│  ├─ Player selection                        │
│  ├─ Card selection / dedupe                 │
│  ├─ Stage / intensity                       │
│  └─ Game Pack registry                      │
│         │                    │               │
│         ▼                    ▼               │
│  IndexedDB Repository      Built-in Packs   │
│  ├─ sessions               ├─ truth-dare    │
│  ├─ preferences            ├─ most-likely   │
│  ├─ players                ├─ never-have    │
│  ├─ custom-packs           └─ ai-improv     │
│  └─ ai-provider-profiles / local API keys   │
└───────────────┬──────────────────────────────┘
                │ generate/test request only
                │ provider config + request-scoped key
                ▼
 Next.js /api/generate-session | /api/test-provider
                │  (no server persistence/logging)
                ▼
         Provider Adapter
        ├─ DeepSeek Official (default)
        ├─ OpenCode Go (experimental/manual)
        └─ Custom OpenAI Compatible
                │
                ▼
              LLM
```

### Architecture Rules

- UI 不直接操作 IndexedDB；通过 repository/service。
- UI 不包含随机/过滤/强度业务逻辑；通过 Engine API。
- Game Pack 不直接知道 React 页面；只暴露 definition/rules/render hints。
- AI Provider 不返回可直接信任的运行时对象；必须经 Zod Schema + normalization。
- 当前 Session 使用 Deck 快照；Game Pack 编辑不会修改已开始 Session。
- API Key 不进入 `GameSession`、Redux/全局普通 state、URL、错误对象持久化或日志；持久化时只保存 AES-GCM ciphertext/IV，由专用 secret service 按请求短暂解密。
- Proxy 不保存 Key；转发前后必须 redaction，禁止打印 request headers/body 中的 secret。
- OpenCode 免费 Zen 不在 provider registry 中；Go URL 含 `/zen/go/` 只是官方 Go 路径。
- DeepSeek Official 是唯一默认 Provider；OpenCode Go 必须标记 `experimental: true`、`autoFallback: false`，且需要用户显式选择。
- Custom Provider 的网络请求必须经过 server-side SSRF guard；客户端校验不能替代服务端验证。

## 5. Project Structure

```text
party-night/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                         # 首页
│   ├── setup/page.tsx                   # 组局设置
│   ├── boundaries/page.tsx              # 雷区设置
│   ├── generating/page.tsx              # 生成等待
│   ├── game/page.tsx                    # 游戏主界面
│   ├── summary/page.tsx                 # 结束总结
│   ├── packs/page.tsx                   # 我的游戏包
│   ├── packs/[packId]/page.tsx          # 自定义 Pack 编辑
│   ├── settings/ai/page.tsx              # AI Provider / API Key 设置
│   ├── globals.css
│   ├── manifest.ts
│   └── api/
│       ├── generate-session/route.ts
│       └── test-provider/route.ts
├── components/
│   ├── ui/                              # Button/Card/Tag/Toggle/Slider/Modal
│   ├── party/                           # PlayerPicker/Intensity/BoundaryList
│   ├── game/                            # GameCard/GameActions/RoundHeader
│   └── brand/                           # Logo/NeonBackground/Icon assets
├── lib/
│   ├── engine/
│   │   ├── session-engine.ts
│   │   ├── card-selector.ts
│   │   ├── player-selector.ts
│   │   ├── stage-controller.ts
│   │   └── types.ts
│   ├── game-packs/
│   │   ├── registry.ts
│   │   ├── truth-or-dare.ts
│   │   ├── most-likely.ts
│   │   ├── never-have-i-ever.ts
│   │   ├── ai-improv.ts
│   │   └── built-in-seeds/
│   ├── ai/
│   │   ├── provider.ts
│   │   ├── presets.ts
│   │   ├── request-secret.ts
│   │   ├── redaction.ts
│   │   ├── prompt-builder.ts
│   │   ├── card-schema.ts
│   │   ├── normalize.ts
│   │   └── safety-filter.ts
│   ├── storage/
│   │   ├── db.ts
│   │   ├── session-repository.ts
│   │   ├── preferences-repository.ts
│   │   ├── game-pack-repository.ts
│   │   └── ai-provider-repository.ts
│   ├── domain/
│   │   ├── schemas.ts
│   │   └── constants.ts
│   └── utils/
├── public/
│   ├── icons/
│   ├── brand/
│   └── sw.js / generated service worker
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── Dockerfile
├── next.config.ts
├── package.json
└── README.md
```

**Structure Decision**：采用单 Next.js 项目。AI 代理仅由少量 Route Handler 组成，不拆 backend 子项目，因为当前只有单用户、轻量 AI 接口需求；拆分服务会违反“避免不必要复杂度”的 Constitution。

## 6. Data Model

### 6.1 Player

```ts
interface Player {
  id: string;
  displayName: string;
  active: boolean;
  createdAt: string;
  lastUsedAt: string;
}
```

### 6.2 BoundaryProfile

```ts
interface BoundaryProfile {
  noPhysicalContact: boolean;
  noAlcoholPenalty: boolean;
  noExPartners: boolean;
  noSexualHistory: boolean;
  noMoneyIncome: boolean;
  noPhonePrivacy: boolean;
  noPublicPosting: boolean;
  noStrangerContact: boolean;
  noPhotoVideo: boolean;
  noSocialAccounts: boolean;
  customText: string;
}
```

### 6.3 GameCard

```ts
type GameCardSource = 'builtin' | 'ai' | 'custom';

type GameCardStatusTag =
  | 'physical-contact'
  | 'alcohol'
  | 'ex-partner'
  | 'sexual-history'
  | 'money'
  | 'phone-privacy'
  | 'public-posting'
  | 'stranger-contact'
  | 'photo-video'
  | 'social-account';

interface GameCard {
  id: string;
  packId: string;
  type: string;
  content: string;
  instruction?: string;
  intensity: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  boundaryTags: GameCardStatusTag[];
  minPlayers: number;
  maxPlayers?: number;
  participantMode: 'none' | 'single' | 'pair' | 'all';
  source: GameCardSource;
}
```

### 6.4 GamePackDefinition

```ts
interface GamePackDefinition {
  id: string;
  name: string;
  icon: string;
  enabledByDefault: boolean;
  mixable: boolean;
  minPlayers: number;
  supportedCardTypes: string[];
}
```

### 6.5 GameSession

```ts
interface GameSession {
  schemaVersion: 1;
  id: string;
  status: 'generating' | 'active' | 'paused' | 'finished';
  mode: 'mixed' | 'single';
  config: SessionConfig;
  deckSnapshot: GameCard[];
  usedCardIds: string[];
  rounds: RoundHistory[];
  currentRound?: ActiveRound;
  startedAt?: string;
  endedAt?: string;
  updatedAt: string;
}
```

### 6.6 AIProviderProfile / AISecretRecord

```ts
type AIProviderType = 'opencode-go' | 'deepseek-official' | 'custom-openai';

interface AIProviderProfile {
  id: string;
  type: AIProviderType;
  name: string;
  baseUrl: string;
  modelId: string;
  protocol: 'openai-chat-completions';
  isDefault: boolean;
  experimental: boolean;
  autoFallback: boolean;
  updatedAt: string;
}

interface AISecretRecord {
  providerProfileId: string;
  ciphertext: ArrayBuffer;
  iv: Uint8Array;
  algorithm: 'AES-GCM';
  cryptoVersion: 1;
  updatedAt: string;
}

interface AICryptoKeyRecord {
  id: 'party-night-ai-secret-key-v1';
  key: CryptoKey; // non-extractable; never export to raw/base64
  createdAt: string;
}
```

Preset registry:

| Provider | Base URL | Default model | Notes |
|---|---|---|---|
| DeepSeek 官方 | `https://api.deepseek.com` | `deepseek-flash` | **默认**；Chat Completions；生成 Deck 默认启用 `response_format: {"type":"json_object"}` |
| OpenCode Go | `https://opencode.ai/zen/go/v1` | `deepseek-v4.1-flash` | **实验性 / 手动启用 / 不自动 fallback**；官方主要面向 coding agents；启用时发送稳定 `x-opencode-session` 与专用 User-Agent |
| Custom OpenAI Compatible | user input | user input | 高级入口；仅允许 HTTPS（localhost 开发例外）；服务器执行 SSRF guard |

**Explicit exclusion**：不注册 OpenCode 免费 Zen。OpenCode Go 也不得成为默认或自动 fallback。

## 7. Game Engine Design

### 7.1 Selection Pipeline

每一轮：

```text
Active Session
  ↓
可用 Game Packs（单模式固定 / 混合模式按阶段加权）
  ↓
候选 Card = 未使用 + 人数适配 + 强度适配 + 雷区通过
  ↓
按 stage / pack balance / recent history 加权
  ↓
选择 Card
  ↓
如需玩家：执行 player/pair fairness selector
  ↓
创建 ActiveRound
  ↓
持久化 Session
```

### 7.2 Player Fairness

V1 使用简单、可解释的受约束随机：

- 单人：从 active players 中选择“本局被选次数最少的一组”，再随机取一个；排除上一轮主玩家（如果人数允许）。
- 双人：优先选历史互动次数最低的 pair；如果候选并列再随机。
- 所有人：无需选择主玩家。
- 随机函数允许注入 seed/stub，便于单元测试。

### 7.3 Stage Controller

混合模式把 Session 粗略分为：

1. Warm-up：破冰、搞笑为主。
2. Flow：多玩法均衡。
3. Heat-up：在用户强度允许范围内提高 3–5 级卡片权重。

Stage 只影响权重，**不能**绕过 BoundaryProfile 和 max intensity。

## 8. AI Generation Pipeline

```text
SessionConfig + selected AIProviderProfile
  ↓
local secret repository 读取当前 Key（仅请求时）
  ↓
prompt-builder.ts
  ↓
/api/generate-session（request-scoped key；不记录）
  ↓
Provider Adapter
  ↓
JSON response
  ↓
Zod parse
  ↓
normalize
  ↓
safety-filter
  ↓
dedupe
  ↓
count / distribution check
  ↓
不足 → 一次补充生成 or builtin seed 补齐
  ↓
SessionDeck snapshot
```

### 8.1 Target Distribution（混合模式默认）

目标是“足够一晚使用”，不是硬编码比例。默认可从以下权重开始：

- 真心话大冒险：30%
- 谁最可能：25%
- 我从来没有：25%
- AI 即兴：20%

Stage Controller 可以在运行时调整抽取概率；Deck 中可以预先准备更多候选题卡而不是固定轮次顺序。

### 8.2 AI Output Contract

`POST /api/generate-session`

Request：ProviderProfile 放在 body；API Key 由 secret service **just-in-time 解密**后使用同源请求的 `Authorization: Bearer <LOCAL_KEY>` 临时发送，**不得放进 JSON、URL、持久化 state 或日志**。请求结束后释放引用；JavaScript 无法保证可靠内存擦除，因此不得声称可“安全清零”字符串。

```json
{
  "provider": {
    "type": "opencode-go",
    "baseUrl": "https://opencode.ai/zen/go/v1",
    "modelId": "deepseek-v4.1-flash"
  },
  "sessionConfig": {
    "playerCount": 6,
    "relationship": "friends",
    "vibes": ["funny", "flirty"],
    "intensity": 3,
    "boundaries": {},
    "enabledPackIds": ["truth-dare", "most-likely", "never-have", "ai-improv"]
  },
  "targetCardCount": 40
}
```

Response:

```json
{
  "cards": [],
  "meta": {
    "generatedCount": 40,
    "provider": "configured-provider"
  }
}
```

错误响应只暴露安全的错误码，不回传 secret/provider 原始敏感信息。

### 8.3 Provider Settings & Secret Lifecycle

正常使用路径不要求修改 `.env`：

```text
AI 模型设置
  ↓
默认选择 DeepSeek 官方；OpenCode Go 需用户显式选择“实验性”
  ↓
填写 API Key（默认掩码）
  ↓
POST /api/test-provider（临时携带 Key）
  ↓
保存 ProviderProfile
  ↓
若选择“保存到本机”：Web Crypto AES-GCM 加密 → IndexedDB 仅存 ciphertext + IV + non-extractable CryptoKey
若安全持久化不可用：session-only，不写明文
  ↓
生成 Session 时按当前 profile just-in-time 解密/读取 Key
  ↓
同源 Proxy 转发 → 上游 Provider
  ↓
请求结束即释放；服务端不持久化
```

服务端 Route Handler 必须：

- `Cache-Control: no-store`。
- 不打印 Authorization、apiKey 或完整 request body。
- 对异常对象做 redaction。
- Preset 只允许固定官方 host。
- Custom Provider：只允许 `https:`（localhost 开发例外）；服务端解析 DNS 的 A/AAAA 记录并拒绝 localhost、RFC1918、link-local、multicast、metadata 等非公网目标；HTTP client 默认 `redirect: manual`，不得自动跟随跨主机重定向；连接前后的目标验证都在服务端完成。
- 不把 API Key 写入 cookies/session/db/file/cache。

客户端必须：

- secret store 与普通 preference store 分离；store 中只能出现 ciphertext/IV/元数据，不得出现明文 Key。
- 输入框默认 `type=password`。
- “显示”仅改变当前 UI 可见性，不复制到其他 state/log。
- 页面卸载时释放临时明文 state 引用；不在 React 全局 Context/持久化 devtools state 中保存 Key。
- AES-GCM 使用随机 96-bit IV；同一 key 下不得重复 IV。
- non-extractable CryptoKey 若无法可靠持久化，则 UI 明确显示“本次会话使用”，绝不降级为明文持久化。
- CSP 禁止不必要第三方脚本；V1 不嵌入第三方 analytics。

### 8.4 API Key Clear UX（危险操作）

“清空 API 密钥”不是普通 icon action：

1. 放在页面下方独立 **Danger Zone**。
2. 使用 `--color-danger` 红色 token、红色垃圾桶/删除图标和明确文字。
3. 与“显示/测试连接/保存”至少一个独立 section 间隔，禁止把删除图标放在 API Key 输入框尾部或普通 icon row。
4. 第一次点击只设置 `confirmOpen=true`，repository **不得**执行 delete。
5. Modal 默认安全操作是“取消”；关闭 modal / 返回也等价取消。
6. 只有明确点击红色“确认清空”后调用 `clearApiKey(providerId)`。
7. 删除完成后重新读取 repository 验证为空，再显示 toast/status“API 密钥已清空”。
8. 若 Provider 当前 active，状态变 `unconfigured`；AI generation 跳转配置/切换/seed fallback，不白屏。

E2E 必须覆盖误触场景，防止回归。

## 9. Safety & Boundary Filter

执行顺序：

1. Zod 结构检查。
2. 基础安全词/规则快速过滤（危险行为、强迫、明显非法任务等）。
3. `boundaryTags` 与 BoundaryProfile 精确匹配。
4. intensity <= 当前 Session 最大强度。
5. 人数适配。
6. 文本 normalized hash / 相似度轻量去重。
7. 自定义雷区：Prompt 约束 + 最低限度文本匹配；V1 不承诺完美语义分类。

**重要**：自定义用户题卡来源 `custom`，不经 AI 内容改写；但若其显式 boundaryTags 与当前 Session 冲突，引擎仍不选用。

## 10. Persistence

IndexedDB stores：

- `players`
- `preferences`
- `gamePacks`
- `sessions`
- `sessionSummaries`
- `aiProviderProfiles`
- `aiSecrets`（仅 ciphertext / IV / cryptoVersion）
- `aiCryptoKeys`（non-extractable `CryptoKey`；浏览器不支持安全持久化时不用该 store，改 session-only）

### Autosave Points

- Session 创建/生成状态改变。
- Deck 写入。
- 每次 Round 创建、完成、换题、跳过。
- 强度/玩家状态变更。
- pause/finish。

### Recovery

启动时：

1. 读取最近 `active|paused` Session。
2. 若 schema 有效：提示“继续上一局”。
3. 若 schema 损坏：隔离坏记录并回首页，不阻止 App 启动。

## 11. UI Implementation Baseline

### Design Tokens

先从方案 A 资产提取并固化：

- `--color-neon-pink`
- `--color-electric-purple`
- `--color-neon-blue`
- `--color-bg-night`
- `--color-panel`
- `--color-text-primary`
- `--color-text-muted`
- `--color-danger` / `--color-danger-surface` / `--color-danger-border`（仅危险操作语义，不与普通霓虹 CTA 混用）
- glow / radius / spacing / typography tokens

### Core Reusable Components

- `PrimaryButton`, `SecondaryButton`, `IconButton`
- `NeonCard`
- `Tag`, `ModeBadge`
- `Toggle`, `Slider`, `SegmentedControl`
- `BottomTabBar`
- `Modal`
- `GameCardView`
- `RoundActions`
- `PlayerAvatar/PlayerChip`
- `SecretInput`, `ProviderSelector`, `ConnectionStatus`
- `DangerZone`, `DangerButton`, `ConfirmClearSecretModal`

### Core Screens

1. 首页
2. 组局设置
3. 雷区设置
4. 生成等待
5. 游戏进行中
6. 结束总结
7. 我的游戏包
8. 局中设置/玩家管理（可使用 sheet/modal，不一定独立 route）
9. AI 模型设置（Provider / Key / 测试连接 / Danger Zone；实现基线：`设计资产/方案 A 丨 AI 设置与密钥安全交互原型.png`）

## 12. PWA & Offline Strategy

- `manifest.ts` 提供名称、theme/background color、图标。
- Service Worker 缓存 app shell、字体/静态品牌资源和内置 seed decks。
- AI API 请求使用 network-only + `no-store`，Service Worker 不拦截 `/api/generate-session` 与 `/api/test-provider`；任何含 Key 的 request/response 不进入 Cache Storage。生成后的 cards 由业务层写 IndexedDB。
- 更新版本时避免 service worker 长期锁死旧资源；提供标准 update lifecycle。

## 13. Testing Strategy

### Unit

- card selector：去重、强度、雷区、人数。
- player selector：避免连续、次数平衡、pair 平衡。
- stage controller：权重变化不突破强度。
- Zod schema / normalize / safety filter。
- summary calculation。
- Provider preset/profile schema：DeepSeek default；OpenCode Go experimental/manual-only/no-auto-fallback。
- secret repository：AES-GCM round-trip、随机 IV、IndexedDB 无明文 Key、CryptoKey 不可导出、unsupported 时 session-only。
- `clearApiKey` 仅在 confirmed action 执行。
- redaction：完整 Key 不出现在错误/日志 formatter。

### Integration

- AI mock response → validation → filter → persisted Deck。
- Session autosave → reload → restore。
- custom pack CRUD → new Session snapshot。
- AI failure → seed fallback。
- DeepSeek default → mock JSON Output contract；空 content/截断只重试一次后进入 fallback。
- OpenCode Go experimental → 必须显式启用；验证 `x-opencode-session` 稳定、专用 User-Agent，且没有 auto fallback。
- test-provider request → no persistence / no-store。

### E2E

1. 首页 → 今晚开局 → 配置 → 生成（mock）→ 游戏 3 轮 → 结束总结。
2. 生成完成 → 模拟离线 → 继续游戏。
3. 雷区开启 → 确认禁用卡不出现。
4. 游戏中刷新 → 恢复。
5. 单模式快速启动。
6. AI 设置：DeepSeek 默认配置/测试/加密保存/刷新恢复；OpenCode Go 实验性手动启用；Custom Provider SSRF guard。
7. 清空 Key：第一次点击不删除；取消不删除；二次确认才删除；删除后状态未配置。

## 14. Deployment

### Development

- `pnpm dev --hostname 0.0.0.0` 供同局域网移动端调试。
- PWA install/offline 最终验收必须使用 HTTPS 或浏览器允许的安全上下文。

### Personal Self-host (recommended path)

- Docker build/run on a trusted machine.
- HTTPS 可由现有私有网络反向代理、Tailscale Serve/Caddy 等提供；具体部署方式与 V1 业务代码解耦。
- 正常用户 AI secrets 由 App 本地加密存储或 session-only 管理，Docker image / `.env` 不需要写入个人 Key；服务端按请求临时接收并转发。开发测试允许 `.env` fallback，但默认关闭且不得覆盖用户本地选择。
- 生产访问必须使用 HTTPS（localhost 开发例外），避免传输中的本地 Key 暴露。

## 15. Complexity Tracking

无 Constitution 违规项，不需要例外。

| Potential Complexity | Decision | Reason |
|---|---|---|
| Supabase / remote DB | Reject for V1 | Local-first 已满足需求 |
| Authentication | Reject for V1 | 个人自用，无价值 |
| WebSocket multiplayer | Reject for V1 | 单机传递玩法已经满足核心场景 |
| Separate backend service | Reject for V1 | 单 AI Route Handler 足够 |
| Heavy animation library | Avoid | CSS/WAAPI 足够，降低包体与维护成本 |
| Server-side API key database | Reject | 个人自用；Key local-only + request-scoped proxy 即可 |
| OpenCode Zen preset | Reject | 用户明确不接免费 Zen |
| OpenCode Go 作为默认/自动 fallback | Reject | 官方主要面向 coding agents；Party Night 仅提供 experimental/manual-only |
| 明文 API Key in IndexedDB | Reject | OWASP 明确不建议；改 AES-GCM + non-extractable CryptoKey / session-only |

## 16. Cross-Artifact Design Check

- Constitution 要求 zero-account → PLAN 无 auth/cloud DB：一致。
- SPEC FR-010 整局生成 → AI pipeline 批量 Deck：一致。
- SPEC FR-017/028 Engine/Game Pack 解耦 → `lib/engine` + `lib/game-packs`：一致。
- SPEC FR-036/037 Session 恢复 → IndexedDB + autosave points：一致。
- SPEC FR-045 方案 A → Design Tokens + 资产目录：一致。
- SPEC 自定义 Game Pack → `game-pack-repository` + `/packs` routes：一致。
- “个人自用”与“安全边界”不冲突：安全是可控体验规则，不引入商业审核后台。
- SPEC FR-049–058 Provider/Secret → `/settings/ai` + encrypted secret service + request-scoped Proxy + Danger Zone：一致。
- DeepSeek Official 为默认；OpenCode Go 使用官方 Go endpoint 但仅 experimental/manual-only，免费 Zen 不进入 registry：一致。
- AI Secret → AES-GCM encrypted at rest；不支持安全持久化时 session-only：一致。
- Custom Provider → server-side SSRF guard：一致。
- AI 设置页 → 已新增方案 A 正式原型资产并纳入逐屏视觉验收：一致。

## 17. Official Technical Baseline Sources

- Spec Kit current workflow: https://github.com/github/spec-kit/blob/main/README.md
- Spec Kit plan template: https://github.com/github/spec-kit/blob/main/templates/plan-template.md
- Next.js support policy: https://nextjs.org/support-policy
- Next.js 2026 security release / Active LTS: https://nextjs.org/blog
- Node.js release archive / LTS: https://nodejs.org/en/download/releases/
- OpenCode Go official docs: https://opencode.ai/docs/go/
- DeepSeek API official docs: https://api-docs.deepseek.com/zh-cn/

- DeepSeek JSON Output: https://api-docs.deepseek.com/zh-cn/guides/json_mode/
- OWASP HTML5 Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html
- OWASP SSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- Spec Kit Agentic SDD / Analyze-before-Implement: https://github.com/github/spec-kit/blob/main/docs/reference/agentic-sdd.md
