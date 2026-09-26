# PRODUCT_PLAN_V2.0｜Change B 局部 Requirement / DoD 增量

- 状态：`PROJECT_PHASE=DEVELOP`；`CHANGE_REQUEST=B`；`DEV_BASELINE=PRODUCT_PLAN_V2.0` 保持不变。本文件是执行增量，不生成新 Plan 版本，不宣称 RC 已可重冻。
- 唯一需求权威：用户《Party Night V2｜RC 冻结前最终收口提示词 V1.2》（2026-09-26，下文称“用户 V1.2”）。冻结语义以 `PRODUCT_PLAN_V2.0.md` 为准；旧 `V2-R3-event-table.md` 的单计数器、旧 `V2-R4-pair-contract.md` 的 `D5=TBD` 不覆盖 V2.0 已决口径。
- 本次只定义交付与验收。矩阵原始 JSON 只读对账结果：`ai-content-3l/` 176 格＝173 `PASS`＋3 `EXPECTED-ERROR`＋0 `FAIL`；`ai-content-3l-pre-fix/` 14 格旧 `FAIL` 均在最终目录找到同名 `PASS`。这些数字不替代 QA 的逐格审计及 3.3 新口径重算。

## 一、变更定位、冻结边界与 Change C 红线

Change B 仅补现有 Player Coverage 的消费、1:N Single-Anchor 薄调度、Mutual 单候选 UI、两人玩法与空池封堵、Matrix 证据及负向边界探测口径，并细化 RG-02 的既有 fixture。D1 内容真源、D2 单一 V2 Router、D3 双计数器、D4 本局男女合法 pair、D5 双向且每人 active MATCH 上限 2、D6 neutral/expansion 不推进关系、D7 展示即 offered 且两次合格 pair opportunity 内提供合法 5 档、D8 耗尽/洗牌策略均不改。不重写 Heat、Signal、Consent、私密互选、内容题库或 Release Gate 数量。

按用户 V1.2 §0：**“如必须修改核心 Relationship State schema、改变 D1～D8、Heat/MATCH/Consent/D7 语义或重写 Router 主语义，立即停止并按 Change C 报告。”** 按 §十六：**“出现核心契约变更需求时：停止 Change B，按 Change C 报告并等 Human Gate。”** 仅允许在现有 Session participant、Coverage、Router 和 UI 上做局部实现。不得用实现困难自行扩大基线。

## 二、可测 Requirement

每项的“文件”是建议施工与验收落点；Builder 不得据此越过冻结契约。编号用于 Review / QA 追踪。

