# Feature Specification: Party Night V1.2 — 玩法扩展、主局整合与规则库

**Feature Branch**: `002-party-night-v1-1-expansion`  
**Created**: 2026-09-21  
**Status**: Reviewed — 可实施；正式编码前仍需完成仓库 baseline/path mapping 与 pre-implementation Analyze  
**Supersedes**: Party Night V1.1 feature specification as the active development baseline  
**Input**: 已有 Party Night PWA；保留现有四 Tab、组局 UI、尺度 UI、4 个 AI 玩法和 AI 设置，在其上增量加入新玩法、主局切换与规则库，并补齐安全渲染、凭据边界和升级迁移约束。

## 1. Product Intent

Party Night V1.2 的目标不是重新设计产品，而是让已经可用的 PWA 从“4 个内置 AI 玩法 + 组局”扩展为更完整的 **AI Party Host / Party Game Engine**。

本次核心产品判断：

> **Party Session 是一场聚会的数据；“组局”是这场聚会的前台运行空间；游戏只是 Session 中可以切换的玩法。**

因此，本次必须做到：

- 现有导航、组局参数、尺度和霓虹 UI 基本不动。
- 新玩法能一次性全部加入，但共享已有 Engine/AI/Storage。
- 同一场局内切换玩法不重复设置、不丢状态。
- 规则库进入“游戏包”，只帮助用户快速查线下玩法规则。

## 2. Existing Baseline — 必须保护的现状

### 2.1 底部导航

现有 4 Tab 保持：

1. **首页**：快速入口和“今晚开局”。
2. **组局**：用户称“主局”；创建 Session 前承担设置入口，Session 激活后承担当前游戏运行页。
3. **游戏包**：内置玩法启用状态、自定义玩法；V1.1 在这里增加规则库。
4. **设置**：外观、AI Provider/模型、API 配置等。

> 说明：文档中统一写作“组局（主局运行页）”。不要求把 UI 文案“组局”改成“主局”。

### 2.2 首页

现有首页核心结构继续保留：

- PN/Party Night 品牌区域。
- 主 CTA：**今晚开局**。
- 2×2 核心玩法：真心话大冒险 / 谁最可能 / 我从来没有 / AI 即兴。
- 我的游戏包。
- AI 模型设置快捷入口。
- 底部四 Tab。

V1.2 允许新增一个低侵入“更多玩法”入口，但不得破坏上述四个核心卡片位置。若用户在“游戏包”中禁用某个核心玩法，该首页卡片仍保留位置但必须显示禁用状态；点击时只能提示/引导重新启用，不得静默启动已禁用玩法。

### 2.3 组局设置

现有配置继续作为唯一 SessionConfig：

- 人数 + 玩家名字。
- 关系：第一次见/拼桌、刚认识、普通朋友、熟人局、很熟、情侣/暧昧。
- 今晚氛围：破冰、搞笑、暧昧、放开玩、随机（按现有实现）。
- 游戏尺度：现有 1–5 slider 与文案，保持原样。
- 已实现雷区/边界配置继续生效。

**本次不重做尺度 UI。**

## 3. User Stories & Acceptance Scenarios

### US1 — 保留现有首页和四 Tab，仅增量扩展（P1）

**Goal**：用户升级后仍能一眼认出原产品，不重新学习导航。

**Acceptance**：

1. Given 用户打开 V1.1，When 进入首页，Then 原有 4 个核心玩法和“今晚开局”仍在原有层级。
2. Given 用户查看底部导航，Then 仍然是首页/组局/游戏包/设置四项。
3. Given 用户进入设置，Then 现有深浅色、AI Provider/模型设置继续可用。
4. Given 用户进入组局设置，Then 关系/氛围/尺度选项语义与原版一致。

### US2 — 一场 Session 内自由切换玩法（P1）

**Goal**：用户开始一局后，不回到重新组局流程即可切换游戏。

**Acceptance**：

