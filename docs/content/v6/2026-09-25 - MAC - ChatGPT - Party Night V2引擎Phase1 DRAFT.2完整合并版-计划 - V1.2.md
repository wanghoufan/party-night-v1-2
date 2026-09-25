# Party Night V2 引擎 Phase1 DRAFT.2｜完整合并版

> R1/R2已闭环；D3/D4已决策；R3–R5继续以本版为准。


---

<!-- SOURCE: 00-Phase1交付总览.md -->

# Party Night V2 Engine Phase 1｜交付总览

## 本次完成

1. V1.3 内容/机制正式冻结；修正 `00-总览.md` 一处 schema 2.2→2.3 笔误，并把已批准的运行时默认值无语义变更地结构化归一到 `runtimeRules`。
2. 冻结包建立 SSOT 优先级与 SHA256 manifest。
3. 完成 V2 Engine Constitution / SPEC / PRODUCT PLAN / TASKS。
4. 完成 FR→R→Task→Test traceability。
5. 完成 Planner state-machine / brownfield / privacy 交叉检查。
6. 生成 Research Reviewer 审查请求与 Human Gate 验收单。

## 当前治理状态

`PROJECT_PHASE=PLAN`  
`PLAN_VERSION=PRODUCT_PLAN_V2.0-DRAFT.2`  
`PLAN_READINESS_SELF_SCORE=95`  
`PLAN_GATE=READY_FOR_RESEARCH_REVIEW`  
`DEV_BASELINE=NOT_SET`  
`BUSINESS_CODE_CHANGED=NO`

## 绝对不要做

- 不要让 Builder 现在开始 T001。
- 不要把 V1.3 旧/历史报告当运行时SSOT。
- 不要把旧16:8:4:2:1 selector和新router并存上线。
- 不要在Research Reviewer之前设置 DEV_BASELINE。
- 不要在Human Gate之前说“第二阶段，开发”。

## 下一治理动作

R1/R2 已完成并形成证据；Research Reviewer / Planner 继续 R3–R5。后续审查必须以 DRAFT.2 为准，不得回退 DRAFT.1。R3–R5 闭环并达到 Readiness Gate 后才进入 Human Gate。


## DRAFT.2 本轮合并

- 合并 R2 状态机补丁：双计数器、20轮结算/+5、`CARD_PRESENTED`、Router 顺序、末段 mutual 抑制、5档 guarantee 机会语义、multiple guarantee 仲裁、specialFlow 互斥。
- 固化 D4=A 产品边界：开局 Player 只录入**昵称 + 性别（男/女）**；Relationship Pair 只允许 active 男女 pair；不询问、不推断、不记录性取向或配对偏好。
- `SYSTEM_MUTUAL_CHECK` 必须提供“暂时没有”；未形成 MATCH 的玩家仍可参加普通 1–4 档，不解锁5档，也不得阻塞其他玩家 MATCH。


---

<!-- SOURCE: 01-CONSTITUTION-V2引擎.md -->

# Party Night V2 Relationship Engine｜CONSTITUTION

> 文档状态：**Phase 1 Planner DRAFT.2 — 禁止开发**  
> 拟议 Constitution 版本：**1.3.0**（Human Gate 批准后生效）  
> PRODUCT_PLAN：`PRODUCT_PLAN_V2.0-DRAFT.2`  
> 输入基线：Party Night V2 题库/机制 **V1.3 冻结版**  
> 变更等级：**Change C｜产品 / 架构变更**

## 0. 本轮治理边界

本轮处于 ORCA Phase 1（PLAN）。**Builder / Code Reviewer / QA 不得开始业务实现，不得改生产代码，不得 Release。** 正常治理链为：Planner → Research Reviewer → Planner 修订 → Readiness Gate → Human Gate。只有用户明确说“第二阶段，开发”后才能进入 DEVELOP。

## I. 继承且不得破坏的产品宪法

1. 保留四个底部 Tab：**首页 / 组局 / 游戏包 / 设置**；V2 Relationship Engine 是后台领域能力，不新增底部 Tab。
2. 保留现有 1–5 开放度 UI；V2 不另造第二套尺度体系。
3. 保留单设备、单桌、local-first、IndexedDB Session、PWA/offline、现有 AI Provider 与 BYOK 安全边界。
4. 保留 Party Game Engine 与 Game Pack 解耦；V2 是 Engine 能力扩展，不复制第二套 App / 第二套 Session / 第二套存储。
5. 同一 Session 切换玩法不得重新设置玩家、关系、氛围、开放度，也不得丢失 V2 Relationship State。
6. 不引入账号、支付、云数据库、多人实时房间、跨设备秘密投票、向量库或新的全局状态框架。

## II. V2 Relationship Engine 不可违反的硬规则

1. **SSOT**：运行时默认值与算法参数只读取 `10-卡片元数据.json.runtimeRules`；不得在 UI、selector、test fixture 中再维护一份手写常量作为第二事实源。
2. **Heat**：Session Heat 只有 `H1/H2/H3/H4`；**不存在全桌 H5**。
3. **Intensity**：玩家选择的 1–5 是允许内容的上限，不是当前 Heat，也不是抽卡概率。
4. **5档**：只对满足逐卡合法条件的具体 pair 开放；不能因时间、全桌投票或单向选择自动开放。
5. **MATCH**：只有 `SYSTEM_MUTUAL_CHECK` 中双方分别秘密选中彼此才创建；Crowd/Shared/Compatibility/Personal 均不得升级成 MATCH。
6. **Pair Scope（D4=A）**：V2 Relationship Engine 只建立 active **一男一女** Pair。开局 Player 只要求 `昵称 + 性别（男/女）`；系统**不询问、不推断、不记录**性取向、偏好性别或恋爱取向。
7. **Mutual Choice**：秘密互选时，每位玩家只能从当前合法异性玩家中选择 1 人，或选择“暂时没有”。没有双向互选就是没有 MATCH；系统不需要知道原因。
8. **No-MATCH Independence**：未形成 MATCH 的玩家仍可参加普通 1–4 档内容，但不获得该 Pair 的5档解锁；任何单个玩家没有 MATCH、持续选择“暂时没有”或跳过，都不得阻塞其他玩家形成 MATCH。
9. **MATCH Semantics**：MATCH 是“当前愿意继续了解”，不是恋爱标签、排他关系、身体接触许可；同一玩家允许与不同对象形成 Session-level MATCH。
10. **Consent**：身体接触、靠近、移动到对方身边、持续对视、拍照/录像等具体动作必须当场再次同意；无共同动作交集就跳过，不自动替换。
11. **Skip**：永远合法、不罚酒、不扣分、不解释；跳过不得锁死其他人的 Heat 或 `SYSTEM_MUTUAL_CHECK`。
12. **Privacy**：单向秘密选择只在当前私密流程内短暂存在；完成匹配判断后立即删除，不写长期历史，不上传第三方分析。
13. **Signals 分离**：Shared / Compatibility / Crowd / Personal / Mutual 语义和权重分离；眼神、笑、靠近等行为事件不得推断为“喜欢”。
14. **Routing Score**：仅代表“下一轮安排优先级”，不得对用户展示成爱情概率、匹配率或兼容百分比。
15. **One-off Mutual**：`one-off-mutual` 只解锁当轮一次性动作/加赛，不创建持久 MATCH。

## II-A. Session Cadence（D3=A）

- 默认结算点为 **20 个 completed rounds**；到点由 Host 选择“结束本局 / 再玩5轮”。
- 运行时必须拆分 `sessionCompletedRounds` 与 `relationshipEffectiveCardCount`；neutral / expansion 的 completed round 可计入前者，但不推进后者。
- Skip / Swap 不增加 completed round，也不增加 relationship effective count。
- Relationship Heat 使用20轮基准：0–3=H1、4–7=H2、8–12=H3、13+=H4；延长 +5 后 Heat **只升不降**。

## III. 私密输入的唯一例外

既有产品原则是“手机是 Party 主持人，不要求日常逐人录入”。V2 仅允许两个最小例外：

- `SYSTEM_MUTUAL_CHECK`：单设备传手机、逐人私密选择；
- `private-mutual-only`：双方分别选择当次可接受动作/加赛。

除此之外，真心话、投票、默契等继续优先维持 Host 驱动或公开互动，不把全局体验改造成“每题每人低头点手机”。

私密流程必须满足：遮挡上一位答案 → 当前玩家确认身份 → 作答 → 明确提交 → 立即遮罩 → 传给下一位。刷新/崩溃时不得恢复已输入的单向秘密答案；未完成私密事件直接作废。