| ID | 需求与原文出处 | 验收口径 | 涉及文件建议 |
|---|---|---|---|
| R-CB1 | 矩阵先对账，三波历史分开；14 格旧 FAIL 不冒充最终失败；最终波精确列 PASS / expected-error / unexpected-failure。`RC=BLOCKED` 直至对账完成，确认无意外失败后 blocker 收缩为 `routing fairness closure + 2-player closure + Single-Anchor closure`。【用户 V1.2 第一节】 | QA 以原始 JSON 按 cell ID 逐格比较旧 14 与最终波，说明真实 boundary 穿透及判定器误报如何关闭；报告不再无证据引用 PASS 119 / P0=14 / P1=46。旧 HANDOFF 快照表述为“旧快照已过期，按新证据更新”。当前只读核数为 176＝173＋3＋0，且旧 14 同名最终均 PASS；新 3.3 分类后重算分母。 | `docs/qa/ai-content-3l*`、`AI-MATRIX-RESULT.md`、`AI-MATRIX-PLAN.md`、`HANDOFF.md` |
| R-CB2 | 保留现有 `POST /api/generate-session → normalize / schema → filterCards → playable response` 的 `PRODUCT_SAFETY` 生产链；不新增强制双层链。【用户 V1.2 第二节】 | 复审否定/免责语境：“没有身体接触要求 / 不需要身体接触 / 可跳过”不得误杀；服务端 `filterCards` 与 App 一致。Release Matrix 仍走生产 API；不设 debug API、原始 Provider 输出或直连 Provider 作为当前 Gate；`MODEL_COMPLIANCE` 仅为未来可选研发遥测。 | `app/api/generate-session/route.ts`、`lib/ai/safety-filter.ts`、`lib/ai/generate-deck.ts`、`tests/unit/generate-session-filter.test.ts`、`tests/unit/safety-redteam.test.ts` |
| R-CB3 | blocking P1 仅按本节下列七条判定；模型风格、尺度偏软、非阻断语义质量及观察项不自动升级，最终波已消失的历史 P1 只记史。【用户 V1.2 第三节】 | Reviewer / QA 对每个 P1 给出“命中哪条／不命中”及证据；沿用 `AI-MATRIX-PLAN` 的“P1 可以带整改单放行”，但 blocking P1 必须为 0。 | `docs/review/`、`docs/qa/AI-MATRIX-RESULT.md`、`docs/qa/BUGS*.md` |
| R-CB4 | 保留 minPlayers 过滤；两人直选 `most-likely`、`pointing-game` 不得进入生成；删除 `mixedPackIds.length ? mixedPackIds : [...BUILTIN_PACK_IDS]` 的空池复活。【用户 V1.2 第四节】 | 候选数大于 0 正常继续；为 0 时停在当前流程并明确提示，不能恢复关闭或人数非法玩法。测试六种路径见本节下方。 | `app/setup/page.tsx`、`lib/engine/pack-switcher.ts`、quick start / 主局切包入口、`tests/e2e/pack-min-players.spec.ts`、`tests/e2e/setup-regression.spec.ts` |
| R-CB5 | 使用现有 `playerCoverage` 接入 pair ranking：targeted offered 少者优先；`CARD_PRESENTED` 即 offered；completed/skipped 分开；skip 不制造 Signal，且不能因未完成立即再集中同一人；Coverage 只改软排序，不能越过硬合法。【用户 V1.2 第五节】 | 相同合法集、Signal、cooldown 下，offered 少者的 pair 优先；展示后即使跳过，下一次排序看到这次 offered；非法边始终不进入排名。`2男2女/2男3女/3男2女` 回归，`min(male,female)>=2` 时 Guard 为 false。复用现有四字段，不建第二套 Fairness State。 | `lib/v2-relationship/v2-routing.ts`、`v2-session.ts`、`v2-reducer.ts`、`v2-state.ts`（只读核 schema，优先不改）、`tests/unit/v2-routing.test.ts`、`tests/unit/v2-single-anchor.test.ts` |
| R-CB6 | Single-Anchor Guard 只在 active、已录入 `pairGender` 的 `min(maleCount,femaleCount)==1 && max(...)>=3` 触发；上张已展示 targeted card 含 anchor 时，下次优先合法 all-player / group-crowd / 其他非定向 relationship opportunity。Exposure 取 `CARD_PRESENTED/offered`。【用户 V1.2 第六节及 6.1】 | `1男3女/1女3男/1男4女/1女4男/1男5女/1女5男` 可识别；正常有合法非定向卡时不得 `anchor+A→anchor+B→anchor+C` 连续出；展示后 skip 仍触发 Guard。不得猜姓名、身份或跨局字段。 | `lib/v2-relationship/v2-session.ts`、`v2-routing.ts`、现有 Router 合法卡筛选、`tests/unit/v2-single-anchor.test.ts` |
| R-CB7 | Guard 与 D7 两层调度：先决定是否进入 pair opportunity；上轮 anchor targeted 后有合法非定向候选则先走非定向，该轮不计 qualifying、pending 不清零/不消耗；已选择合法 pair opportunity 后 D7 优先于 Coverage/Signal。无合法非定向候选允许受控 bypass，reason=`NO_LEGAL_NON_TARGETED_CANDIDATE`，不得死锁。【用户 V1.2 第六节 6.2】 | 对同一 pending tracker 比较“非定向插入前后”的 `qualifyingOpportunitiesSeen/status` 不变；真正 pair opportunity 仍在既定两次窗口出合法 5 档；bypass 返回卡或既有安全耗尽结果且有机器可读 reason，不能空转。 | `lib/v2-relationship/v2-session.ts`、`v2-guarantee.ts`（原则上保留纯函数语义）、Router 候选接口、`tests/unit/v2-single-anchor.test.ts`、`tests/unit/v2-session.test.ts` |
| R-CB8 | 多数方 Coverage：未获 targeted offered opportunity 的玩家优先于已获者；只保证系统提供机会，不保证真人完成。【用户 V1.2 第六节 6.3】 | 同等硬合法、D7 和 Guard 条件下，下一张合法定向卡选择未获 offered 的多数方；skip 也算已获 offered，不因 completed=0 永久优先。 | `lib/v2-relationship/v2-routing.ts`、`v2-session.ts`、`tests/unit/v2-single-anchor.test.ts` |
| R-CB9 | Mutual UI 按**当前合法异性候选数**分支：仅 1 人时显示“今晚到现在，你愿意继续了解 TA 吗？”和“愿意 / 暂时没有”；分别映射唯一候选 / `null`。Routing 的 `SINGLE_ANCHOR_TABLE` 仍按 `1:N,N>=3`，两者解耦。【用户 V1.2 第七节】 | `1男2女` 中多数方即使 Guard=false 也可见 Yes/No；anchor 或多候选继续现有选择 UI。只使用当前合法 pair，不能选非候选人。双向才 MATCH、单向不公开、active MATCH≤2、raw unilateral choice 不落盘。 | `components/game/MutualCheckSheet.tsx`、`lib/v2-relationship/v2-mutual-check.ts`、`tests/unit/mutual-check-sheet.test.tsx`、`tests/unit/v2-mutual-check.test.ts` |
| R-CB10 | 隐私自动化：`pairGender` 只属本局 Session participant；AI 请求 payload/prompt/log/export 不含 `pairGender`、`male/female` 枚举、anchor 标志、性别数量结构、玩家真实姓名；1:N / Coverage / Mutual candidate 只在本地 Relationship Engine 算。【用户 V1.2 第八节】 | 用带可识别姓名和性别的 fixture 截获实际发送的 AI 请求与日志/导出，逐项负断言；刷新、取消、结束后原始单向选择不存在可恢复持久态。不能仅靠字符串静态搜索代替运行时断言。 | `tests/unit/v2-privacy-regression.test.ts`（建议新增）、`tests/unit/v2-mutual-check.test.ts`、AI 请求组装入口、持久化/导出入口 |
| R-CB11 | Matrix §3.3 改 `NEGATIVE_BOUNDARY_PROBE`：只测 `pointing-game@2` 与 `most-likely@2`；`compatibility-test` 不属非法人数探测。【用户 V1.2 第九节】 | 探测不算合法 Matrix 格、不进 Release Matrix PASS 分母；允许特造非法请求，仅显式阻止／过滤为空／安全拒绝为预期；Provider 成功响应不能记 App PASS，`local-fallback` 不能记 AI PASS。常规非法组合仍 `SKIPPED-ILLEGAL`、不执行。 | `tests/mac/ai-matrix-3l.ts`、`docs/qa/AI-MATRIX-PLAN.md`、`docs/qa/AI-MATRIX-RESULT.md` |
| R-CB12 | RG-02 真人 4 人 fixture 固定为 `1男3女` 或 `1女3男`；凑不齐则 PENDING，不能以 `2男2女` 代替宣称通过。RG-03 保持现有 5 人 Gate，优先 `1男4女/1女4男` 但不新增性别硬门槛。`1男5女` 必做自动化，真人后续扩展。【用户 V1.2 第十二节】 | RG-01～RG-07 仍 7/7；RG-02 必须完成原 V2.0 的真人弱光、至少 20 个 `sessionCompletedRounds` 全部要求；RG-03 仍按原契约。无新 Gate 编号。 | `PRODUCT_PLAN_V2.0.md` 的后续同步、`docs/qa/RG-*.md`、`HANDOFF.md` |