1. Given 已有 active Session，When 从“我从来没有”切到“二选一”，Then 玩家/关系/氛围/尺度/雷区全部保留。
2. When 切换玩法，Then 不新建 Session ID，RoundHistory 连续记录 packId。
3. When 切换面板打开，Then 只显示当前已启用且可玩的内置/自定义玩法；当前玩法有明确选中状态。
4. When 新玩法 Deck 不足，Then 优先使用已缓存/本地 seed，不允许卡死；必要时允许后台 refill。
5. When 用户返回首页再选另一个玩法，Then 若 Session 仍 active，直接切换当前玩法并回到组局主局。

### US3 — 二选一（P1）

**Goal**：AI 出一个二选一题，所有人在线下同时选择，手机负责主持节奏。

**Flow**：

`进入 → 显示题目 A/VS/B → 3/2/1 同时选择 → 下一题/换一个`

**Acceptance**：

- 不要求所有玩家逐个在手机投票。
- V1.2 不做联网匿名投票。
- 题目继承 Session 关系/氛围/尺度/雷区。
- “换一个”记录为 swapped/skipped；“下一题”记录为 completed。

### US4 — 指人游戏（P1）

**Goal**：展示一句指令，倒计时后所有人同时指向一名玩家。

**Flow**：

`题目 → 准备 → 3 → 2 → 1 → 👉 指 → 停留结果氛围 → 下一题`

**Acceptance**：

- 不强制统计票数。
- 题目表达与“谁最可能”区分：更像直接指令而非概率提问。
- 可选点击“本轮焦点玩家”，但不影响继续流程。

### US5 — 默契测试（P1）

**Goal**：选两名玩家，系统出题，两人同时回答，由主持人判断是否一致并累计娱乐分数。

**Flow**：

`选择两人 → 题目 → 3/2/1 同时回答 → 一样/不一样 → 默契 +1 或不加分 → 下一题`

**Acceptance**：

- V1.2 不要求两人分别拿手机秘密输入。
- score 仅为娱乐分数，不输出严肃关系评价。
- 当前 pair、score、题数在刷新恢复后可恢复。
- 可快速更换配对。

### US6 — 转瓶子（P1）

**Goal**：手机替代实体瓶子，随机指向一名 active 玩家，并与现有真心话/大冒险串联。

**Flow**：

`点击/滑动开始 → 动画旋转 → 随机玩家 → 真心话 / 大冒险 / 再转一次`

**Acceptance**：

- 随机算法来自共享 player-selector，可测试。
- 动画不决定结果，结果先由逻辑确定，再播放表现动画。
- prefers-reduced-motion 下允许简化动画。
- 选真心话/大冒险后在同一 Session 中调用已有 Pack，不重开局。

### US7 — 随机点名与随机分组工具（P2）

**Goal**：复用当前 Session 玩家名单完成快速随机，不引入新的复杂游戏流程。

**Acceptance**：

- 随机点名支持“再抽一个”；尽量避免连续重复。
- 随机分组支持 2 组 / 3 组 / 两人一组（或等价配置）。
- 没有玩家名字时使用“玩家1、玩家2…”占位。
- 工具不调用 AI。

### US8 — 游戏包内规则库（P1）

**Goal**：用户忘记线下酒桌游戏怎么玩时，在游戏包中 30 秒查到规则。

**Acceptance**：

1. “游戏包”页面新增 `玩法 / 规则` 二级切换或等价轻量结构；底部导航不变。
2. 规则列表首批包含：小姐牌、King's Cup、逛三园、逢七过、十五二十、吹牛骰子、数字炸弹、划拳。
3. 规则详情包含：道具、适合人数、一句话规则、步骤/牌义、常见变体。
4. 小姐牌/King's Cup 等规则必须标注存在常见变体。
5. 规则库不提供“开始游戏”强制数字化流程，除非该玩法本身就是手机工具型。

### US9 — Session 恢复与 AI 降级（P1）

**Goal**：刷新、锁屏、断网、Provider 失败不会毁掉现场节奏。

**Acceptance**：

