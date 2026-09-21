# Implementation Plan: Party Night V1.2 — 增量玩法与主局整合

**Branch**: `002-party-night-v1-1-expansion`  
**Date**: 2026-09-21  
**Spec**: `2026-09-21 丨 通用 丨 ChatGPT 丨 Party Night 聚会游戏工具-SPEC交接上下文 丨 V1.1.md`  
**Input**: 既有 Party Night V1.0 代码 + V1.2 Constitution/SPEC + 当前已开发 UI 截图/真实实现

## 1. Summary

V1.2 采用**增量改造**：保留 V1.0 的 Next.js/React/TypeScript、Party Game Engine、IndexedDB、AI provider adapter、PWA 和方案 A Design System；新增玩法、主局切换、Party Tools 和游戏包内规则库。

本次禁止技术栈迁移。所有路径以下述 V1.0 结构为参考；若仓库实际已调整，以现有代码为准并复用对应模块，不创建重复层。

## 2. Constitution Check

| Gate | 结果 | 计划依据 |
|---|---|---|
| 四 Tab 保留 | PASS | 不改 BottomTabBar IA |
| 关系/氛围/尺度不改 | PASS | 复用现有 SessionConfig/组件 |
| Party 不新增 Tab | PASS | Party 仅 domain/session 概念 |
| 同 Session 切玩法 | PASS | currentPackId + PackSwitcher |
| Engine/Pack 解耦 | PASS | 新玩法接 registry/capability |
| 规则库在游戏包 | PASS | packs 页面二级 segment |
| Local-first/fallback | PASS | IndexedDB + built-in seeds |
| 现有视觉延续 | PASS | Design Tokens + 现有组件 |
| 不引入越界系统 | PASS | 无账号/房间/云 DB |
| 可追踪 | PASS | TASKS matrix 覆盖 FR-001–046 |
| 凭据安全边界 | PASS | 系统密钥不进浏览器；BYOK 不进日志/导出/缓存 |
| 外部内容安全 | PASS | 纯文本渲染 + Schema 长度限制 |
| 升级迁移安全 | PASS | IndexedDB 事务迁移 + PWA 版本错位恢复 |
| 禁用语义一致 | PASS | 首页核心卡保留禁用态，不绕过 Pack 设置 |

## 3. Technical Strategy

### 3.0 Current Official Compatibility Note（2026-09 核验）

- Next.js 16 官方当前最低 Node.js 要求为 **20.9+**，TypeScript 要求为 **5.1+**；App Router 继续采用 React 19 系列能力。
- Node.js **24.x 目前为 LTS**；若现有环境已经使用 Node 24，可继续沿用，无需为了本功能切到 Node 26 Current。
- Tailwind CSS 4 的官方 Next.js 安装路径使用 `tailwindcss` + `@tailwindcss/postcss` + PostCSS；本次不应为了“更新”而重建既有样式管线。
- **不要在 SDD 中硬写未经仓库验证的 Next.js 精确 patch 号**。实际版本以现有 `package.json`/lockfile 为准；开工 baseline 记录版本并检查官方安全公告，必要时只做当前 major 内的安全补丁升级，避免把 feature 开发与框架迁移混在一起。

### 3.1 Preserve Existing Stack

沿用 V1.0：

- Next.js App Router + React + TypeScript。
- Tailwind/CSS variables Design Tokens。
- Zod 或现有 Schema 验证方式。
- IndexedDB repository/service。
- React Context/useReducer 或现有状态方案。
- 现有 AI Provider Adapter / 请求路径（无论当前实现为本地直连还是服务端转发，V1.1 均不迁移）。
- PWA/Service Worker。

**MUST NOT** 因本次需求替换状态库、ORM、数据库、前端框架或部署架构。

### 3.2 Architecture Delta

