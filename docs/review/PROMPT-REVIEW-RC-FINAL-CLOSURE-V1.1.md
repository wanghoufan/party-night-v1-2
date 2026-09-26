# PROMPT-REVIEW｜《Party Night V2 RC 冻结前最终收口提示词 V1.1》审查

- 日期：2026-09-26
- 审查对象：`~/Downloads/2026-09-26 - Mac Mini - ChatGPT - Party Night RC冻结前最终收口-提示词 - V1.1.md`（用户上传）
- 审查人：product-reviewer（本窗口，只读审查，未动业务代码）
- 审查方式：逐条核对提示词断言 vs 项目文档 / 代码 / 矩阵原始证据（含 `ai-content-3l` 与 `ai-content-3l-pre-fix` 双文件夹逐格比对）
- **Result：FAIL（方向正确、范围克制，但含 2 处 P0 级事实/架构错误；修订后可执行）**

一句话结论：这份提示词的八大目标（撤过期结论、关 2 人回退、接 Coverage、1:N 保护、不扩 Gate）方向全部成立且与冻结契约一致，**但它引用的矩阵数字（PASS 119 / P0=14 / P1=46）在磁盘上任何一份证据里都不存在，且整体滞后于项目实际进度一个修复波次**——判定器修复与 14 格复跑在提示词起草前已基本完成；照单执行会让团队去找不存在的 14 个 P0、并重复已完成的修复。

---

## 一、关键事实核对表