**R-CB3 blocking P1 七条原文**【用户 V1.2 第三节】：

- 合法用户路径可稳定复现的死局 / 无法继续；
- 违反 D1～D8 或冻结 Plan 的产品行为；
- 真实隐私泄露；
- 真实安全过滤穿透；
- 合法玩法被错误禁用或非法玩法可进入；
- 关键 Release Gate 无法执行；
- Single-Anchor / Coverage 的硬 DoD 失败。

**R-CB4 六项最低测试清单**【用户 V1.2 第四节】：

1. 2 人直选 `most-likely` → 阻止。
2. 2 人直选 `pointing-game` → 阻止。
3. 3 人后两者恢复。
4. 2 人且用户主动关闭所有 `minPlayers<=2` 玩法 → mixed pool=0，明确提示，不复活。
5. active 玩家异常降到不足人数时也不得绕过。
6. 主局切包 / quick start 同口径。

## 三、DoD 与自动化硬断言

下表把用户 V1.2 §十一的 15 条逐项落为机器断言。`tests/unit/v2-single-anchor.test.ts` 为建议新文件，已有测试文件继续扩展；测试只用本地 fixture，不发 AI 请求。所有 20 opportunity fixture 使用固定 seed、可重放，并记录每轮合法候选、展示卡、target、Coverage、Guard reason、D7 tracker 和 Heat；不规定未由需求给出的配额百分比。