```text
Existing UI / 4 Tabs
│
├─ Home
│   ├─ existing 4 primary packs
│   └─ MoreGames entry ──────────────┐
│                                    │
├─ Group/Main Session                │
│   ├─ Game renderer host <──────────┤
│   ├─ PackSwitcherSheet             │
│   └─ Session status                │
│                                    │
├─ Game Packs                        │
│   ├─ [玩法] built-in/custom/tools  │
│   └─ [规则] Rule Library           │
│                                    │
└─ Settings (unchanged)              │
                                     ▼
Party Game Engine
├─ session-engine
├─ card-selector / rejection-dedupe
├─ player-selector
├─ pack registry / capability
├─ pack-local-state adapter
└─ tools randomizer
      │
      ├─ existing packs
      ├─ would-you-rather
      ├─ pointing-game
      ├─ compatibility-test
      └─ spin-bottle

Local Repositories
├─ sessions
├─ preferences
├─ game packs
└─ optional rule favorites

AI pipeline (existing)
└─ only for AI-content packs; fallback to local seeds
```

**Provider/凭据原则**：V1.2 不改变当前 AI 请求拓扑，但必须明确两类凭据边界：
- **系统/应用托管密钥**：只能存在服务端环境，MUST NOT 下发浏览器。
- **用户 BYOK**：若既有版本已支持本地填写 Base URL / Model / API Key，可继续复用同一配置与存储；必须遮罩显示，并排除日志、错误上报、导出/备份与 Service Worker Cache。浏览器直连仅在 Provider 明确支持浏览器/CORS 且用户主动配置时使用。浏览器持久化不能提供真正 secret-store 级机密性；设置文案不得误导，若用户需要隐藏密钥，应切换服务端代理/外部 secret store。
- 两类模式不得同时复制第二份 Key 存储；清空 API Key 继续保留危险样式与二次确认。

## 4. Project Structure Delta

参考 V1.0 路径：

```text
app/
├── page.tsx                              # 首页：保留 + 更多玩法入口
├── game/page.tsx                         # 组局主局：加入 pack switching/renderer host
├── packs/page.tsx                        # 游戏包：加入 玩法/规则 segment
├── packs/rules/[ruleId]/page.tsx         # 新增规则详情（若用 route）
└── settings/...                          # 不重构

components/
├── game/
│   ├── PackSwitcherSheet.tsx             # 新增
│   ├── WouldYouRatherView.tsx            # 新增
│   ├── PointingGameView.tsx              # 新增
│   ├── CompatibilityView.tsx             # 新增
│   ├── SpinBottleView.tsx                # 新增
│   └── existing GameCard/RoundActions...
├── packs/
│   ├── PackSegmentedTabs.tsx             # 玩法/规则
│   ├── RuleList.tsx
│   └── RuleDetail.tsx
├── tools/
│   ├── RandomPlayerTool.tsx
│   └── RandomGroupTool.tsx
└── ui/                                   # 复用现有组件

lib/
├── engine/
│   ├── session-engine.ts                 # switchPack / pack state
│   ├── card-selector.ts                  # rejection fingerprint
│   ├── player-selector.ts                # spin/random reuse
│   └── types.ts
├── game-packs/
│   ├── registry.ts
│   ├── would-you-rather.ts
│   ├── pointing-game.ts
│   ├── compatibility-test.ts
│   ├── spin-bottle.ts
│   └── built-in-seeds/
├── tools/
│   ├── random-player.ts
│   └── random-groups.ts
├── rules/
│   ├── catalog.ts
│   └── entries/
│       ├── miss-card.ts
│       ├── kings-cup.ts
│       ├── three-gardens.ts
│       ├── seven-pass.ts
│       ├── fifteen-twenty.ts
│       ├── liars-dice.ts
│       ├── number-bomb.ts
│       └── finger-guessing.ts
└── storage/
    └── session-repository.ts             # schema migration V1.1

tests/
├── unit/
├── integration/
└── e2e/
```

> 若当前仓库目录命名不同，TASK 实施前先做 path mapping；禁止同时保留两套同义模块。

## 5. Domain Model Changes

### 5.1 Session

新增：

- `currentPackId`
- `packStates: Record<packId, state>` 或现有等价结构
- `recentRejectedFingerprints`

迁移要求：旧 Session 缺失 `currentPackId` 时，按最近 round 或默认 pack 推导；推导失败则回首页提示继续/重新开始，不得白屏。

### 5.2 Pack Capability

统一声明能力：