- active Session、currentPackId、RoundHistory、兼容测试 score/pair 可恢复。
- AI 失败时使用本地 seed/fallback；用户看到可玩的下一题而不是技术错误码。
- 换题/跳过历史用于减少短期重复。

## 4. Detailed Interaction Model

### 4.1 首页 → 今晚开局

```text
首页
 ↓
今晚开局
 ↓
组局设置（沿用现有 UI）
 ↓
人数/名字
 ↓
关系
 ↓
今晚氛围
 ↓
1–5 尺度（原样）
 ↓
雷区（若现有流程启用）
 ↓
创建 Party Session
 ↓
进入“组局”主局
```

### 4.2 首页 → 某个游戏

```text
点击玩法
 ↓
已有 active Session？
 ├─ 是 → 更新 currentPackId → 进入组局主局
 └─ 否
     ↓
   有完整最近配置？
   ├─ 是 → 以目标玩法创建 Session → 主局
   └─ 否 → 最小组局（目标玩法已预选）→ 主局
```

### 4.3 主局 → 切换玩法

```text
当前题卡
 ↓
点击“切换玩法”
 ↓
Bottom Sheet / Sheet
 ↓
已启用玩法列表
 ↓
选择新玩法
 ↓
保持同一 Session
 ↓
载入该玩法下一张可玩内容
 ↓
继续
```

### 4.4 游戏包

```text
游戏包
 ├─ 玩法
 │   ├─ 内置玩法（启用/禁用）
 │   ├─ 新增 4 玩法
 │   ├─ 快捷工具
 │   └─ 自定义玩法
 └─ 规则
     ├─ 搜索/分类
     ├─ 规则卡片
     └─ 规则详情
```

## 5. UI Specification

### 5.1 全局导航 — 冻结

底部保持：

`首页 | 组局 | 游戏包 | 设置`

不得新增“Party”Tab，不得把“设置”挤掉。

### 5.2 首页 — 最小增量

**保留**：品牌区、今晚开局、2×2 原有玩法、我的游戏包、AI 模型设置。

**新增建议**：在 2×2 核心玩法后增加一条轻量 `更多玩法` 卡片/入口，打开 Bottom Sheet：

- 二选一
- 指人游戏
- 默契测试
- 转瓶子
- 随机点名
- 随机分组

理由：避免首页从 4 张卡膨胀成 8–10 张卡，同时保证新功能最多 1 次额外点击。

### 5.3 组局（主局运行页）

统一骨架：

```text
┌────────────────────────┐
│ ←  当前玩法      ⋯/设置 │
│ 本局：6人 · 熟人局 · 尺度3 │
├────────────────────────┤
│                        │
│       核心题卡/动画      │
│                        │
├────────────────────────┤
│      主操作按钮          │
│      次操作按钮          │
│  [切换玩法]（轻量入口）   │
└────────────────────────┘
```

规则：

- 一屏 1 个主要动作 + 最多 1 个弱辅助动作。
- “切换玩法”可放右上菜单或题卡下方弱入口，不抢主按钮。
- 当前 Session 摘要只展示必要信息，不重新出现整套设置表单。

### 5.4 新玩法 UI

**二选一**

```text
必须选一个
[A 选项]   VS   [B 选项]
3 · 2 · 1 同时选择
[下一题]
[换一个]
```

**指人游戏**

```text
“指一个你觉得今晚最会隐藏秘密的人”
准备好了吗？
3 → 2 → 1 → 👉 指！
[下一题]
```

**默契测试**

```text
Alex × Emma      默契 4/7
[问题卡]
3 · 2 · 1 同时回答
[一样 ❤️] [不一样 😂]
```

**转瓶子**

```text
[大瓶子动画]
点击/滑动开始
↓
🎯 Alex
[真心话] [大冒险] [再转一次]
```

### 5.5 游戏包 UI

顶部标题仍为“我的游戏包”或现有名称。正文增加：

`[玩法] [规则]`

玩法页：