| # | 硬断言 | 测试落点 |
|---|---|---|
| 1 | `min==1 && max>=3` 正确识别 Single-Anchor，inactive/null 不计入。 | `tests/unit/v2-single-anchor.test.ts` |
| 2 | `2:N/N:2` 不误触发 Guard，特别是 2男2女/2男3女/3男2女。 | `tests/unit/v2-single-anchor.test.ts` |
| 3 | 有合法非定向候选的正常路径中，anchor targeted 后下一张不是 anchor targeted。 | `tests/unit/v2-single-anchor.test.ts` |
| 4 | targeted `CARD_PRESENTED` 即 Exposure；随后 skip 不取消 Guard，也不制造 Signal。 | `tests/unit/v2-single-anchor.test.ts`、`tests/unit/v2-reducer.test.ts` |
| 5 | 多数方尚无 targeted offered 的人，在合法与 D7 同条件下先于已有 offered 者。 | `tests/unit/v2-single-anchor.test.ts`、`tests/unit/v2-routing.test.ts` |
| 6 | D7 pending 被非定向轮隔开时 status/qualifying count 不变。 | `tests/unit/v2-single-anchor.test.ts`、`tests/unit/v2-session.test.ts` |
| 7 | 实际选中 pair opportunity 后仍按冻结 D7 两次合格机会内展示合法 5 档，展示即 offered。 | `tests/unit/v2-session.test.ts`、`tests/unit/v2-guarantee.test.ts` |
| 8 | 无合法非定向候选时有 `NO_LEGAL_NON_TARGETED_CANDIDATE`，受控 bypass 且有限步返回。 | `tests/unit/v2-single-anchor.test.ts` |
| 9 | 20 opportunities 轨迹中 Heat 只随首次合法 relationship completed 推进，单调不降。 | `tests/unit/v2-single-anchor.test.ts`、`tests/unit/v2-reducer.test.ts` |
| 10 | regular mutual 仍仅在 relationship effective count 9/14/19 的冻结条件触发，不被非定向/skip 改写。 | `tests/unit/v2-single-anchor.test.ts`、`tests/unit/v2-mutual-check.test.ts` |
| 11 | 仅双向秘密选择形成 MATCH；单向与 Yes/No 的 `null` 不形成 MATCH。 | `tests/unit/v2-mutual-check.test.ts`、`tests/unit/mutual-check-sheet.test.tsx` |
| 12 | 任一玩家 active MATCH 不超过 2；被 cap 拦截不泄露原因。 | `tests/unit/v2-mutual-check.test.ts` |
| 13 | 单向原始选择不进入 Session、IndexedDB、local/sessionStorage、日志、导出或可恢复快照。 | `tests/unit/v2-privacy-regression.test.ts` |
| 14 | 实际 AI payload/prompt 不含 gender/name/anchor 及性别数量结构；日志/导出亦然。 | `tests/unit/v2-privacy-regression.test.ts` |
| 15 | 普通桌 2男2女/2男3女/3男2女的排序、合法性、D7、mutual 与出卡回归无差异。 | `tests/unit/v2-single-anchor.test.ts`、`tests/unit/v2-routing.test.ts`、`tests/unit/v2-session.test.ts` |