```ts
type PackCapability = {
  requiresAIContent: boolean;
  minPlayers: number;
  maxPlayers?: number;
  supportsMixedMode: boolean;
  renderer: 'card' | 'binary-choice' | 'pointing' | 'compatibility' | 'spin';
  supportsLocalSeed: boolean;
};
```

Renderer hint 只决定 UI 组件，不包含 Session 业务逻辑。

### 5.3 Pack Local State

- Compatibility: pair + score + rounds。
- SpinBottle: lastSelectedPlayerId（可选）。
- 其他 pack 默认 stateless 或复用 currentRound。

## 6. Session Switching Design

### switchPack(packId)

前置：

1. Session active。
2. pack enabled。
3. minPlayers 满足。

执行：

1. 保存当前 round 的稳定状态。
2. 更新 `currentPackId`。
3. 读取/初始化目标 pack state。
4. 从 Deck 选择目标 pack 未用卡；无卡时使用 seed/fallback。
5. 持久化 Session。
6. UI renderer 根据 registry capability 渲染。

禁止：

- 创建新 Session。
- 重置玩家。
- 重置尺度/雷区。
- 清空历史。

## 7. AI & Deck Strategy

### 7.1 Existing Strategy Kept

V1.0 的“整局预生成 + 本地 Deck + fallback”继续使用。

新增 pack 的 AI 内容分两种：

- **二选一、指人、默契测试**：支持 AI 预生成 + 本地 seed。
- **转瓶子、随机工具**：纯本地逻辑，不需要 AI。

### 7.2 Rejection / Dedupe

“换一个”增加 fingerprint：

- normalize 文本。
- 计算稳定 fingerprint/hash。
- 记录最近 N 个 rejection。
- selector/generation prompt 避免近期相似题。

不需要语义向量数据库；优先简单 normalization + token overlap/现有 dedupe 策略。

### 7.3 Refill

当当前 pack 可用卡低于阈值：

1. 立即从本地 seed 取卡，保证不卡现场。
2. 网络可用时可后台请求 refill。
3. refill 写入当前 Session Deck snapshot，仍需过滤/去重。

### 7.4 Security & Safe Rendering

- AI/provider 返回值、用户自定义题卡、玩家昵称、规则文本一律视为不可信输入。
- UI 默认使用 React 文本节点/等价安全绑定；禁止直接把这些内容传入 `dangerouslySetInnerHTML`。
- Zod/现有 Schema 对题目、选项、昵称、规则摘要设置明确最大长度；超过限制时拒绝或截断到可审查的安全上限。
- 安全过滤增加红队 fixture：强迫饮酒、危险挑战、非自愿身体接触、违法危险行为、涉及未成年人的露骨性内容。
- 参与者年龄未知时，模型提示词不得生成露骨性内容；高尺度仍受 boundaries/safety hard constraints 约束。

### 7.5 Disabled Pack Semantics

- 首页原 4 个核心玩法卡片始终保留布局。
- 若某核心 pack 被用户在“游戏包”禁用，首页卡显示禁用状态，不得点击后绕过 registry 设置直接开局。
- 点击禁用卡可打开轻提示，提供“去游戏包启用”或取消；不自动改变用户设置。

## 8. New Pack Implementation

### 8.1 二选一

Card contract：

```ts
{
  type: 'would-you-rather',
  optionA: string,
  optionB: string,
  intensity: number,
  tags: string[]
}
```

Renderer 只提供 A/VS/B、倒计时/提示、下一题/换一个。

### 8.2 指人游戏

```ts
{
  type: 'pointing',
  prompt: string,
  intensity: number,
  tags: string[]
}
```

倒计时为 UI 层；结果不强制输入。

### 8.3 默契测试

```ts
{
  type: 'compatibility',
  prompt: string,
  answerMode: 'open' | 'binary' | 'choice',
  options?: string[]
}
```

Pack state 保存 pair/score/rounds。只有点击“一样”时 score +1。

### 8.4 转瓶子

结果由：

`selectEligiblePlayer(activePlayers, recentSelection)`

得到。动画只展示结果，不参与随机。

选中后 action：

- truth → `switchPack('truth-or-dare')` + truth mode
- dare → `switchPack('truth-or-dare')` + dare mode
- spin again → 保持 spin pack