- 内置玩法：原 4 个 + 新 4 个。
- 快捷工具：随机点名、随机分组。
- 自定义玩法：保持现有新建/启用机制。

规则页：

- 搜索框。
- 分类 chips（扑克/骰子/手势/无需道具等，可选）。
- 规则卡片。
- 详情页采用“30 秒看懂”结构。

### 5.6 设置 UI — 保留

现有外观和 AI 模型设置继续保留；本次不迁移 Provider，不复制第二套 API Key 交互。新增玩法统一读取既有 provider 配置。

凭据边界：
- 应用自有/系统托管 Key 不得进入浏览器。
- 用户主动填写的 BYOK 若现有版本已支持，可继续本地保存，但必须遮罩显示，并从日志、错误上报、导出/备份、Service Worker Cache 中排除；设置页不得把这种浏览器持久化描述成“安全保管/加密保险箱”。
- 浏览器直连仅在 Provider 明确支持浏览器/CORS 且用户主动配置时使用。

## 6. Functional Requirements

### Navigation & Existing UI

- **FR-001** 四 Tab MUST 保持：首页/组局/游戏包/设置。
- **FR-002** 首页 MUST 保留原 4 个核心 AI 玩法快捷卡。
- **FR-003** 组局关系/氛围/1–5 尺度 MUST 保持现有语义与 UI 模型。
- **FR-004** 设置页现有 AI Provider/模型/Base URL/API Key 能力 MUST 不被破坏；清空 API Key MUST 保持危险操作区分与二次确认，不得新增第二套凭据存储。

### Party Session & Switching

- **FR-005** Party Session MUST 保存 currentPackId/currentMode。
- **FR-006** 切换玩法 MUST 保持同一 Session ID 和配置。
- **FR-007** RoundHistory MUST 记录 packId、cardId、status 和必要 participant data。
- **FR-008** 当前玩法 MUST 在刷新后恢复。
- **FR-009** 切换面板 MUST 只展示可用/启用玩法。

### Existing Packs

- **FR-010** 真心话大冒险继续可用。
- **FR-011** 谁最可能继续可用。
- **FR-012** 我从来没有继续可用。
- **FR-013** AI 即兴继续可用。

### New Packs

- **FR-014** MUST 新增二选一。
- **FR-015** MUST 新增指人游戏。
- **FR-016** MUST 新增默契测试。
- **FR-017** MUST 新增转瓶子。
- **FR-018** 新玩法 MUST 继承 Session 关系/氛围/尺度/雷区。
- **FR-019** 二选一/指人 MUST 不要求逐人手机录入。
- **FR-020** 默契测试 MUST 支持 pair + score + 恢复。
- **FR-021** 转瓶子 MUST 用本地 player-selector 确定结果并可链入真心话/大冒险。

### Party Tools

- **FR-022** MUST 提供随机点名。
- **FR-023** MUST 提供随机分组。
- **FR-024** Party Tools MUST 不调用 AI。

### AI & Deck

- **FR-025** AI 玩法 SHOULD 沿用批量预生成/缓存策略，不强制每轮请求。
- **FR-026** AI 输出 MUST 结构校验、边界过滤、去重。
- **FR-027** “换一个” MUST 记录 rejection 并减少短期相似重复。
- **FR-028** Provider 失败 MUST 有本地 fallback。

### Rules Library

- **FR-029** 规则库 MUST 位于“游戏包”中。
- **FR-030** MUST 提供首批 8 个规则条目。
- **FR-031** 规则详情 MUST 含道具/人数/一句话规则/详细步骤或牌义/常见变体。
- **FR-032** 存在地域/house rules 的玩法 MUST 明确标注变体。
- **FR-033** 规则库 MUST NOT 强迫线下玩法数字化。

### Persistence

- **FR-034** active Session MUST 可恢复。
- **FR-035** 新增玩法局部状态 MUST 可恢复或安全重建。
- **FR-036** 自定义 Pack 与规则收藏 SHOULD 本地持久化。