| # | 提示词断言 | 项目实际（证据） | 判定 |
|---|---|---|---|
| 1 | AI-MATRIX-RESULT 已执行；candidate 184 / legal 176 | [AI-MATRIX-RESULT.md](../qa/AI-MATRIX-RESULT.md) §0：184 格 / 合法 176 | ✅ |
| 2 | PASS 119 | RESULT.md：通过 **169**（169+预期失败 3+未通过 4=176）；最终波原始 JSON：**173 PASS+3 预期错误=176** | ❌ 两处都对不上 |
| 3 | P0=14 | RESULT.md：P0 格数 **2**；pre-fix 文件夹：**14 格 FAIL**（12 处 P0 命中）；最终波：**0** | ❌ 疑似把 pre-fix 的 14 格 FAIL 误作 14 个 P0 |
| 4 | P1=46 | RESULT.md：3；pre-fix 文件夹：3 | ❌ 无任何出处 |
| 5 | RESULT=未通过放行标准 | RESULT.md §9 结论字面一致，**但该结论已与它自己引用的原始 JSON 矛盾**（见 P0-1） | ⚠️ 过期 |
| 6 | HANDOFF 需撤销"重冻条件已具备 / 用户点头即可重冻 / PLAN 仍待执行" | [HANDOFF.md](../handoff/HANDOFF.md) RC 状态行确有此表述；写于矩阵执行前，属**过期**而非造假 | ✅ 方向成立 |
| 7 | 2 人局 most-likely / pointing-game 不可进入；合法候选空时禁止回退全部内置玩法 | [setup/page.tsx](../../app/setup/page.tsx#L72) `mixedPackIds.length ? mixedPackIds : [...BUILTIN_PACK_IDS]` 回退真实存在；两玩法 minPlayers=3 属实 | ✅ 漏洞属实 |
| 8 | V2.0 已冻结 `Pair Routing = Coverage + Signal − Cooldown`；state/reducer 已有 playerCoverage；v2-routing 未接线 | [PRODUCT_PLAN_V2.0.md](../pm/PRODUCT_PLAN_V2.0.md) Technical Approach #5 与概念模型；[v2-state.ts](../../lib/v2-relationship/v2-state.ts#L307-L310)/[v2-reducer.ts](../../lib/v2-relationship/v2-reducer.ts#L316-L327) 维护字段；[v2-routing.ts](../../lib/v2-relationship/v2-routing.ts) rankPairs 只用 signals/matched/cooldown，**确实未消费 playerCoverage** | ✅ 属实，"未接线"指控成立 |
| 9 | 3.3 应测 pointing-game/most-likely（2 人非法边界）；compatibility-test minPlayers=2 不属该组 | [pointing-game.ts](../../lib/game-packs/pointing-game.ts#L15) / [most-likely.ts](../../lib/game-packs/most-likely.ts#L5) minPlayers=3；[compatibility-test.ts](../../lib/game-packs/compatibility-test.ts#L73) minPlayers=2 | ✅ 属实（但见 P1-4 口径冲突） |
| 10 | 禁止 pairGender/anchor/姓名/性别结构送 AI/日志/analytics/export | Plan「禁止持久化」节已冻结同类禁令；当前 [route.ts](../../app/api/generate-session/route.ts#L34) 只发 playerCount，prompt-builder 无性别/姓名 | ⚠️ 现状已满足，属防御性重申（建议转为回归断言） |
| 11 | mutual 9/14/19 不变；active MATCH ≤2 不放宽；D7 展示即给过 | Plan :156/:594（9/14/19 冻结）、D5、D7=A | ✅ 与冻结契约一致 |
| 12 | 3.7 无 Key 用独立进程（关 env fallback）验证 KEY_REQUIRED | RESULT.md §8.1 建议完全同款 | ✅ |
| 13 | RG-01~07 保持 7/7 不新增编号；RG-02 优先 1男3女、RG-03 优先 1男4女 | Plan :578-584 的 RG-02/03 **原文未规定性别构成** → fixture 细化不违约，但属 Gate 验收条件变更，需落 Plan（见 P1-2） | ⚠️ 基本一致，流程缺口 |

---

## 二、P0（必须修订提示词后才可执行）

### P0-1｜矩阵数字全错，且提示词滞后实际进度一个修复波次

**磁盘证据链（2026-09-26 晚，三波）：**

1. **pre-fix 波**（[ai-content-3l-pre-fix/](../qa/ai-content-3l-pre-fix)，14 个文件，20:25–21:40）：14 格 FAIL——11 格 `5-boundary`（模型已自报 boundaryTags 的卡穿透了当时的服务端，如 ml-ice-01「主动跟陌生人打招呼」带 stranger-contact 标签仍在响应里）+ 1 格红线误报（nh-04「偷偷查看手机里的时间」被误判"隐私脱衣非自愿"）+ 1 格 customText 语义误报（tn-006「押韵赞美」被误判身体接触）+ 2 格卡数超标（19/10、14/10）。
2. **修复**：服务端 [route.ts](../../app/api/generate-session/route.ts#L74-L97) 接入与 App 完全同口径的 `filterCards`（含补齐重试+截断）；harness 判定器加否定/免责语境护栏并**内置自测**——[ai-matrix-3l.ts:1756-1760](../../tests/mac/ai-matrix-3l.ts#L1756-L1760) 正是用提示词引用的那句「若名字不便使用,可用昵称代替;没有身体接触要求。」做负例自测。
3. **最终波**（[ai-content-3l/](../qa/ai-content-3l)，176 个文件，至 22:00）：**176/176 无意外失败**（173 PASS + 3 预期错误：3.5 超长 400、3.7 错误 Key ×2）。pre-fix 的 14 格复跑后全部 PASS。

**由此产生两个问题：**

- **提示词的 119/14/46 与任何证据都对不上**。最接近的解读是"14 = pre-fix 的 14 格 FAIL"被误记成 14 个 P0。照单执行「先修判定器，再针对原 14 个 P0 复跑；不要盲目修改 14 处业务逻辑」会让执行者去找不存在的 14 个 P0、重复已完成的修复。
- **RESULT.md 自身也已内部矛盾**：§4 P0 清单引用的原文路径（如 `ai-content-3l/L1-1-018-…json`）现在显示 `verdict: PASS, p0: 0`、latency 9425ms，而 RESULT 表格记的是 FAIL/3995ms——即 RESULT.md 的表格与结论来自更早波次，其「❌ 未通过放行标准」不再被其引用的原始证据支持。

**修订建议（第一节 + 第二节 + 第九节联动改）：**

1. 第一动作改为「**矩阵对账**」：重生成或补记 RESULT.md——写明三波历史（pre-fix 14 格 FAIL → 判定器+服务端修复 → 最终波 176/176 PASS），以最终波为放行口径；未对账前维持 RC BLOCKED。
2. 「原 14 个 P0 targeted rerun」改为「pre-fix 14 格已在最终波复跑 PASS，核对复跑判定器与自测用例后销项」。
3. 若对账后最终波确为 0 意外失败，RC BLOCKED 的 reason 从「AI Matrix triage + routing fairness closure」收缩为「routing fairness closure（Coverage 接线 + 2 人死局 + 1:N 保护）」。

### P0-2｜"两层判定"与现有矩阵架构错位，按字面实现需要新增业务面

提示词要求把 Matrix 拆成 A（MODEL_COMPLIANCE，查 Provider 原始输出）与 B（PRODUCT_SAFETY，"必须把原始 AI 结果真实经过生产链 normalize→schema→safety-filter→buildPlayableDeck 再检查"）。事实是：

- 现有矩阵打的就是生产 API `/api/generate-session`，其响应**已经是** filterCards 之后的 playable deck（route.ts:74-97 注释明示"与 App buildPlayableDeck 完全同口径"）——**B 层早已存在，现有矩阵测的从来就是产品层**。
- "模型原始输出"在服务端内部，harness 根本看不到。要按字面建 A 层，要么 harness 绕过生产 API 直连 provider、要么服务端新增调试输出面——后者是业务改动，与提示词自己"不放宽 safety-filter、不为过 Matrix 造假"的意图相抵触。
- 提示词担心的"混判"实例（否定/免责语境误报）已在判定器修复中解决（含自测）；pre-fix 里真正属于产品层的穿透（boundaryTags 卡过服务端）也已由 route filterCards 修复。
- 另外：无论 A 层还是 B 层，boundary 检查都依赖**模型自报 boundaryTags**（生产 [safety-filter.ts:57](../../lib/ai/safety-filter.ts#L57) 与 harness 同源），"模型漏报标签"的盲区两层都覆盖不了——提示词的拆层并没有解决它真正担心的判定问题。

**修订建议：**第二节改为「① 判定器否定/免责语境护栏保持（已有自测，复审即可）；② PRODUCT_SAFETY=现有 API 矩阵口径不变；③ MODEL_COMPLIANCE 作为可选遥测（直连 provider、不进 Release Gate），是否建设单独拍板」。删除"必须把原始 AI 结果真实经过生产链再检查"的表述——这已经是现状，照写会诱导执行者去改服务端。

---

## 三、P1（冲突 / 需澄清后执行）

### P1-1｜"blocking P1=0"未定义，且与 PLAN §8 放行口径不一致
[AI-MATRIX-PLAN.md](../qa/AI-MATRIX-PLAN.md) §8 原口径是「P1 可带整改单放行」；提示词收紧为 `blocking P1=0` 但未定义什么算 blocking。当前 RESULT 记录的 3 个 P1 定性各异（2.4 题型不符 6 卡=真实语义问题；3.4 的 19/10、3.5 的 14/10=重复合并超发，最终波已消失）。建议逐个定性或给出 blocking 定义，避免执行者把无害超发当阻断项返工。

### P1-2｜治理缺口：未声明 Change 分类与文档落点
按 ORCA：Coverage 接线=补齐已冻结计划；Single-Anchor Guard、Mutual 1:N UI、RG-02/03 fixture 细化=**Change B**（局部 Requirement/DoD 更新，留 DEVELOP）。提示词只说"更新 HANDOFF"，未提以下文档同步，照做会再次 docs 与代码脱节：
- [PRODUCT_PLAN_V2.0.md](../pm/PRODUCT_PLAN_V2.0.md)：RG-02/03 fixture（1男3女/1男4女）、Single-Anchor 语义与优先级、第六节 1:N UI 表现层契约；
- [AI-MATRIX-PLAN.md](../qa/AI-MATRIX-PLAN.md)：头部"状态：PLAN（未执行）"改 EXECUTED 并链接 RESULT；§3.3 修正；
- [AI-MATRIX-RESULT.md](../qa/AI-MATRIX-RESULT.md)：按 P0-1 对账重生成。

### P1-3｜D7 保障 > Anchor 防连曝 的优先级冲突未消解
5 档保障的 qualifying opportunity 本身就是一次 targeted 展示。若 D7 恒高于 Anchor Exposure，保障窗口内的 anchor 仍会被连续定向——与「不允许 anchor+A→anchor+B→anchor+C」直接矛盾。且 Plan 的 Router 顺序（:62）中没有 D7 项，D7 在调度链中的位置无契约依据。需要一条消解规则（如：保障展示消耗 anchor 连曝预算/每保障窗口只豁免一次/保障 pending 时 anchor 防连曝计数不清零）并写进 Plan，否则实现者会各拍各的。

### P1-4｜3.3 修正与 RESULT §8 执行口径冲突未声明例外
RESULT §8 口径是「players < pack.minPlayers 的格不执行」（L2 的 most-likely@2人 6 格全 SKIP）；3.3 作为边界探测是唯一例外（pointing-game@2人 已执行）。提示词要求 3.3 再加 most-likely@2人，必须在 PLAN §3.3 写明「边界探测格允许执行非法人数组合」的例外口径，否则两个口径互相矛盾。

### P1-5｜冻结链缺 supervisor 复检
提示词第九节链路为 Builder→Reviewer→QA→lint→…，缺 ORCA 默认主链的 supervisor 复检环节（HANDOFF 历轮均有 supervisor 放行记录）。建议补上。

### P1-6｜commit/push 未指定分支名；版本号联动未提
AGENTS 红线要求 commit 指令含分支名（历史 RC 冻结均落 main，建议明示）；重冻 RC 是否动 `package.json` version 未说明——若动则必须三处同值（package.json / public/sw.js CACHE_VERSION / public/version.json，test 会卡），若不动则明示"RC 重冻不 bump 版本"。

---

## 四、P2（优化建议，不阻断）

1. **双"本次目标"段合并**：开头 8 条与正文 5 条重叠且粒度不同，指明以哪份为准。
2. **2 人回退漏洞的触发面写准**：`mixedPackIds` 为空需"在场≤1 人"或"用户关闭了所有 minPlayers≤当前人数的玩法"（最现实：2 人 + 只留 most-likely/pointing-game 开启）。E2E 用例应含"用户主动关包"路径，不只测 2 人默认路径。
3. **自动化补反向断言**：`min(male,female)=2` 的中等不均衡桌（如 2男3女）**不得**触发 SINGLE_ANCHOR_TABLE（防 guard 误伤均衡/近均衡桌）；3 人桌 1男2女 的第六节"单一候选 UI"是否适用（第五节 guard 不覆盖它）需明确，避免实现歧义。
4. **隐私禁令转为回归断言**：禁令本身是 Plan 已冻结条款且现状满足，建议在自动化断言里加"AI 请求 payload 不含 gender/姓名"一条，把防御性重申变成可执行检查。
5. **HANDOFF 撤销措辞**：建议补时间线说明（矩阵执行晚于 HANDOFF 快照），把"撤销"定性为"过期更新"而非纠错，避免下一棒误读为造假。
6. **RG-02/03"优先采用"的降级路径**：真人凑不齐 1男3女/1男4女 时怎么办未写（1男5女 写了"扩展真人场景"）；建议补一句"凑不齐时可用均衡桌，1:N 场景至少自动化覆盖"。
7. **RG-01 既有准备证据基于旧构建**：Key 持久化/双通道/离线 smoke（[RG-01-NEWRC-SMOKE.md](../qa/RG-01-NEWRC-SMOKE.md)）是本轮修复前的包跑的；重冻后需在新包上至少重跑机器 smoke，建议写进第九节冻结链。
8. **观察项处置**：矩阵 110 个观察项（I5 偏软、2 人局"大家"语境等）不在提示词范围；建议加一句"观察项本轮不修、只记账"，防止执行者自由发挥扩大范围。

---

## 五、值得肯定的设计约束（审查确认无冲突）

- 「不得修改 D1~D8 / 不新增独立 1:N 游戏 / 不新增题库 / 不新增第 8 个 Gate」与 Plan 冻结契约完全一致；
- 「补齐已冻结 Coverage，不另造第二套 Fairness State」——经代码核实这是当前最准确的定性（字段在、消费缺）；
- 「hard legality / consent / D7 / minPlayers 优先于 Coverage」与 Plan Router 顺序（:62）兼容；
- 「Single-Anchor 触发条件 min=1 且 max≥3、仅本地使用」与 D4（pairGender 当局快照、禁猜测）和「禁止持久化」节兼容；
- 「跳步不跳 code-reviewer+qa+supervisor」「升级走 Change C 报告」与 ORCA 升级机制兼容；
- 3.7 无 Key 测试方案与 RESULT §8.1 的建议逐字一致。

---

## 六、结论与下一步

| 项 | 判定 |
|---|---|
| 八大目标方向 | ✅ 全部成立 |
| 引用事实（119/14/46） | ❌ 与磁盘任何证据不符 |
| 与实际进度的时差 | ❌ 滞后一个修复波次（判定器修复+14 格复跑已基本完成） |
| 两层判定架构 | ⚠️ 与现状错位，B 层已存在，A 层需重新定义 |
| 治理流程（Change 分类/文档落点/supervisor/分支） | ⚠️ 四处缺口 |
| 代码指控（2 人回退 / Coverage 未接线） | ✅ 全部属实，修复指令可直接执行 |

**建议路径**：用户按本报告 P0/P1 修订提示词（核心是第一节换成"矩阵对账"、第二节换成"判定器复审+可选遥测"、补 Change B 声明与文档落点）→ 交桌面编排者执行；第三节（2 人死局）、第四节（Coverage 接线）、第五~八节（Single-Anchor/1:N/Gate fixture）可原样保留。

- 目标：RC 冻结前收口提示词审查
- 剩 P0：本报告 2 项（数字对账、两层判定重定义）——均属提示词修订，非代码问题
- 下一步：用户拍板修订口径 → 提示词 V1.2 → 交编排者按 Change B 执行