若现有真心话大冒险内部不是单独 truth/dare mode，则通过现有 action contract 接入，不新增重复 Pack。

## 9. Party Tools

### Random Player

- 读取 active players。
- 可选避免连续重复。
- 无名字用占位。

### Random Groups

算法要求：

- 输入 group count 或 pair mode。
- 先 shuffle activePlayers，再均匀分配。
- 组间人数差最大 1（除两人一组最后允许 1 人余数的产品决策；推荐提示余数）。
- 纯函数 + deterministic injected RNG test。


### 9.1 随机点名

即 Random Player：读取 active players，可避免连续重复；无昵称时使用占位玩家名。

### 9.2 随机分组

即 Random Groups：纯本地 shuffle + balanced distribute，不调用 AI。

## 10. Rule Library

### 10.1 Data as Code

首批 8 条建议作为静态 typed catalog，而非数据库表：

- 版本可审查。
- 可离线。
- 无需后端。
- 易于后续补规则。

### 10.1.1 首批条目

小姐牌、King's Cup、逛三园、逢七过、十五二十、吹牛骰子、数字炸弹、划拳。存在 house rules/地域差异时必须显示常见变体提示。

### 10.2 Detail UI Contract

顺序固定：

1. 标题 + 别名。
2. 道具 + 人数 + 类别。
3. “30 秒看懂”。
4. 详细规则/牌义。
5. 常见变体。
6. “规则可能因地区/酒局不同”提示（仅适用时）。

不显示“开始数字游戏”主按钮。

## 11. UI Implementation Baseline

### 11.1 Do Not Redesign

以下组件以当前 App 为视觉真源：

- BottomTabBar。
- Home hero/CTA。
- 2×2 primary pack cards。
- Session setup choice buttons。
- 1–5 scale slider。
- Game Pack list cards。
- Settings provider cards。

### 11.2 Additive Components

- `MoreGamesSheet`
- `PackSwitcherSheet`
- `PackSegmentedTabs`
- 4 new renderer views
- Rule list/detail
- Party Tools cards

### 11.3 Mobile Layout

- 360px / 390px / 430px 重点 QA。
- Bottom sheet 与底栏必须处理 safe-area。
- 主游戏题卡字体不应因内容稍长缩到难读；必要时允许内容区自然增高。
- 主按钮保持可触达，不用 hover 才出现关键操作。

## 12. Persistence Migration & PWA Version Skew

1. 增加 schemaVersion。
2. 读取 V1.0/V1.1 Session 时补默认 `currentPackId`。
3. packStates 缺失则 `{}`。
4. recentRejectedFingerprints 缺失则 `[]`。
5. 迁移必须幂等，并在单个 IndexedDB upgrade/transaction 边界内完成；失败不得先清空旧记录。
6. migration 失败隔离坏记录，不影响首页启动；有效旧记录保持可恢复。
7. App 启动时先校验 `bundle/app schema version ↔ persisted schemaVersion`；检测到版本错位时走兼容读取/迁移，不让旧 SW 无限期服务不兼容 bundle。
8. Service Worker 使用版本化 cache；激活新版本时清理明确已废弃 cache，但不得缓存 AI endpoint、API Key、Provider 响应或导出数据。
9. V1.2 rollout 必须有“V1.x fixture → 更新 → 恢复 active Session”的 E2E，覆盖旧缓存/新 bundle 的至少一个版本错位场景。

## 13. Testing Strategy

### Unit

- switchPack state transition。
- pack capability validation。
- each new pack schema/seed。
- random player / random group。
- compatibility score reducer。
- rejection/dedupe。
- V1.0/V1.1 → V1.2 migration。
- external text escaping/length limits。
- safety filter red-team fixtures。
- BYOK secret serialization/cache guards。

### Integration

- active Session 跨 pack 切换。
- spin → truth/dare chain。
- AI failure → seed fallback。
- pack disable → switcher/mixed mode exclusion。
- rule catalog parsing。
- disabled core pack → home card semantics。
- no-cached-card + offline switch → immediate seed。
- PWA/IndexedDB version-skew recovery。