## IV. Relationship-aware 与 Neutral Pack

为了保护现有插件式 Game Pack 架构：

- V1.3 的 7 类主线题库属于 `relationship-aware`，可参与 Heat / Pair / Signal / MATCH / 5档路由。
- 扩圈卡使用独立规则：不进入 Pair Score / MATCH；Phase 1 默认**不推进 Relationship Heat，也不计入 `SYSTEM_MUTUAL_CHECK` 的有效卡间隔**。
- AI 即兴、转瓶子、自定义包及未声明 V2 元数据能力的玩法默认为 `neutral`：继续可玩，但**暂停** Relationship Heat/Signal 的推进；切回 V2 主线玩法后恢复原 Relationship State。
- 后续任何 Pack 想进入 Relationship Engine，必须实现同一 Card Metadata Contract，而不是在 Engine 里写 pack-specific 特例。

## V. 动态路由与离线能力

1. V2 核心玩法不得继续使用“整局预先固定好下一张卡顺序”的旧关系主线逻辑；因为合法候选会随 Heat、Coverage、Pair、Signal、MATCH 改变。
2. 离线能力不下降：350 张主线 + 40 张扩圈本地预载；**每轮在本地候选池动态路由**，无需联网。
3. AI 整局预生成能力可继续服务 neutral pack；它不得绕过 V2 主线的元数据门禁。

## VI. 持久化与敏感状态

允许持久化到 IndexedDB 的 V2 状态：Heat、完成计数、coverage 计数、非原始的聚合 signal、MATCH pair、cooldown、已用 cardId、5档保障进度。

禁止持久化：单向秘密选择原文/对象、未提交的私密动作选择、被拒绝的单边 consent 选项。

Session 结束必须清除 Relationship Graph、MATCH、秘密事件状态；若未来要“保存战绩”，必须作为独立显式 opt-in Change C/B 再设计。

## VII. Brownfield 迁移宪法

1. 当前生产 V1.6 已上线；V2 必须增量迁移，不重做四 Tab、PWA、Provider、IndexedDB 基础设施。
2. 旧 `16:8:4:2:1` / `INTENSITY_WEIGHT` / 固定 4–5档 70% / 全桌H5 / DOUBLE MATCH 等旧路由必须从生产可达路径删除，不能与 V2 双跑。
3. 既有 Active Session 必须事务化迁移；迁移失败不得清空用户数据。
4. 旧 Session 不生成任何“推测型”关系信号。迁移后 Signal/MATCH 初始为空；保留玩家、设置、已完成历史与可安全映射的当前玩法。
5. 若刷新时处于私密选择中，私密事件作废并返回安全主局，不恢复单边答案。
6. PWA/IndexedDB 版本错位保护继续保留；发布时 `package.json` / `public/sw.js` / `public/version.json` 版本联动规则继续有效。

## VIII. 可调参原则

以下均是**可测试默认值**，不是产品真理，禁止散落硬编码：首次互选卡数、互选间隔、最大常规互选次数、Coverage 比例、low-participation 阈值、drawBands、Pair Cooldown、小局降权、MATCH 5档保障窗口。

它们必须由 V1.3 `runtimeRules` 或其受控 schema 承载；真人局内测后可以在不重写引擎的情况下调整。

### 当前 runtimeRules 快照（只为审查展示；实现仍读取 JSON SSOT）

```json
{
  "coverageGate": {
    "mode": "opportunity-based",
    "qualifyingTargetModes": [
      "system-opposite-sex",
      "choose-opposite-sex",
      "system-pair",
      "signal-pair",
      "match-pair"
    ],
    "h3AndMutualCheckRequirement": "each-active-player-offered-at-least-1-qualifying-targeted-opportunity",
    "skipCountsAsOpportunity": true,
    "skipCountsAsCompletedInteraction": false,
    "consecutiveTargetedSkipsBeforeLowParticipation": 2,
    "lowParticipationDoesNotBlockHeatOrMutualCheck": true
  },
  "drawBands": {
    "H1": {
      "1": 1.0
    },
    "H2": {
      "2": 0.8,
      "1": 0.2
    },
    "H3": {
      "3": 0.75,
      "2": 0.25
    },
    "H4": {
      "4": 0.6,
      "3": 0.3,
      "5": 0.1,
      "intensity5OnlyWhenLegal": true,
      "renormalizeUnavailableBuckets": true
    },
    "matchPairDedicated": {
      "5": 0.7,
      "4": 0.3
    }
  },
  "chemistryCompatibility": {
    "intensity1to3": "0.25 per correct directional prediction; max 0.5 per card; pair routing bonus cap +1",
    "card40": "if both revealed preferences match, add 0.5 compatibility evidence",
    "cards41to49": "no compatibility routing effect; MATCH-only experience cards"
  },
  "heatProgression": {
    "fixedRoundProgress": {
      "H1": {
        "minInclusive": 0.0,
        "maxExclusive": 0.2
      },
      "H2": {
        "minInclusive": 0.2,
        "maxExclusive": 0.4
      },
      "H3": {
        "minInclusive": 0.4,
        "maxExclusive": 0.65
      },
      "H4": {
        "minInclusive": 0.65,
        "maxInclusive": 1.0
      }
    },
    "openEndedEffectiveCards": {
      "H1": {
        "min": 0,
        "max": 3
      },
      "H2": {
        "min": 4,
        "max": 7
      },
      "H3": {
        "min": 8,
        "max": 12
      },
      "H4": {
        "min": 13
      }
    },
    "globalHeatMax": "H4"
  },
  "targetedScheduling": {
    "h1h2MinTargetedRatio": 0.4,
    "maxConsecutiveAllPlayerCards": 2
  },
  "mutualCheckScheduler": {
    "firstEligibleEffectiveCardCount": 9,
    "minimumHeat": "H3",
    "minimumEffectiveCardsBetweenRuns": 5,
    "maxRegularRuns": 3,
    "prioritizeAfterNewPersonalSignal": true,
    "finalCheckAtSessionEnd": true
  },
  "intensity5Unlock": {
    "requiresPlayerMaxIntensity": 5,
    "pairSpecificOnly": true,
    "newMatchGuaranteeWithinQualifyingPairOpportunities": 2
  },
  "pairRouting": {
    "formula": "coverageBonus + signalBonus - cooldownPenalty",
    "defaultPairCooldownRounds": 2,
    "coverageBonus": {
      "neverInteracted": 3,
      "lowExposure": 2
    },
    "signalBonus": {
      "sharedPerHit": 0.5,
      "sharedCap": 1.0,
      "compatibilityPerHit": 0.5,
      "compatibilityCap": 1.0,
      "crowdPerHit": 1.0,
      "crowdCap": 2.0,
      "personal": 2.0,
      "personalCap": 2.0,
      "match": 5.0
    },
    "cooldownPenalty": {
      "previousRoundSamePair": 4,
      "samePairTwoConsecutiveRounds": 10
    },
    "smallPool": {
      "maxAvailableOppositeSexPairs": 6,
      "personal": 1.0,
      "personalCap": 1.0,
      "match": 3.0,
      "crowdPerHit": 0.5,
      "crowdCap": 1.0,
      "sharedAndCompatibilityUnchanged": true,
      "matchStillObeysCooldown": true
    }
  },
  "signalFilters": {
    "shared": {
      "positiveResponsesOnly": true,
      "globalPositiveConsensusThreshold": 0.8,
      "bothNegativeDoesNotCount": true
    },
    "eitherCompatibility": {
      "globalConsensusThreshold": 0.8,
      "minimumInformativeCoAnswers": 3,
      "excludeSkippedAnswers": true,
      "privateCardNumbersExcluded": [
        41,
        42,
        50
      ]
    }
  },
  "mostLikely50OneOff": {
    "createsMatch": false,
    "unlocksExactlyOnePairedCard": true,
    "maxIntensity": 4,
    "excludeBoundaryTags": [
      "physical-contact",
      "proximity",
      "photo-video"
    ]
  }
}
```

## IX. 治理与变更

- Authority：Constitution > SPEC > PLAN > TASKS > 临时实现决定。
- 但**数值型 runtime defaults** 的唯一事实源是冻结的 JSON `runtimeRules`；Constitution 只规定不可变语义与边界。
- 若 Constitution 与 runtimeRules 发生语义冲突，视为 Phase 1 阻断，不允许 Builder“选一个看起来合理的”。
- Phase 2 中修改 MATCH 语义、Heat 状态、信号类型、隐私生命周期、SSOT、Session 迁移策略属于 Change C，必须受控重开 PLAN。

## X. Constitution Check（PLAN 必须全部 PASS）