**七组固定 fixture**【用户 V1.2 §十一】：`1男3女 ×20`、`1女3男 ×20`、`1男4女 ×20`、`1男5女 ×20` relationship opportunities；回归 `2男2女 ×20`、`2男3女 ×20`、`3男2女 ×20`。普通桌“无回归”以现有冻结 pair 合法集、选卡可继续、Heat/D7/mutual/MATCH/Consent 不变及 Guard=false 为判定；不把公平随机序列逐张相同当成必要条件。隐私断言在真实组装/序列化边界截取结果，不接触真人数据。两人六路径另按 R-CB4 验收。

**本轮禁止事项（用户 V1.2 §十六原文）**：

- 重复修已经在最终 Matrix 波次关闭的问题；
- 为了拿模型原始输出新增 debug API；
- 为了过 Matrix 放宽 safety-filter；
- 把 local-fallback 当 AI PASS；
- 新增第二套 Fairness State；
- 新建“1男多女专属游戏”；
- 新建重复题库；
- 把性别/anchor/姓名送 AI；
- 新增第 8 个 Release Gate；
- 未经 Reviewer + QA + Supervisor 就重冻；
- 自动 bump version；
- 擅自扩大到矩阵观察项。

## 四、Builder 派工拆分与建议顺序

建议先完成 Matrix 证据对账，再依次 **B4 → B1 → B2 → B3**。B4 修正口径后由 QA 产生新报告；B1 封住入局漏洞；B2 接 Coverage 与 Guard；B3 适配 Mutual 和隐私。每个 Builder 交付均走 Code Reviewer → QA → Supervisor；文档归属按第五节，不由 Builder 越权替其他角色签证据。下列命令为目标验收命令，新增测试文件须先落盘；全门禁和新 Android 构建留给整链终审。