### Visual & Usability

- **FR-037** MUST 延续现有方案 A 霓虹夜场视觉。
- **FR-038** 新页面 MUST 复用既有 tokens/components。
- **FR-039** 核心游戏界面 MUST 适合单手操作与多人围观。
- **FR-040** 本次 MUST NOT 重做尺度 UI。

### Security, Update & Compatibility

- **FR-041** 凭据 MUST 区分系统托管密钥与用户 BYOK：系统密钥不得进入浏览器；BYOK 不得进入日志、错误上报、导出/备份或 Service Worker Cache；若 BYOK 持久化在浏览器，本产品 MUST 将其视为个人自用便利模式而非强机密存储。
- **FR-042** AI 输出、自定义题卡、玩家昵称和规则文本 MUST 按不可信纯文本安全渲染；主要文本字段 MUST 有长度上限，不得直接执行模型/用户提供的 HTML/脚本。
- **FR-043** V1.x → V1.2 本地数据迁移 MUST 幂等、事务化、非破坏；Service Worker / bundle / IndexedDB 版本错位 MUST 有可恢复路径。
- **FR-044** 若内置核心玩法被用户禁用，首页原核心卡片 MUST 保留但清晰标注禁用；点击不得绕过禁用状态启动玩法。
- **FR-045** 切换到当前无缓存题卡的 AI 玩法 MUST 立即使用本地 seed/fallback，不得阻塞等待网络；后台 refill 只能作为增强。
- **FR-046** 高尺度内容仍 MUST 遵守安全边界：禁止强迫饮酒、危险挑战、非自愿身体接触、违法危险行为及涉及未成年人的露骨性内容；年龄未知时不生成露骨性任务/问题。

## 7. Data Model Changes

### GameSession 增量字段

```ts
interface GameSession {
  schemaVersion: number;
  updatedAt?: string;
  // existing fields...
  currentPackId: string;
  currentPackState?: Record<string, unknown>;
  recentRejectedFingerprints?: string[];
}
```

### RoundHistory 增量

```ts
interface RoundRecord {
  packId: string;
  cardId?: string;
  status: 'completed' | 'swapped' | 'skipped';
  participantIds?: string[];
  result?: Record<string, unknown>;
  at: string;
}
```

### Pack-local State Examples

```ts
interface CompatibilityState {
  playerAId: string;
  playerBId: string;
  score: number;
  rounds: number;
}

interface SpinBottleState {
  lastSelectedPlayerId?: string;
}
```

### RuleEntry

```ts
interface RuleEntry {
  id: string;
  title: string;
  aliases?: string[];
  category: 'cards' | 'dice' | 'gesture' | 'no-prop' | 'other';
  props: string[];
  playerRange?: string;
  quickSummary: string;
  steps: RuleStep[];
  variants?: RuleVariant[];
  hasHouseRules?: boolean;
}
```

## 8. Rules Library — 首批内容范围

1. 小姐牌 / 金陵十三钗：扑克牌 A–K 常见规则 + 变体说明。
2. King's Cup / Ring of Fire：欧美 A–K 常见版本 + house rules 说明。
3. 逛三园：类别接龙、重复/卡住判负。
4. 逢七过：7、7倍数/含7数字的常见规则说明。
5. 十五二十：双人/多人常见手势和叫数规则。
6. 吹牛骰子：骰盅、叫点、质疑、开盅流程。
7. 数字炸弹：范围缩小猜数字。
8. 划拳：基础玩法与地域差异提醒。

> 规则正文开发前应再次按公开资料交叉核验；本 SDD 规定的是产品结构和展示合同，不把某一套 house rule 固化为唯一标准。

## 9. Edge Cases