- [ ] 四 Tab / local-first / PWA / Engine-Pack 解耦未破坏。
- [ ] 1–5 开放度 UI 不重做。
- [ ] Session Heat 仅 H1–H4；默认20 completed rounds，+5延长不回退。
- [ ] Player 仅需昵称+男/女性别；不存在性取向/配对偏好字段。
- [ ] Relationship Pair 仅 active 男女 pair；无合法异性pair时安全降级。
- [ ] Mutual Check 必须允许“暂时没有”；单个玩家无MATCH不阻塞别人。
- [ ] 5档只按 pair-specific legality 解锁。
- [ ] MATCH 仅由秘密双向选择形成。
- [ ] Skip 不锁死全桌流程。
- [ ] 私密原始答案不持久化。
- [ ] current consent 与 MATCH 分离。
- [ ] runtimeRules 无第二份手写真源。
- [ ] Neutral pack 不污染 Relationship Engine。
- [ ] 旧指数抽法与旧关系逻辑从可达路径删除。
- [ ] 旧 Session 迁移非破坏。
- [ ] FR → Module → Task → Test 可追踪。
- [ ] Phase 1 未启动 Builder/业务代码修改。

**Ratification**：待 Research Reviewer + Human Gate。  


---

<!-- SOURCE: 02-SPEC-V2引擎.md -->

# Party Night V2 Relationship Engine｜SPEC

> 状态：Phase 1 DRAFT.2｜R1/R2 已闭环，继续 R3–R5  
> 基线：V1.3 Frozen｜schema 2.3  
> 目标：把已经冻结的题库/规则变成**可实现、可测试、可迁移**的关系推进引擎；本文件不授权开发。

## 1. Product Intent

用户仍然在熟悉的 Party Night 四 Tab 和“组局”主局里玩。V2 不增加新的产品入口，而是在同一 Session 内让核心 7 个玩法从“随机抽题”升级为：

**公平破冰 → 共同点/偏好 → 主动选择 → 群体观察 → 系统秘密互选 → MATCH → pair 专属5档 → 当场动作同意 → 结束清理。**

## 2. Actors

- **Host**：拿着唯一一台手机、控制开始/下一题/切玩法/暂停/结束。
- **Player**：参与题目；开局最小资料仅为 `nickname + gender(male|female)`；在私密事件时短暂接过同一台手机。系统不询问/记录性取向或偏好性别。
- **Pair**：两个 active、性别不同的玩家组成的 Relationship Pair；不是永久配对。同性玩家之间不进入 Relationship Pair / MATCH / 5档链路。
- **System Event**：不属于普通随机题的系统流程，如 `SYSTEM_MUTUAL_CHECK`、final mutual check、private consent intersection。

## 3. Pack Capability

### 3.1 relationship-aware

V1.3 七类主线。卡片必须有 schema 2.3 metadata；可推进 Heat、Coverage、Signal、Pair Routing、MATCH、5档。

### 3.2 expansion

40 张扩圈卡。使用 `10b-扩圈元数据.json`；不进入 Pair Score/MATCH。默认不推进 Heat / mutual-check interval。

### 3.3 neutral

AI 即兴、转瓶子、自定义 pack 及任何没有 V2 Card Metadata Contract 的 pack。正常可玩、可完成/跳过/切换，但 Relationship Heat 和 Signal 暂停，返回 relationship-aware pack 后继续。

## 4. Functional Requirements

### Session / Heat

- **FR-V2-000A（D3）**：默认 Session 结算点为20个 completed rounds；到点先由Host选择“结束 / 再玩5轮”。+5只延长 session target，不降低 Heat。
- **FR-V2-000B（计数）**：必须分离 `sessionCompletedRounds` 与 `relationshipEffectiveCardCount`；Skip/Swap不增加任一计数；neutral/expansion completed只增加前者。
- **FR-V2-000C（D4）**：Player 创建/加入 Session 时只录入昵称与男/女性别；不得新增 `sexualOrientation / preferredGender / datingPreference` 等字段。Relationship Pair 仅允许 active opposite-sex pair；若当前0个合法异性pair，Relationship Engine 状态为 `inactive_no_eligible_pair`，neutral玩法仍可继续。

- **FR-V2-001**：Session 新建时创建 `relationshipState`，初始 Heat=H1、signals=空、matches=空、cooldowns=空。
- **FR-V2-002**：Intensity 继续使用现有 1–5 UI，仅作为卡片允许上限。
- **FR-V2-003**：Heat 只允许 H1→H2→H3→H4，不存在 H5。
- **FR-V2-004**：relationship-aware 卡完成后按现有总轮数/有效卡规则推进 Heat；neutral / expansion 默认不推进。
- **FR-V2-005**：`heatMin/heatMax` 是硬过滤；drawBands 是合法候选中的软权重。
- **FR-V2-006**：H1/H2 定向机会比例满足 runtimeRules；skip 算 offered opportunity，不算 completed interaction。
- **FR-V2-007**：连续定向 skip 达阈值后标记 `low-participation`；不能阻塞其他玩家升温或互选。

### Card Router

- **FR-V2-008**：每轮顺序固定为：Pack capability → Intensity → Heat → target/pair → metadata legality → Coverage/Cooldown → drawBand → random/select。
- **FR-V2-009**：禁止旧 `16:8:4:2:1` 或固定 4–5档 70% 参与选择。
- **FR-V2-010**：当前 bucket 无合法卡时只能按 runtimeRules 重新归一化/向合法较低档回退，不得越权放更高档。
- **FR-V2-011**：已用卡/换题/跳过的现有去重语义继续保留，但不得破坏 V2 legality。

### Pair / Signals

- **FR-V2-012**：Pair Engine 输出的是下一轮 pair 候选优先级，不输出“喜欢概率”。
- **FR-V2-013**：Coverage / Signal / Cooldown 三部分分别计算后合成 Routing Score。
- **FR-V2-014**：可用异性 pair≤6 时自动应用 runtime small-pool 降权；MATCH pair 仍受 cooldown。
- **FR-V2-015**：Shared / Compatibility / Crowd / Personal / Mutual 分库存储，不互相升级。
- **FR-V2-016**：只有 V1.3 metadata 的 `signalEffects` 可以修改 signal；行为动画/眼神/靠近本身不产生好感 signal。
- **FR-V2-017**：signal cap 必须执行，避免热门 pair 越滚越热门。

### SYSTEM_MUTUAL_CHECK / MATCH

- **FR-V2-018**：首次 mutual check 由 runtimeRules 条件触发，是系统事件，不依赖抽到 #50。
- **FR-V2-019**：Host 启动后，屏幕按玩家逐个进入“交给 X → 准备 → 私密选择 → 提交 → 遮罩”的流程。
- **FR-V2-020**：每位玩家可选一位当前合法异性或“暂时没有”；系统不要求解释原因，也不推断性取向。
- **FR-V2-020A**：某玩家选择“暂时没有”、持续不形成MATCH或持续跳过，不得阻塞其他玩家的 mutual check / MATCH。该玩家仍可参与普通1–4档，但没有MATCH就不进入该Pair的5档。
- **FR-V2-021**：本轮所有有效选择完成后，仅计算 A→B 且 B→A 的双向边；创建 Session MATCH。
- **FR-V2-022**：单向答案绝不公开；计算后立即从内存删除，不写 IndexedDB。
- **FR-V2-023**：同一玩家允许同时存在多个不同 pair MATCH；MATCH 不排他。
- **FR-V2-024**：常规 mutual check 间隔/次数与 final check 读取 runtimeRules；final check 在 Session 结束前保证一次。
- **FR-V2-025**：刷新/崩溃发生在 mutual check 中时，未完成私密事件作废；恢复主局，不恢复部分答案。

### 5档 / Consent

- **FR-V2-026**：MATCH + Intensity=5 后，该 pair 合法5档进入候选；不得全桌解锁。
- **FR-V2-027**：新 MATCH 的 5档最低出场保障必须跟踪“接下来2次合格双人机会”，在窗口内至少优先出1张合法5档；玩家 skip 不强迫补做同一张。
- **FR-V2-028**：MATCH 专属回合使用 runtime drawBand；5档卡仍需逐卡 consent/target/match legality。
- **FR-V2-029**：`private-mutual-only` 只显示双方选择交集；无交集→no action / continue；不创建 MATCH。
- **FR-V2-030**：具体身体/距离动作在执行前再次 current consent；拒绝不暴露是哪一方。
- **FR-V2-031**：`PN-MOST-050` 只能创建 one-off paired bonus：最高4档、无身体接触/近距离/拍照，不创建 MATCH。