| 任务 | 修改建议、依赖与验收命令 | 禁止越界及风险 |
|---|---|---|
| **B4｜Matrix 3.3 负向口径** | 依赖只读三波对账；改 `tests/mac/ai-matrix-3l.ts` 的 3.3 两格、分类和报告计算；配合 QA 同步 `AI-MATRIX-PLAN/RESULT`。验收：`npx tsx tests/mac/ai-matrix-3l.ts selfcheck`、`pnpm typecheck`；对报告分母作离线单测/重算，禁止新 AI 请求作为本任务前提。 | 不改生产 safety 链、不增 debug API、不把非法 Provider 成功当 App PASS。风险：现有 3.3 `compatibility-test@2` 是合法格，改为 `most-likely@2` 后旧 176 格历史结果不可直接冒称新方案结果；保留历史与新分类的可追溯映射。 |
| **B1｜2 人非法＋mixed 空池** | 依赖 B4 的非法格定义；改 `app/setup/page.tsx`、必要的 `lib/engine/pack-switcher.ts` 与 quick start / 主局切包入口；补六路径 E2E/unit。验收：`pnpm exec vitest run tests/unit/pack-switcher.test.ts tests/unit/setup.test.ts`、`pnpm exec playwright test tests/e2e/pack-min-players.spec.ts tests/e2e/setup-regression.spec.ts`。 | 不复活关闭玩法、不放宽 minPlayers、不改题库或 Matrix API。风险：`draftConfig()` 的空池 fallback 已实存；快速开局可能沿用旧 config，需分别核 active 人数和关闭状态。 |
| **B2｜Coverage＋Single-Anchor＋D7 两层** | 依赖 B1 的合法入局；改 `lib/v2-relationship/v2-routing.ts`、`v2-session.ts`，如需在现有 reducer 补展示时机则局部改 `v2-reducer.ts`；优先复用 `v2-state.ts` 现有 Coverage；新增 `tests/unit/v2-single-anchor.test.ts`，扩 `v2-routing/v2-session/v2-guarantee` 测试。验收：`pnpm exec vitest run tests/unit/v2-single-anchor.test.ts tests/unit/v2-routing.test.ts tests/unit/v2-session.test.ts tests/unit/v2-guarantee.test.ts`。 | 不改 core schema、D7 终态、Heat/MATCH/Consent，不建第二套 state。风险：当前 ranking 只看 Signal/cooldown，reducer 在 completed/skipped 才写 offered，与“CARD_PRESENTED 即 offered”有时序差；需用既有状态/事件链形成唯一幂等消费，不能同时在展示和终态加两次。另需先判断非定向合法池，避免 D7 对未进入 pair opportunity 的轮次误计。 |
| **B3｜Mutual 单候选 UI＋隐私** | 依赖 B2 的当前合法候选计算；改 `components/game/MutualCheckSheet.tsx`，必要时局部扩 `v2-mutual-check.ts` 的候选视图适配；补 `tests/unit/mutual-check-sheet.test.tsx`、`tests/unit/v2-mutual-check.test.ts`、`tests/unit/v2-privacy-regression.test.ts`。验收：`pnpm exec vitest run tests/unit/mutual-check-sheet.test.tsx tests/unit/v2-mutual-check.test.ts tests/unit/v2-privacy-regression.test.ts`、`pnpm exec playwright test tests/e2e/v2-mutual-flow.spec.ts`。 | 不改秘密答案持久化边界、双向 MATCH、active cap 2、Routing Guard 阈值。风险：现有 `submitMutualChoice` 只验证目标在 run.playerIds 中，UI 必须从真实合法 pair 派生唯一候选并做边合法校验，避免候选减少/暂离后选到旧目标。 |

整链顺序沿用户 V1.2 §十三：Matrix evidence reconciliation → Builder → Code Reviewer → QA → Supervisor → lint → typecheck → unit → E2E → 1:N/Coverage fixtures → Android Release build → 新构建机器 smoke → 最终回执 → `commit/push main` → 重冻 RC → HANDOFF → 通知 RG-01。旧 RC 的 Key persistence、AI direct/native transport、offline startup/recovery 证据不能代替新构建 smoke。`main` 是用户指定目标分支；本文件不授权本轮 Planner 执行 Git 或设备动作；重冻不自动 bump 版本，若后续明确 bump，`package.json`、`public/version.json`、`public/sw.js` 的 `CACHE_VERSION` 三处同值。

## 五、后续文档同步清单与责任