- 没有玩家昵称：用玩家 1/2/3…占位。
- 玩家少于某玩法最小人数：玩法置灰并说明原因。
- active 玩家临时离场：转瓶子/随机点名不选 inactive 玩家。
- 切换到 Deck 已耗尽玩法：本地 seed 立即补位；若网络可用可后台 refill。
- AI 返回重复：dedupe/rejection fingerprint 过滤。
- 刷新发生在转瓶动画中：恢复最终选中玩家或回到可再次旋转的稳定状态，不恢复半截动画。
- 刷新发生在默契判断前：恢复 pair/question；分数只在确认“一样”后增加。
- 规则库搜索不到：显示空状态，不调用 AI 猜规则。
- 用户禁用某内置玩法：主局切换面板与混合模式都不再选择它。
- 用户禁用首页原 4 个核心玩法之一：卡片仍在原位置但展示禁用态；点击只提供“重新启用/去游戏包设置”路径。
- 旧 Service Worker + 新 IndexedDB schema 或新 bundle + 旧数据并存：应用先做兼容读取/迁移检查，失败时保留旧记录并安全回退，不白屏、不自动清库。
- AI/自定义文本包含 `<script>`、事件属性、超长字符串或控制字符：作为纯文本显示或被 Schema 拒绝，绝不执行。
- 用户 BYOK：UI 只显示遮罩值；日志/导出/离线缓存中不得出现完整密钥。

## 10. Success Criteria

- **SC-001** 现有 4 Tab、首页 4 核心玩法、设置、尺度 UI 回归测试全部通过。
- **SC-002** active Session 中从任意玩法切到另一个玩法不需要重新输入组局参数。
- **SC-003** 新 4 玩法均可完成至少 10 轮连续操作，无白屏/死循环/明显重复。
- **SC-004** 转瓶子 1000 次 deterministic/randomized test 不选择 inactive 玩家，且无越界索引。
- **SC-005** 默契测试刷新恢复后 pair/score 一致。
- **SC-006** Provider 离线时所有新增 AI 玩法至少可通过本地 seed 开始并继续。
- **SC-007** 规则库首批 8 项均能在 3 次点击内从“游戏包”打开详情。
- **SC-008** 360/390/430px 常见移动宽度无横向溢出，核心按钮可单手点击。
- **SC-009** 新功能不新增底部 Tab、不新增账号/联网房间/云数据库。
- **SC-010** SPEC/PLAN/TASKS traceability 检查无未覆盖 FR。
- **SC-011** 恶意 HTML/脚本 fixture 在所有题卡/规则/昵称渲染路径中均以文本显示或被拒绝，无脚本执行。
- **SC-012** 密钥泄漏审计确认日志、错误对象、导出文件、Service Worker Cache 中均不存在完整 API Key。
- **SC-013** 使用 V1.0/V1.1 Session fixture + 旧缓存场景升级到 V1.2 时，迁移幂等且不会清空有效 Session。
- **SC-014** 禁用任一首页核心玩法后，其卡片仍可见但无法绕过禁用状态启动。
- **SC-015** 在目标 AI 玩法无缓存且断网时，切换后仍能立即从本地 seed 进入可玩状态。
- **SC-016** 安全红队 fixture（强迫饮酒、危险挑战、非自愿接触、未成年人露骨性内容）均被过滤或拒绝。

## 11. Explicitly Out of Scope

- 多人联网投票。
- 每人一台手机同步揭晓。
- 严肃情侣测评/心理诊断式默契分数。
- 新的一套尺度体系。
- 新增 Party Tab。
- 把传统规则库全部做成数字游戏。
- 商业化、账号、支付、社区。
- 技术栈迁移。
- 为了展示 AI/用户内容而引入原始 HTML 执行能力。
- 在 V1.2 内新增年龄画像/身份系统；安全策略以“年龄未知时不生成露骨内容”兜底。

## 12. UI Source of Truth

优先级：

1. **当前已开发 App 的真实页面与交互**（最高，防止增量改版走偏）。
2. 本 SPEC 的交互行为与页面新增要求。
3. 既有方案 A 视觉资产，用于新增组件视觉对齐。
4. 生成式 UI 原型中的示例文字只作视觉参考；与本 SPEC 冲突时以本 SPEC 为准。