### Session / Persistence / Privacy

- **FR-V2-032**：允许持久化聚合 relationshipState；禁止持久化原始单向私密选择和未提交 consent。
- **FR-V2-033**：暂停/刷新后恢复 Heat、聚合 signals、matches、cooldowns、usedCardIds、5档保障进度。
- **FR-V2-034**：Session end 清空 relationship graph、MATCH、秘密事件临时状态；普通历史/总结按现有产品规则保留。
- **FR-V2-035**：默认不把 Pair Signal/MATCH/秘密答案发到第三方 analytics/AI。

### Brownfield Migration

- **FR-V2-036**：V1.6 Session schema 迁移必须事务化；失败不得清空原记录。
- **FR-V2-037**：迁移保留玩家、关系、氛围、Intensity、active pack、可安全保留的 RoundHistory；V2 signals/MATCH 从空开始，绝不根据旧历史猜测。
- **FR-V2-038**：旧固定 deck 的未来顺序不再作为 V2 relationship-aware 主线；迁移完成后下一次选卡进入 V2 router。
- **FR-V2-039**：若迁移时存在一张已展示的 legacy current card，可允许完成/跳过一次，但它不产 V2 signal；之后切 V2 router。
- **FR-V2-040**：旧生产路径中的指数权重、全桌H5、DOUBLE MATCH、自动替换动作等全部不可达。

### Existing Product Regression

- **FR-V2-041**：四 Tab、主页、组局配置、游戏包、设置、Provider、PWA、offline、PackSwitcher 不因 V2 改版重做。
- **FR-V2-042**：同 Session 切到 neutral pack 时 Relationship State 暂停但不清空；切回继续。
- **FR-V2-043**：本地 350+40 数据在无网环境可完整路由。
- **FR-V2-044**：安全文本渲染、BYOK、Service Worker API exclusion、版本号三处联动规则继续通过原 regression。

## 5. Conceptual Data Model

```text
Session.relationshipState
  heat: H1|H2|H3|H4
  effectiveCardCount
  lastMutualCheckAtCount
  regularMutualCheckRuns
  playerCoverage[playerId]
    offeredTargeted
    completedTargeted
    consecutiveTargetedSkips
    lowParticipation
  pairState[pairKey]
    sharedEvidence
    compatibilityEvidence
    crowdEvidence
    personalEvidence
    matched
    matchedAt
    cooldownRounds
    pendingFiveGuarantee
      eligiblePairOpportunitiesRemaining
      satisfied
  usedCardIds
```

**不进入持久化：** `pendingPrivateAnswers`, `partialConsentSelections`, unilateral secret target。

## 6. State / Event Model

正常 Session 状态与 Heat 分离：

```text
sessionStatus = active | paused | ended
heat = H1 | H2 | H3 | H4
specialFlow = none | mutual-check | one-off-mutual | consent-intersection | final-mutual-check
```

主要事件：

`CARD_PRESENTED` / `CARD_COMPLETED` / `CARD_SKIPPED` / `CARD_SWAPPED` / `PACK_SWITCHED` / `HEAT_REEVALUATE` / `SYSTEM_MUTUAL_CHECK_DUE` / `PRIVATE_CHOICE_SUBMITTED` / `MATCH_CREATED` / `MATCH_UPDATED` / `CONSENT_INTERSECTION_DONE` / `PLAYER_TEMP_AWAY` / `PLAYER_RETURNED` / `SESSION_PAUSED` / `SESSION_RESUMED` / `SESSION_END_REQUESTED` / `SESSION_ENDED`。`CARD_PRESENTED` 是 Coverage offered 的唯一记录时点。

## 7. Private UI Flow

### Mutual Check

1. Host 看到“现在进行一次私密选择，不公开单向答案”。
2. 屏幕显示“请把手机交给 Alex”。
3. Alex 点“只有我能看到”进入选择页。
4. 选择一位合法异性 / 暂时没有 → 二次确认提交。
5. 提交后立即显示遮罩页“已记录，请交给下一位”，不能返回查看。
6. 全员完成后，系统仅显示新产生的 mutual match；若无新 mutual，显示“选择完成，继续玩”，不说谁没选谁。

### Consent Intersection

双方分别私密勾选可接受动作；系统只显示交集。无交集时显示“这轮不做动作，继续玩”，不揭示单边拒绝。

## 8. Error / Recovery

- metadata/schema 加载失败：relationship-aware pack 不得降级到旧 selector；显示“V2题库校验失败”，允许切 neutral pack/退出，但不能绕过安全规则。
- 私密流程刷新：丢弃 partial answers，恢复到普通 active session；下次按调度器重新触发。
- IndexedDB migration 失败：保留原记录，不写半迁移状态；提示恢复/重试，不清库。
- 当前合法候选为空：按合法较低档/pack capability fallback；不得恢复旧权重算法。

## 9. Non-Goals

- 不做跨手机秘密投票。
- 不做账号/云同步/服务端关系图。
- 不做 ML/AI 猜“谁喜欢谁”。
- 不把 AI 即兴强行迁成 relationship-aware。
- 不重做 UI 视觉系统、四 Tab、Provider。
- Phase 1 不改业务代码。

## 10. Acceptance Scenarios

1. 4人局，一人连续跳过2次定向题或每次秘密互选都选“暂时没有”：其他玩家仍能在满足计数后进入 mutual check / MATCH；该玩家仍可参与1–4档。
2. 2男2女 / 3男2女 / 4男1女均按实际合法异性pair池运行；全男/全女时Relationship Engine安全降级，不空转。
3. 5人局有新 MATCH：该 pair 在后续2次合格 pair opportunity 内至少获得1次合法5档优先机会；但 cooldown 仍有效。
3. Crowd 多次投同一 pair：只增加封顶 Crowd，永不自动 MATCH。
4. 双方 consent 没共同选项：不执行任何动作，不自动降级成“对视5秒”。
5. mutual check 刷新：之前几个人的单边选择无法恢复、无法泄露。
6. Session 切转瓶子再切回真心话：Heat/Match 不丢，但转瓶子期间不前进 Heat。
7. 离线：350张主线仍能按 Heat/Pair 动态路由。
8. V1.6 active session 升级：玩家/设置/历史保留，signals/matches 为空，不再使用旧陡坡 selector。


---

<!-- SOURCE: 03-PLAN-V2引擎.md -->

# Party Night V2 Relationship Engine｜PRODUCT PLAN

> PLAN_VERSION：**PRODUCT_PLAN_V2.0-DRAFT.2-DRAFT**  
> PROJECT_PHASE：**PLAN**  
> CHANGE_REQUEST：**C｜核心抽卡/Session 关系状态架构升级**  
> DEV_BASELINE：**未建立；Human Gate 前禁止设置**  
> 输入：V1.3 Frozen + 当前生产 V1.6 brownfield 代码  
> 目标状态：`READY_FOR_RESEARCH_REVIEW`

## 1. Summary

这不是“把350张新题替换到现有 seed 数组”这么简单。当前生产 V1.6 仍使用旧的高档陡坡/固定 deck 思路；V2 要新增 Relationship Engine，让下一张合法卡由 Heat、Coverage、Pair、Signal、MATCH、Consent 动态决定。

**增量原则：**保留现有 Next.js/React/TypeScript、四 Tab、Party Game Engine、PackSwitcher、IndexedDB、PWA、AI Provider；只重构 V2 主线卡选择与关系状态层。

## 2. 已核验 brownfield 事实

Phase 1 已读取并确认：

- `AGENTS.md`：Change C 必须走 Planner → Research Reviewer → Human Gate；Phase 1 禁 Builder/业务改动。
- `docs/handoff/HANDOFF.md`：生产 V1.6 已上线；当前种子350张，旧抽法为 `16:8:4:2:1`；四 Tab、local-first、Session v2、PWA 等必须保护。
- `package.json`：Next.js 16.3.3 / React 19 / TypeScript / Zod / idb / Vitest / Playwright。
- `lib/game-packs/built-in-seeds/index.ts`：当前 350 题仍以 TypeScript 硬编码种子 + 固定强度前缀为运行来源，注释明确依赖旧陡坡。

**尚未在 Phase 1 强行猜测的路径**：当前 Session reducer、card selector、IndexedDB repository、PackSwitcher 的实际最终文件路径。Phase 2 的 T001 必须先做 path mapping；PLAN 按模块职责而非臆造文件路径绑定。

## 3. Architecture Decision

### 3.1 SSOT Adapter

新增一个只读 `V2ContentAdapter`：

