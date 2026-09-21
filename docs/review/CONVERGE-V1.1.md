# CONVERGE-V1.1（T207–T209 收敛审计）

- Date: 2026-09-21
- Baseline: V1.1 四件套（Constitution/Spec/Plan/Tasks, docs/2026-09-21 - MAC - ChatGPT - Party Night玩法扩展与主局整合-计划 - V1.1/）+ CODE_REVIEW-V1.1.md + BUGS-V1.1.md
- Verdict: **CONDITIONAL PASS** — 无 P0 blocking；真机弱光（Human Gate #8）PENDING + 下列 P1/P2 gaps 需补任务。代码实测：unit 70文件/437用例全过；E2E 文件 30 个在仓（pack-switching/spin-bottle/rules-library/offline-pack-switch/pwa-schema-upgrade 等均存在）。
- 命名注意：四件套文件名写 V1.1，但正文一律自称 V1.2（Constitution 1.2.0 / Spec V1.2 / Plan V1.2 / Tasks V1.2）。审计按正文语义（=V1.2 内容）执行，文件名 drift 记入 §2。

## 1. FR-001–FR-046 追踪（代码+测试，有缺只列补任务不实现）

| FR | 状态 | 代码 | 测试 | 补任务 |
|---|---|---|---|---|
| FR-001 四Tab | PASS | app 4 Tab 保留（回归通过） | v1-regression/setup | — |
| FR-002 首页4卡 | PASS | app/page.tsx + home-cards | home regression | — |
| FR-003 组局语义/尺度 | PASS | SessionConfig 复用 | setup-regression T184 | — |
| FR-004 设置/Provider/Key | PASS | settings 现有路径 | settings-regression/api-key-danger-zone | — |
| FR-005 currentPackId/mode | PASS | lib/engine/session-engine.ts:24,114-131 | session-switch | — |
| FR-006 同Session切换 | PASS | session-engine switchPack 同ID保留config | pack-switching.spec E2E | — |
| FR-007 RoundHistory | PASS | domain+repository packId/cardId/status | pack-switching assertion | — |
| FR-008 当前玩法恢复 | PASS | autosave+recovery | session-current-pack-recovery/v1-1-recovery | — |
| FR-009 切换面板只显可用 | PASS | PackSwitcherSheet + registry enabled/minPlayers | switcher tests | — |
| FR-010–013 旧4玩法 | PASS | truth-or-dare/most-likely/never-have/ai-improv | T128 regression + game-flow | — |
| FR-014 二选一 | PASS | lib/game-packs/would-you-rather.ts + WouldYouRatherView | would-you-rather.spec | — |
| FR-015 指人 | PASS | pointing-game.ts + PointingGameView | pointing-game.spec | — |
| FR-016 默契 | PASS | compatibility-test.ts + CompatibilityView/PairPicker | compatibility.spec | — |
| FR-017 转瓶子 | PASS | spin-bottle.ts + SpinBottleView | spin-bottle.spec | — |
| FR-018 新玩法继承上下文 | PASS | prompt-builder/session config | context inheritance tests | — |
| FR-019 不逐人录入 | PASS | renderer 无票数输入 | UX check T139–144 | — |
| FR-020 pair+score+恢复 | PASS | compatibility reducer/state | compatibility recovery E2E | — |
| FR-021 转瓶子本地选择+链入 | PASS | player-selector selectEligiblePlayer + spin-chain.ts | spin→truth/dare E2E | — |
| FR-022 随机点名 | PASS | lib/tools/random-player.ts + RandomPlayerTool | party-tools.spec/unit | — |
| FR-023 随机分组 | PASS | lib/tools/random-groups.ts + RandomGroupTool | party-tools unit 2–12人 | — |
| FR-024 Tools不调AI | PASS | 纯本地函数 | no-AI audit | — |
| FR-025 批量预生成不强制每轮 | PASS | generation orchestration | fallback integration | — |
| FR-026 校验/过滤/去重 | PASS | lib/ai/generate-deck.ts:28-81 + card-schema | schema/dedupe tests | — |
| FR-027 换一个降重复 | PASS | card-selector fingerprint | rejection-dedupe tests | — |
| FR-028 fallback | PASS | localSeedDeck + seed-first | v1-1-generation-fallback/offline-pack-switch | — |
| FR-029 规则库在游戏包 | PASS | packs 玩法/规则 segment | rules-library.spec 5/5 | — |
| FR-030 首批8条 | PASS | lib/rules/entries 8文件 + catalog.ts | navigation test 8条 | — |
| FR-031 详情五件套 | PASS | RuleDetail 固定顺序 | schema/detail test | — |
| FR-032 变体标注 | PARTIAL | miss-card/kings-cup 有变体；finger-guessing 为地域差异提醒 | catalog test | GAP-01: 全8条 hasHouseRules/variants 逐条断言补测试 |
| FR-033 不强制数字化 | PASS | RuleDetail 无开始游戏CTA | rules-library E2E | — |
| FR-034 Session恢复 | PASS | repository autosave | recovery E2E | — |
| FR-035 局部状态恢复 | PARTIAL | compatibility pair/score 恢复有；spin 中途刷新回稳定态有；**switchPack 清空 currentPackState（session-engine.ts:126）丢其他玩法局部状态**（CODE_REVIEW P2 已记） | recovery | GAP-02: 按 packId 分键保留 packStates（PLAN §5.1 packStates 复数 vs SPEC 单 currentPackState 单数字段不一致，见§2） |
| FR-036 自定义Pack+规则收藏本地持久 | PARTIAL | 自定义Pack CRUD 回归有；**规则收藏无实现**（全仓仅 summary 页 favorite 统计字面匹配，无 rule-favorite 存储/UI） | custom-pack-regression | GAP-03: 规则收藏（或 SPEC 回写为 SHOULD-可选不做）二选一 |
| FR-037 霓虹视觉 | PASS | Design Tokens 延续 | visual token audit | — |
| FR-038 复用 tokens/components | PASS | MoreGamesSheet/RuleList 复用 | audit | — |
| FR-039 单手/围观可用 | PARTIAL | 一主一辅、44px、safe-area 有检查；**真机弱光未测**（BUGS-V1.1 #8 PENDING） | visual/accessibility | GAP-04: 真机QA补测（与 Human Gate #8 同一项） |
| FR-040 不重做尺度 | PASS | 无第二套尺度字段 | setup-regression | — |
| FR-041 凭据边界 | PASS | sw 无 apiKey；Key 经 Authorization 头；redaction/clear-secret 测试过 | secret leak audit | — |
| FR-042 纯文本渲染+长度上限 | PASS | 全仓无 dangerouslySetInnerHTML/innerHTML；untrusted-text 去控制字符+钳长 | safe-content-rendering 27项 | — |
| FR-043 幂等迁移+PWA错位 | PASS | session-migration 幂等+坏记录隔离；pwa-schema-upgrade/cache-regression | migration/version-skew E2E | — |
| FR-044 禁用核心卡语义 | PASS | 首页卡保留+禁用态不绕过 | disabled-core-pack.spec | — |
| FR-045 无缓存断网立即seed | PASS | pack-switcher 本地seed立即补位 | offline-pack-switch.spec | — |
| FR-046 高尺度安全边界 | PASS | safety filter | safety-redteam 18项 | — |