### E2E

1. 首页/四 Tab 回归。
2. 原 4 玩法回归。
3. 组局尺度 UI 回归。
4. 新 4 玩法基础流程。
5. 主局切换 3 次且 Session ID 不变。
6. 刷新恢复 currentPack + compatibility score。
7. 游戏包“玩法/规则”导航。
8. 规则首批 8 条可打开。
9. 设置页 AI provider 回归。
10. Provider offline fallback。
11. Disabled core pack home-card behavior。
12. Malicious HTML/script rendered inert。
13. BYOK secret leak audit。
14. V1.x persisted Session + old-cache upgrade recovery。
15. Safety red-team fixtures。

## 14. Deployment & Rollout

- **Brownfield preflight**：开始改代码前保持工作树可审查（commit/stash 当前工作），使用现有功能分支或等价隔离环境；先记录 baseline，再做任何迁移/重构。
- 先在现有本地/测试部署完成 migration + regression。
- PWA Service Worker 更新需保证旧客户端能获取新 bundle，避免旧缓存卡死。
- 不改变现有部署拓扑。
- 若已有 Docker/self-host 配置，只做必要构建回归，不重写部署方案。

## 15. Complexity Tracking

| 决策 | 是否新增复杂度 | 结论 |
|---|---:|---|
| 保留 4 Tab | 否 | 避免 IA 迁移 |
| PackSwitcher | 低 | 复用 Session/registry，必要 |
| 4 new renderers | 中 | 玩法体验差异所需，不复制 Engine |
| Rule catalog data-as-code | 低 | 比数据库更简单 |
| Random tools | 低 | 纯本地函数 |
| 新全局状态库 | 高 | 不允许，现阶段无必要 |
| 多人联网 | 高 | Out of scope |
| Vector semantic dedupe | 高 | 不采用，简单 fingerprint 足够 |

## 16. Cross-Artifact Design Check

- Constitution 要求保留 4 Tab → SPEC FR-001 → TASKS 有导航回归任务。
- Constitution 要求尺度不改 → SPEC FR-003/040 → TASKS 只做回归、不做重构。
- 同 Session 切玩法 → FR-005–009 → session-engine + PackSwitcher + integration/E2E。
- 新 4 玩法 → FR-014–021 → 4 pack definitions + renderers + tests。
- Tools → FR-022–024 → pure functions + components。
- Rules → FR-029–033 → static catalog + packs page segment + detail UI。
- Recovery/fallback → FR-025–028/034–035 → repositories + tests。
- Existing settings → FR-004/041 → regression + secret boundary audit。
- Safe rendering/content safety → FR-042/046 → schema/renderer/safety tests。
- Migration/PWA version skew → FR-043 → migration + cache compatibility tests。
- Disabled core shortcut → FR-044 → home/pack integration E2E。
- Offline switch non-blocking → FR-045 → seed-first switch E2E。

结论：设计层无结构冲突；进入编码前必须先完成仓库 baseline/path mapping，并执行一次 pre-implementation Analyze/等价一致性检查。

## 17. Current GitHub Spec Kit Alignment

按 2026-09 官方文档：

- Constitution 通常是项目级治理文件；本次因治理边界发生实质变化而升级到 1.2.0。
- 单个 feature 的核心执行流是：`Specify → Plan → Tasks → Implement → Converge`。
- 对有明显兼容/安全歧义的 brownfield feature，应在 Plan 前完成 Clarify，在 Tasks 后、Implement 前执行 Analyze；Checklist 可作为需求质量门。
- Converge 只在 Implement 之后运行；若它追加任务，则继续 `Implement → Converge` 直到 Converged。
- 现有项目应从“可审查 baseline +  bounded change”开始，不为使用 Spec Kit 而重构整个旧系统。

本项目仍按用户要求交付四份 Markdown（Constitution / SPEC / PLAN / TASKS）；它们是实现前的意图与计划制品，不代表省略 Implement/Converge。V1.2 已在文档层做一次人工 Analyze 式交叉检查；开发环境如已安装 Spec Kit，仍建议在执行 TASKS 前正式运行 `/speckit.analyze`（或对应 agent 的等价命令）。