- 输入唯一为冻结 `10-卡片元数据.json` / `10b-扩圈元数据.json`；
- Zod 校验 schema=2.3、cardId 唯一、runtimeRules 完整；
- RuntimeConfig 从 `runtimeRules` 解析；代码里不得复制一份手写数字常量；
- 若工程不适合直接从 docs import，可使用**生成文件**，但生成物不可手改，并用 hash/test 证明与 SSOT 一致。

### 3.2 Relationship State Slice

在现有 Session 模型内新增 `relationshipState`，而不是创建第二个 Session store。它只维护 Heat、Coverage、pair aggregate state、cooldown、matches、used card ids、5档保障；私密原始答案永不持久化。

### 3.3 Heat / Coverage Engine

纯函数：`nextHeat(state, runtimeRules, sessionProgress)`、`recordOpportunity`、`recordCompletion/skip`。Heat 与 Intensity 分离。

### 3.4 Pair Engine

D4=A 固化：Player最小字段只含 `nickname` 与 `gender: male|female`。Pair Engine 仅构建 active opposite-sex pair；不存性取向/配对偏好。若合法异性pair池为空，返回 `inactive_no_eligible_pair`，不重试、不回退到同性Pair，neutral pack可继续。

纯函数计算：`CoverageScore + SignalBonus - CooldownPenalty`。小局权重读取 config；最终 selector 只得到 pair priority，不得到爱情评分。

### 3.5 Signal Engine

只接受 metadata `signalEffects` 的显式事件。各 signal 独立累计和封顶。CHEM 41–49 不再加 Compatibility。

### 3.6 Card Router

把当前“固定 deck/陡坡”职责改造成**动态 eligibility + weighted draw**：

1. capability；2. Intensity；3. Heat；4. target/pair；5. card metadata legality；6. coverage/cooldown；7. drawBands；8. random。

V2 relationship-aware pack 依赖动态 router；neutral pack 可继续原 deck 能力。

### 3.7 Private Flow Engine

不进入持久化 store 的 ephemeral controller，承载 mutual check / one-off mutual / consent intersection。刷新即丢弃 partial answers。

### 3.8 Match Engine

只处理明确 mutual result；维护 non-exclusive pair MATCH 与 5档 guarantee。`SYSTEM_MUTUAL_CHECK` 是 scheduler event，**不得塞进普通 card draw**。

### 3.9 Migration Adapter

事务化把 V1.6 Session 扩展到 V2 relationship state；旧 future deck 不再驱动 relationship-aware 下一张卡。旧 signals 不推断。

## 4. R 条目 + DoD

### R-001｜冻结 SSOT 接入
**Requirement**：V2 runtime 只从 schema 2.3 JSON 读取 cards/runtimeRules。  
**DoD**：启动/测试能验证350+40数量、schema、cardId唯一；手改第二份 runtime 常量会被测试发现。

### R-002｜Session Heat State Machine
**Requirement**：Heat H1–H4 独立于 Intensity。  
**DoD**：所有合法转移有测试；不存在 H5；neutral/expansion 不误推进。

### R-003｜Coverage Gate
**Requirement**：opportunity-based；skip算机会、不算完成。  
**DoD**：1名玩家连续skip不阻塞其他人H3/mutual check；low-participation逻辑可恢复。

### R-004｜Draw Bands
**Requirement**：heatMax硬过滤 + runtime drawBands软权重。  
**DoD**：H3/H4 bucket按SSOT配置；非法5档抽取概率严格为0；无桶时正确归一化。

### R-004A｜Session Cadence / Counters
**Requirement**：D3=A；20 completed rounds结算，允许+5；双计数器；Heat单调不降。  
**DoD**：neutral不推进relationship count；skip/swap不涨完成轮；20/+5边界测试通过。

### R-004B｜Player / Pair Scope
**Requirement**：D4=A；nickname+binary gender；仅异性Pair；无性取向/偏好字段。  
**DoD**：2M2F/3M2F/4M1F正常；全男/全女安全降级；一个玩家无MATCH不阻塞其他人。

### R-005｜Pair Engine
**Requirement**：公平优先 + signal bonus + cooldown，小局降权。  
**DoD**：≤6 pair使用小局权重；MATCH不能绕过cooldown；score不暴露给UI。

### R-006｜Signal Separation
**Requirement**：Shared/Compatibility/Crowd/Personal/Mutual分离。  
**DoD**：每类只有允许事件能改变；Crowd/Personal不能创建MATCH；cap测试通过。

### R-007｜SYSTEM_MUTUAL_CHECK
**Requirement**：独立 scheduler，首次/间隔/次数/final由runtimeRules控制。  
**DoD**：不依赖#50；满足条件会due；不满足不触发；final总能触发一次。

### R-008｜Private Choice UX + Privacy
**Requirement**：单设备传手机，单向选择不持久化。  
**DoD**：前一位答案不可回看；刷新丢弃partial；IndexedDB fixture中无unilateral choice。

### R-009｜MATCH + 5档保障
**Requirement**：mutual only；5档pair-specific。  
**DoD**：新MATCH后2次`qualifyingPairOpportunity`内至少一次5档优先机会；机会必须是pair已实际被选、双方active、cooldown允许、maxIntensity=5且存在合法5档。第一次未出5档时第二次仍合法则force-priority 5；multiple guarantees按matchedAt→least-recent pair仲裁且仍受cooldown。Intensity<5时不解锁；final mutual新MATCH不创建本局guarantee。

### R-010｜Consent Intersection
**Requirement**：只执行双方交集；无交集no-action。  
**DoD**：单边拒绝不泄露；无自动替代动作；MATCH不绕过current consent。

### R-011｜MOST-050 One-off Mutual
**Requirement**：群众结果只能创造一次最高4档安全加赛。  
**DoD**：不创建MATCH、不触发5档、不出现physical/proximity/photo卡。

### R-012｜Neutral Pack Compatibility
**Requirement**：AI即兴/转瓶子/自定义包继续可玩但不污染Relationship State。  
**DoD**：切入neutral Heat暂停；切回state原样；现有pack switch不重开Session。

### R-013｜Offline Dynamic Routing
**Requirement**：V2不靠在线AI；本地卡库逐轮动态选卡。  
**DoD**：断网情况下完整跑Heat/match/5档路径；无需预先固定40张关系牌顺序。

### R-014｜V1.6 Migration
**Requirement**：事务化、非破坏。  
**DoD**：players/config/history保留；signals/matches空；legacy current card最多完成一次neutral；失败原数据未删。

### R-015｜Legacy Removal
**Requirement**：删除/断开旧V1.6关系路由。  
**DoD**：以下均无生产可达引用：`INTENSITY_WEIGHT 1/2/4/8/16`、`16:8:4:2:1`、4–5档固定70%、全桌H5、Crowd/Personal→MATCH、无交集自动换动作、private Either长期Compatibility、都没做过→Shared、DOUBLE MATCH、secret unilateral持久化。

### R-016｜Existing Regression
**Requirement**：四Tab/PWA/Provider/IndexedDB/PackSwitch/安全渲染不回退。  
**DoD**：既有 regression + 新V2 regression 全PASS。

### R-017｜Sensitive Session Cleanup
**Requirement**：Session结束删除relation graph/MATCH/private ephemeral。  
**DoD**：结束后重新读取IndexedDB不存在敏感relation state；新局从空开始。

### R-018｜Observability for Tuning
**Requirement**：允许本地、非敏感的调参诊断，不记录谁选谁。  
**DoD**：可输出匿名计数（Heat停留、mutual check触发次数、bucket命中、skip计数），默认不上传，日志不得含player→target秘密边。

## 5. Migration Matrix

| 现有能力 | V2动作 | 说明 |
|---|---|---|
| 四Tab/UI shell | 保留 | 不重做IA |
| Session/IndexedDB | 扩展 | 增 relationshipState + migration |
| Game Pack registry | 保留/扩展capability | relationship-aware / neutral |
| `lib/game-packs/built-in-seeds/index.ts` 旧350 | 从V2主线运行路径替换 | V1.3 JSON成为主线SSOT；旧陡坡注释/前缀不再驱动 |
| 固定40张/整局关系牌顺序 | relationship-aware路径重写 | 改动态router；offline仍在 |
| AI whole-deck | neutral路径保留 | 不驱动V2 signals/match |
| completion/swap/skip | 保留 | 接入V2事件语义 |
| PackSwitcher | 保留 | 切neutral暂停relationship推进 |
| 旧强度陡坡 | 删除 | 被runtime drawBands替代 |
| PWA/Provider/BYOK | 保留 | regression only |