补任务清单（只列不实现）：GAP-01（P2 规则变体逐条断言）、GAP-02（P1 packStates 按packId分键，含 SPEC/PLAN 字段口径统一）、GAP-03（P2 规则收藏实现或 SPEC 回写）、GAP-04（P1 真机弱光补测）。

## 2. 五方一致性 drift

- D1（命名）：文件名 V1.1 vs 正文 V1.2/Constitution 1.2.0。结论：内容一致，文件名 drift；建议重命名或 HANDOFF 备注，不阻塞。
- D2（字段口径）：SPEC §7 `currentPackState?: Record<string,unknown>`（单数） vs PLAN §5.1 `packStates: Record<packId,state>`（复数）。代码用单数 `currentPackState` + switchPack 清空 → 即 GAP-02 根因。需先统一口径再改代码。
- D3（HANDOFF）：HANDOFF.md 仍为 2026-09-21 09:45 迁移整理快照，未同步 V1.1 DEV_BASELINE（CODE_REVIEW P3 已记，非 blocking）。
- D4（版本号内）：Tasks T111 写“V1.0→V1.1 幂等 migration”，SPEC/PLAN 写 V1.x→V1.2；语义一致（同一次迁移），文字 drift。
- Constitution/SPEC/PLAN/TASKS 意图层：一致（TASKS §最终检查 PASS 与本次审计一致，无意图级 contradicts）。

## 3. 清单

- missing：规则收藏存储/UI（FR-036 后半）；全8条变体逐条断言测试（FR-032）。
- partial：FR-032/035/036/039（见上表）。
- contradicts：D2 单复数字段口径（SPEC vs PLAN）；其余无。
- unrequested：无（未发现超出 SPEC 的业务功能；CODE_REVIEW 七查无多余实现）。
- unsafe：无新增 unsafe（无 dangerouslySetInnerHTML；sw 无密钥；redteam 通过）。已知 P2：switchPack 清空 currentPackState 属数据丢失风险但影响面小（仅 compatibility 用该字段），已列 GAP-02。
- dead code：无确认死代码（MoreGamesSheet/PackSwitcherSheet/Tools/RuleList/RuleDetail/catalog 均被 E2E/引用覆盖）。