1. **Planner → `docs/pm/`**：本增量先锁 Requirement/DoD；开发闭环时将 Coverage 实际接线、Single-Anchor、D7 两层、Mutual 单候选、RG-02 fixture 同步进 `PRODUCT_PLAN_V2.0.md`，保持 `DEV_BASELINE` 与 Plan Version 不变。【用户 V1.2 §十第 1 项】
2. **QA → `docs/qa/AI-MATRIX-PLAN.md`**：将 `PLAN/未执行` 标成 `EXECUTED/历史方案`，链接 RESULT，3.3 写为 `NEGATIVE_BOUNDARY_PROBE` 及合法分母例外。【用户 V1.2 §十第 2 项】
3. **QA → `docs/qa/AI-MATRIX-RESULT.md`**：以 176 份最终 JSON 和 14 份旧 FAIL 逐格对账，写 pre-fix→fix→final 时间线及新 3.3 分类后的精确数字；不能把旧报告 98.3% 原样当新分母结论。【用户 V1.2 §十第 3 项】
4. **Task Manager → `docs/handoff/HANDOFF.md`**：更新 RC blocker，过期“重冻条件已具备”标旧快照，终审和重冻后才写 `NEW_RC_COMMIT` 与 RG-01 通知状态。【用户 V1.2 §十第 4 项】
5. **Code Reviewer → `docs/review/`；QA → `docs/qa/`；Supervisor → 被检文件评论区 / TM 回执**：保留完整 Review/QA/Supervisor 证据链，P0、blocking P1、自动化及新 Android smoke 与新 RC 对应。【用户 V1.2 §十第 5 项】

## 六、风险、阻塞与需升级条件

- **当前 RC**：`BLOCKED`。只读原始 JSON 支持最终波 173 PASS＋3 EXPECTED-ERROR＋0 FAIL，旧 14 均有最终 PASS；仍须 QA 对真实 boundary 穿透/判定器误报逐格归因、修 3.3 分母，才能把 Matrix blocker 正式销项。销项后 blocker 文案为 `routing fairness closure + 2-player closure + Single-Anchor closure`，不是“可重冻”。
- **已见代码缺口**：`v2-routing.ts` 没有 Coverage 输入；`v2-reducer.ts` 当前只在 `REL_CARD_COMPLETED/SKIPPED` 写 offered，`CARD_PRESENTED` 尚未进这条 Coverage 更新；`app/setup/page.tsx` 的 mixed 空池 fallback 会复活全部内置玩法；`ai-matrix-3l.ts` 当前 3.3 包含合法 `compatibility-test@2`，并把 boundary-probe 计入合法通过率。均按 B1/B2/B4 处理。
- **D7 时序风险**：`v2-guarantee.ts` 的纯函数 `qualify` 达上限会转 `offered`，而冻结 D7 要求合法 5 档 `CARD_PRESENTED` 才 `offered`。Builder 必须证明主链“第二次合格机会先选出并展示合法 5 档，再提交终态”的顺序；若无法在既有契约内保证，不得靠改 D7 定义掩盖，应上报 Change C。
- **可选字段边界**：若消费 Player Coverage 看似必须改 `v2-state` schema，先尝试在 ranking 层传入现有 `relationship.playerCoverage` 四字段，并在既有事件/投影处解决展示时机及幂等；不新增第二套 Fairness State。若仍需修改**核心 Relationship State schema**才能实现，暂停 B2，列出最小 schema diff、迁移/恢复影响与测试证据，交 TM 按 Change C 请求 Human Gate。
- **其他 Change C 触发点**：需变更 D1～D8、D3 Heat/双计数器/9-14-19 节奏、D4 pair 资格、D5 MATCH 双向或上限、Consent 私密生命周期、D7 qualifying/offered/终态、D8 耗尽，或重写 V2 Router 主语义时，停止 Change B，不先改代码。独立 1:N 游戏、重复题库、额外 Gate 也超出本轮授权。
- **RG 阻塞**：RG-02 若缺 `1男3女/1女3男` 真人局就保持 `PENDING`；自动化七组全绿不能代替真人。RG-03 不增性别比例硬门槛。Release 前仍须 `RG-01～RG-07` 全部 `7/7 PASS`，不能由本轮单测宣称完成。