## 6. Runtime Config Strategy

实现不得手写这些值：首次互选=9、间隔=5、常规最多=3、coverage模式、drawBands、小局权重、cooldown、5档保障窗口。Phase 2 adapter读取 `runtimeRules` 并转换成强类型 config。

Research Reviewer / Human Gate 前若发现任何实现所需 runtime 参数只存在于 prose、未进入 JSON SSOT，则 **Phase 1 直接阻断并补齐**；不得把该缺口带入 DEV_BASELINE，更不得由 Builder 从 prose 抄常量到代码。

## 7. Test Strategy

### Unit / property-style fixture

- Heat合法转移与heatMax过滤。
- drawBands归一化、非法bucket=0。
- coverage opportunity/completion/skip差异。
- pair score + cap + small-pool + cooldown。
- signal source whitelist。
- mutual matching、multiple match、unilateral deletion。
- five-card guarantee窗口。
- consent intersection。
- neutral pack pause。
- session end cleanup。

### Integration

- 4人/5人不同比例玩家。
- low-participation不锁死。
- PackSwitcher在relationship-aware/neutral之间切换。
- IndexedDB refresh recovery。
- V1.6 fixture迁移。

### E2E

- H1→H3→SYSTEM_MUTUAL_CHECK→MATCH→5档→final check完整链。
- 无MATCH链：不泄露单向答案、不出现5档。
- refresh during private flow：partial secret消失。
- offline完整主链。
- 四Tab/设置/游戏包/Provider regression。

## 8. Risks / Countermeasures

| 风险 | 级别 | 对策 |
|---|---|---|
| dynamic router与旧fixed deck并存造成双路由 | P0 | legacy removal test + 单一V2入口 |
| 私密答案进入IndexedDB/日志 | P0 | ephemeral controller + persistence denylist test |
| JSON/prose分叉 | P0 | SSOT hash/schema gate |
| 一个skip玩家锁死流程 | P1 | opportunity-based coverage |
| MATCH pair垄断 | P1 | small-pool权重+cooldown+caps |
| AI/custom卡没有metadata却进入V2 | P1 | capability gate=neutral |
| 旧active session迁移失败 | P1 | transaction + fixture + no-delete rollback |
| H4节奏过强/过弱 | P2 | runtimeRules可调，不改引擎 |

## 9. Phase 1 Readiness Gate

进入 Research Review 前必须满足：

- Constitution / SPEC / PLAN / TASKS 四件套完成；
- V1.3 freeze manifest/hash完成；
- runtimeRules SSOT明确；
- migration delete list完整；
- state/event model无明显死锁；
- FR→R→Task→Test可追踪；
- 本轮没有业务代码变更。

**当前 Planner 目标：READY_FOR_RESEARCH_REVIEW，不设置 DEV_BASELINE。**


---

<!-- SOURCE: 04-TASKS-V2引擎.md -->

# Party Night V2 Relationship Engine｜TASKS

> **重要：本文件是 Phase 2 待执行任务，不代表现在可以开发。**  
> 只有 Research Reviewer 通过、Human Gate 通过、用户明确说“第二阶段，开发”后，Task Manager 才能派 Builder。  
> 建议 DEV_BASELINE（批准后）：`PRODUCT_PLAN_V2.0`

## Phase 0｜Pre-Implementation Analyze（必须先做）

- [ ] **V2-T001** 读取 AGENTS / role card / override / HANDOFF / 经验，记录 git status/branch；对当前真实仓库建立 path mapping：Session model/reducer、card selector/deck、registry、PackSwitcher、repositories/IndexedDB、PWA/version、tests。**只记录，不搬目录。**
- [ ] **V2-T002** 跑当前 baseline：lint / typecheck / unit / integration / E2E / build；记录历史失败，禁止把旧失败算V2回归。
- [ ] **V2-T003** 执行 pre-implementation Analyze（Spec Kit可用则 `/speckit.analyze`；否则等价人工矩阵），对 Constitution/SPEC/PLAN/TASKS 做冲突检查。CRITICAL/HIGH 先回 Phase1。
- [ ] **V2-T004** 建立 V1.6 Active Session / 空局 / 2M2F / 3M2F / 4M1F / 全男或全女 / neutral pack fixture；测试先行。

**Gate A：** path mapping + baseline + Analyze 全PASS 才能开始实现。

## Phase 1｜SSOT / Schema Adapter

- [ ] **V2-T005** 为 `10-卡片元数据.json` / `10b-扩圈元数据.json` 建 Zod/现有schema adapter；验证 schema2.3、数量、唯一ID、runtimeRules。
- [ ] **V2-T006** 写 SSOT divergence tests：禁止手写第二份 drawBands/coverage/chemistry runtime defaults；若使用生成文件，验证生成hash与源一致。
- [ ] **V2-T007** 定义 Pack capability：`relationship-aware | expansion | neutral`；现有 AI 即兴/转瓶子/自定义默认 neutral。
- [ ] **V2-T008** 将七类主线 V1.3 卡映射到现有 GameCard contract；保持现有 pack id / registry compatibility，避免 Session 引用断裂。

## Phase 2｜Relationship State / Persistence

- [ ] **V2-T009** 扩展 Session schema：heat、coverage、pair aggregate、matches、cooldown、usedCardIds、fiveGuarantee。
- [ ] **V2-T010** 明确 persistence allowlist/denylist；单向秘密选择、partial consent 不得进 IndexedDB。
- [ ] **V2-T011** 写 Session serialize/restore tests：正常 relationship state 可恢复，private ephemeral 不可恢复。
- [ ] **V2-T012** 实现 Session end cleanup；写“结束后敏感relation state为空”的测试。

## Phase 3｜Heat / Coverage / Draw Router

- [ ] **V2-T013** Test-first：D3=A 双计数器 + 20 completed rounds / +5 + Heat H1–H4 transition + intensity ceiling + heatMin/heatMax hard filter；验证neutral不推进relationship count、skip/swap不涨completed、Heat不回退。
- [ ] **V2-T014** 实现 `CARD_PRESENTED` + Coverage opportunity/completed/skip/low-participation；卡真正展示时记offered，skip/swap只offered不completed；测试一人连续skip不锁死。
- [ ] **V2-T015** 实现 H1/H2 targeted scheduling约束（≥40%、最多连续2张全桌题），参数来自SSOT。
- [ ] **V2-T016** 实现Router硬顺序：capability→specialFlow gate→intensity→Heat/metadata legality→legal pair/card pool→Pair Routing→guarantee→drawBands→select→CARD_PRESENTED；含weighted selection + unavailable bucket renormalization。
- [ ] **V2-T017** 移除 relationship-aware 路径的旧 `16:8:4:2:1` / fixed high-intensity slope / 4–5档70%逻辑与相关断言。
- [ ] **V2-T018** 保留 swap/skip/recent dedupe，但放在 V2 legality 之后；测试不得用去重绕过合法性。

**Gate B：** 不依赖UI，测试可以证明 Heat/Coverage/Router 从 H1 到 H4 正确。

## Phase 4｜Pair / Signal Engine

- [ ] **V2-T019** 实现 D4=A：Player仅 `nickname + gender(male|female)`；不得增加性取向/偏好字段；建立稳定 pairKey 与 active opposite-sex eligible pair pool；处理2M2F/3M2F/4M1F/全男全女降级/暂离返回。
- [ ] **V2-T020** 实现 CoverageScore / SignalBonus / CooldownPenalty 三段式路由。
- [ ] **V2-T021** 实现 small-pool 权重（≤6 pairs）与各 signal cap；MATCH不得绕cooldown。
- [ ] **V2-T022** 实现 Shared 口径：仅共同“做过”、≥80%排除、“都没做过”不计。
- [ ] **V2-T023** 实现 Either Compatibility 口径：公开有效共同答案、≥3题、共识题排除、私密41/42/50不计。
- [ ] **V2-T024** 实现 Chemistry Compatibility：1–3档预测证据、#40偏好一致；41–49无routing effect。
- [ ] **V2-T025** 实现 Crowd/Personal source whitelist；Crowd只允许MOST 4档pair vote。

## Phase 5｜Private Flow / MATCH / 5档

- [ ] **V2-T026** 实现 ephemeral PrivateFlow controller；未提交/单向答案只在内存存在。
- [ ] **V2-T027** 实现 pass-the-phone Mutual Check UI：交给玩家→准备→从当前合法异性或“暂时没有”中选择→确认→遮罩→下一位；不得询问或解释性取向。
- [ ] **V2-T028** 实现 `SYSTEM_MUTUAL_CHECK` scheduler：首次/间隔/最多次数来自SSOT；20轮末先end/+5，剩余round不足5档guarantee窗口时不新开regular；final需H3+/Coverage/合法pair且距最近check满足interval。
- [ ] **V2-T029** 实现 mutual graph match：仅 A↔B 形成；multiple matches允许；单向结果计算后清除。
- [ ] **V2-T030** 实现刷新/崩溃恢复：private flow取消，回安全主局，不恢复partial答案。
- [ ] **V2-T031** 实现 MATCH pair 5档候选资格 + dedicated drawBand。
- [ ] **V2-T032** 实现“2次`qualifyingPairOpportunity`内至少优先1张合法5档” guarantee tracker；机会仅在pair实际选中+双方active+cooldown允许+maxIntensity=5+存在合法5档时消耗；第二次仍合法时force-priority 5；测试multiple guarantee/away/cooldown/neutral/final-created MATCH。
- [ ] **V2-T033** 实现 private-mutual consent intersection；无交集 no-action；不泄露单边选择。
- [ ] **V2-T034** 实现 `PN-MOST-050` one-off bonus（≤4档、安全双人卡、不MATCH）。

**Gate C：** 测试可完整跑 `H3 → mutual check → MATCH → 5档` 和 `无MATCH` 两条链。

## Phase 6｜Pack Integration / Neutral / Expansion

- [ ] **V2-T035** relationship-aware pack 接 V2 router；neutral pack 继续现有玩法路径但暂停relationship推进。
- [ ] **V2-T036** PackSwitcher切 neutral/relationship-aware 时 Relationship State 不丢、不重复初始化。
- [ ] **V2-T037** 扩圈40卡接10b metadata；不进Heat/PairScore/MATCH；拒绝走table fallback。
- [ ] **V2-T038** Offline test：断网下350+40本地内容仍能动态routing、match、5档。

## Phase 7｜V1.6 Migration

- [ ] **V2-T039** 写 V1.6→V2 migration tests（先失败）：players/config/intensity/active pack/history保留，signals/matches为空。
- [ ] **V2-T040** 实现事务化 migration；旧future deck不再驱动relationship-aware下一张。
- [ ] **V2-T041** 若升级时存在legacy current card，允许一次完成/跳过neutral处理；之后进入V2 router。
- [ ] **V2-T042** migration失败保留原记录，不清库、不写半迁移schema。
- [ ] **V2-T043** Legacy removal grep/test：9项旧规则在生产可达代码中为0；旧历史文档可保留。

## Phase 8｜UI / Regression / QA

- [ ] **V2-T044** 主局卡面接入target/pair显示，但不把Routing Score/秘密单向选择暴露给UI。
- [ ] **V2-T045** Mutual/MATCH结果文案：只公布共同结果；无match显示中性完成态。
- [ ] **V2-T046** Consent UI明确“当次动作、可跳过、可随时停止”；不把MATCH当授权。
- [ ] **V2-T047** 四Tab、首页、组局设置、游戏包、设置、Provider regression。
- [ ] **V2-T048** PWA/offline/refresh/IndexedDB recovery regression。
- [ ] **V2-T049** Security/privacy test：logs/export/cache/analytics无单向秘密选择。
- [ ] **V2-T050** E2E矩阵：2M2F 20轮、3M2F、4M1F、全男/全女降级、某玩家始终“暂时没有”但其他人可MATCH、连续skip、neutral插入、mutual 9/14、20轮end、20轮+5、multiple MATCH、temp-away、refresh/end during private flow。
- [ ] **V2-T051** production-like build/start + Playwright smoke；版本号联动规则校验。

## Phase 9｜Converge / Release Readiness（仍属Phase2开发闭环）

- [ ] **V2-T052** Converge：逐项核对 FR/R/Task/Test，无P0、blocking P1。
- [ ] **V2-T053** Code Reviewer / QA / Supervisor 全链通过；按ORCA任务账本记录。
- [ ] **V2-T054** 真机酒吧/弱光流程验收：至少4人局+5人局各1轮，重点看私密传手机、节奏、尴尬暴露、5档时机。
- [ ] **V2-T055** 仅在用户最终放行后按项目规则 commit/push/手动生产部署，并同步生产地址。

## DoD 汇总

- 350+40 SSOT 驱动，schema2.3；无第二套 runtime constants。
- 旧陡坡与9项legacy关系逻辑不可达。
- H1→H4 / Pair / Signal / Mutual / MATCH / 5档 / Consent 完整测试。
- 单向私密数据不持久化、不日志、不上传。
- Neutral pack/四Tab/PWA/Provider/PackSwitcher无回归。
- V1.6 Session迁移非破坏。
- lint/typecheck/unit/integration/e2e/build全PASS。
- Human Gate/V1 Gate前不Release。


---

<!-- SOURCE: 05-TRACEABILITY-V2引擎.md -->

# Party Night V2 Relationship Engine｜Traceability Matrix

| SPEC FR | PLAN R | 主要模块 | Phase2 Tasks | 核心验证 |
|---|---|---|---|---|
| FR-V2-000A–000B | R-004A | Session cadence / counters | T013,T028,T050 | 20/+5、双计数、Heat monotonic |
| FR-V2-000C | R-004B | Player/Pair scope | T004,T019,T027,T050 | nickname+gender、opposite-sex only、no-preference、无pair降级 |
| FR-V2-001–007 | R-002,R-003 | Session/Heat/Coverage | T009,T013–T015 | Heat + skip/coverage fixtures |
| FR-V2-008–011 | R-004 | Card Router | T016–T018 | legality + drawBands + dedupe |
| FR-V2-012–017 | R-005,R-006 | Pair/Signal | T019–T025 | caps/small-pool/source whitelist |
| FR-V2-018–025 | R-007,R-008 | Scheduler/Private Flow | T026–T030 | trigger/privacy/refresh |
| FR-V2-026–031 | R-009,R-010,R-011 | Match/5档/Consent | T031–T034 | guarantee/intersection/MOST050 |
| FR-V2-032–035 | R-017 | Persistence/Privacy | T010–T012,T049 | IndexedDB/log denylist |
| FR-V2-036–040 | R-014,R-015 | Migration/Legacy removal | T039–T043 | V1.6 fixtures + grep/test |
| FR-V2-041–044 | R-012,R-013,R-016 | Existing integration | T035–T038,T044–T051 | pack switch/offline/regression |

## 关键不可漏映射

- `runtimeRules.coverageGate` → R-003 → T014/T015。
- `runtimeRules.drawBands` → R-004 → T016。
- `SYSTEM_MUTUAL_CHECK` → R-007 → T028。
- “2次机会内5档保障” → R-009 → T032。
- small-pool降权 → R-005 → T021。
- CHEM compatibility收敛 → R-006 → T024。
- 9项 migration delete → R-015 → T017/T043。
- secret raw answers lifecycle → R-008/R-017 → T026/T030/T049。

- D4 “暂时没有 / 单个玩家无MATCH不阻塞别人” → FR-V2-020/020A → R-004B/R-007 → T027/T028/T050。
- `CARD_PRESENTED` → R-003/R-004 → T014/T016。
- 末段mutual抑制 / 20+5 → R-004A/R-007 → T028/T050。


---

<!-- SOURCE: 06-PLANNER交叉检查报告.md -->

# Party Night V2 Engine Phase 1｜Planner 交叉检查报告

> 这不是 Research Reviewer 的独立结论；只是 Planner 自检证据。DRAFT.2 已合并 R1/R2 证据与 D3/D4 用户决策。

## 1. 已主动解决的历史冲突

1. **V1.6 fixed deck vs V2 dynamic routing**：核心7玩法改动态本地router；离线能力保留；neutral pack可继续旧deck能力。
2. **“不逐人手机录入” vs 秘密互选**：只为 mutual check / private consent 开两个受控例外，普通题仍Host驱动。
3. **Intensity 5 vs Heat 5**：Heat无H5；5是pair legality。
4. **全桌起哄 vs MATCH**：Crowd仅signal；MOST-050只one-off安全加赛。
5. **Skip / “暂时没有” vs Coverage/MATCH**：机会门槛与完成次数拆开；某玩家持续skip或秘密互选始终选“暂时没有”，不锁死其他人。
6. **持久化恢复 vs 私密原始答案**：聚合state可恢复，partial private flow刷新即丢。
7. **AI/custom pack vs V2 metadata**：缺metadata即neutral，不污染Relationship Engine。
8. **SSOT vs prose**：runtimeRules只读JSON，00为人读镜像。
9. **旧active session vs删除旧router**：事务迁移后由V2接管；不保留双引擎生产路径。
10. **性别 vs 性取向**：只收集男/女性别用于异性Pair；不询问、不推断、不记录性取向/配对偏好。
11. **20轮 vs Heat**：Session总完成轮与relationship effective count分离；+5不导致Heat回退。
12. **末段MATCH保证**：不足2个兑现slot时抑制regular mutual；end final新MATCH不承诺本局5档。

## 2. State-machine 死锁检查

- H3 Gate：opportunity-based，不因持续skip锁死。
- Mutual check：有最大常规次数且final独立兜底，不无限循环。
- 无MATCH：回普通session，不等待MATCH。
- 有MATCH但Intensity<5：继续H3/H4普通内容，不等待5档。
- 5档无合法卡：renormalize到合法4档，不死锁。
- private flow刷新：cancel→active，不恢复半状态。
- player temp-away：从eligible target pool移除；返回后可重新进入，不删除已有聚合pair状态。
- multiple matches：非排他，靠pair cooldown/small-pool控制，不需要“选唯一伴侣”。

## 3. Brownfield 保护检查

PASS：四Tab、PWA、IndexedDB、Provider、PackSwitcher、local-first、1–5 UI、同Session切玩法均保留。  
PASS：未要求新状态框架/云库/多设备。  
PASS：Phase1未改GitHub业务代码、未commit、未push、未部署。

## 4. Known Assumptions（Research Reviewer 必须挑战）

- Expansion / neutral 默认不推进 Relationship Heat / mutual interval：这是 Phase1 新架构决定，不改冻结题库；Reviewer 应重点判断该 capability 语义是否合理。
- Neutral pack 暂停Relationship progression：同上，是为了防无metadata内容污染关系逻辑的保守策略。
- V1.6 active session允许“当前已展示legacy card完成一次再切V2”：需Phase2 path mapping确认现有Session结构可安全表达。
- 当前准确的Session/router/repository文件路径需T001核验；Phase1没有臆造路径。

## 5. Planner Readiness Self-Score

- Scope/目标：10/10
- SSOT/数据契约：10/10
- State machine：19/20
- Privacy/consent：20/20
- Brownfield migration：18/20
- Traceability/testability：18/20

**DRAFT.2 Planner self-score：97/100。**  
P0：0（Planner视角）  
Blocking P1：0（Planner视角）  
状态：**R1 PASS / R2 PASS；R3–R5 CONTINUE_REVIEW**  
注意：该分数不能替代 Research Reviewer 独立打分，也不能跨 Human Gate。


---

<!-- SOURCE: 07-Research Reviewer审查请求.md -->

# Party Night V2 Engine Phase 1 DRAFT.2｜Research Reviewer 审查请求

## 审查对象

- `01-CONSTITUTION-V2引擎.md`
- `02-SPEC-V2引擎.md`
- `03-PLAN-V2引擎.md`
- `04-TASKS-V2引擎.md`
- `05-TRACEABILITY-V2引擎.md`
- V1.3 Frozen `10-卡片元数据.json.runtimeRules`
- 当前仓库 `AGENTS.md` / `docs/handoff/HANDOFF.md`

## 已有独立证据

- R1：350/350逐题机器对账 PASS，异常0。
- R2：状态机/Heat/Coverage/Mutual Scheduler 31/31自动断言 PASS；D3=A / D4=A 已并入DRAFT.2。

## Reviewer 必查问题

1. 是否仍存在第二套 runtimeRules / 第二套路由真源？
2. H1–H4、Coverage opportunity、mutual scheduler 是否存在死锁/跳过连带惩罚？
3. dynamic router 与 V1.6 fixed deck 的迁移边界是否清楚，是否可能双路由？
4. Signal 是否存在任何 Crowd/Personal/行为线索错误升级 MATCH 的路径？
5. Multiple MATCH + small pool + cooldown 是否会垄断4–5人小局？
6. D4边界是否贯穿一致：仅nickname+男/女；只建异性Pair；“暂时没有”合法；不记录性取向；单个玩家无MATCH不阻塞别人？
7. “2次pair机会内5档保障”与70/30 dedicated band是否会违反公平/consent？
8. private flow 是否可能在 IndexedDB、log、browser history、analytics 泄露单向选择？
9. 刷新/崩溃/暂离/返回/Session end 是否有隐私残留或状态不可恢复？
10. neutral/expansion不推进Heat这一Phase1决定是否合理？若要改变，是否需要补runtimeRules SSOT字段？
11. V1.6 Active Session transaction migration 是否足够非破坏？
12. 9项 legacy delete 是否完整；是否还有旧 `SEED_INTENSITY_PATTERN` / deck-prefix 假设遗漏？
13. FR→R→Task→Test 是否有断链？
14. 是否保护四Tab、PWA、Provider、PackSwitcher、local-first，不把Change C扩大为重写App？
15. Phase2 Task是否满足 test-first，且MVP Gate只内部检查不暂停？

## 输出要求

Reviewer 请给：

- P0 / blocking P1 / P2 列表；
- 每项证据位置；
- `PLAN_READINESS_SCORE`（0–100）；
- `READY_FOR_HUMAN_REVIEW` 或 `REWORK_REQUIRED`；
- 若整改，只回 Planner，不让用户搬运。

只有 **score ≥90 + P0=0 + blocking P1=0 + 关键事实已验证** 才能进入 Human Gate。


---

<!-- SOURCE: 08-Human Gate验收单.md -->

# Party Night V2 Engine Phase 1｜Human Gate 验收单

> 当前状态：**R1/R2 已通过，R3–R5 继续审查；尚未进入 Human Gate。**

Research Reviewer 达到 Readiness Gate 后，用户只需要审仍未决的产品级问题，不需要重复审已经明确决定的 D3/D4。

**已决定，不再作为 Gate 待决项：**
- D3=A：默认20 completed rounds，到点可结束或+5；Heat不回退。
- D4=A：Player只填昵称+男/女；Relationship Pair只做异性；不询问性取向；秘密互选可“暂时没有”；无MATCH不阻塞别人。

其余待审：

1. 是否同意 V2 核心7玩法从“固定预排关系牌”改为“本地动态 Heat/Pair/Card Router”？
2. 是否同意秘密互选作为单设备传手机的受控例外？
3. 是否同意 AI即兴/转瓶子/自定义包默认 neutral，不参与 Heat/Signal/MATCH？
4. 是否同意 Expansion 不推进 Relationship Heat / mutual interval？
5. 是否同意同一玩家可同时存在多个 Session MATCH，而不是锁定唯一对象？
6. 是否同意 V1.6 active session 迁移后 Signals/MATCH 从空开始，不根据旧历史猜测？
7. 是否同意删除旧 16:8:4:2:1 等全部 legacy relationship routing？
8. 是否同意 runtimeRules 是后续真人测试可调参数，而不是硬编码产品真理？

### Human Gate 决策

- [ ] `APPROVED` → 用户明确说 **“第二阶段，开发”**，建立 `DEV_BASELINE=PRODUCT_PLAN_V2.0`。
- [ ] `REVISE` → 回 Planner，仍处于 PLAN。
- [ ] `HOLD` → 保持 V1.6 生产，不开发 V2。

**任何情况下不得自动跨越此 Gate。**


---

<!-- SOURCE: 09-D3-D4决策记录.md -->

# Party Night V2 Engine Phase 1｜D3 / D4 决策记录

- 日期：2026-09-25
- 状态：用户已明确决定；后续 R3–R5 / Human Gate 不得重新发明相反口径。

## D3｜Session 节奏

**采用 A。** 默认20个 completed rounds；结算点可“结束 / 再玩5轮”；双计数器；neutral不推进relationship Heat；+5后Heat不回退。

## D4｜Relationship Pair 范围

**采用 A，并明确产品边界：**

1. 开局 Player 只填：`昵称 + 性别（男/女）`。
2. Relationship Pair 只允许 active 一男一女组合。
3. 不询问、不推断、不记录性取向、偏好性别或恋爱取向。
4. `SYSTEM_MUTUAL_CHECK` 每位玩家可从当前合法异性中选1人，或选“暂时没有”。
5. 只有 A→B 且 B→A 才产生 MATCH。没有MATCH不需要解释原因。
6. 某玩家没有MATCH：仍可参与普通1–4档；不获得任何异性pair的5档解锁。
7. 某玩家持续选择“暂时没有”或持续skip，不得阻塞其他玩家的互选与MATCH。
8. 全男/全女或当前0个合法异性pair：Relationship Engine安全降级为 `inactive_no_eligible_pair`；neutral玩法仍可继续。
