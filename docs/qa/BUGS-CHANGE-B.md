# BUGS｜Change B 终审（Phase2 DEVELOP）

- 日期：2026-09-27（Asia/Shanghai）
- 对象：Change B RC 冻结前代码、自动化门禁、AI 三层矩阵证据
- 基线：`PRODUCT_PLAN_V2.0`；Change B DoD：`docs/pm/PRODUCT_PLAN_V2.0-CHANGE-B.md`
- 结论口径：blocking P1 按用户 V1.2 §三的七条；本文件仅记录本次 QA 结果，不代表 Android smoke 或真人 RG 已完成。

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| CB-QA-01 | P0 | 否 | 全门禁、15 条 DoD 与矩阵证据复核 | PASS | Matrix 整改销项 | 176 原始格复算：合法 174（171 PASS、3 EXPECTED-ERROR），FAIL=0；P0/P1=0；NEGATIVE_BOUNDARY_PROBE 2/2 成立。 |
| CB-QA-02 | blocking P1 | 否 | 2 人非法玩法、mixed 空池及 pack minPlayers 下限回归 | PASS | Change B 功能终审 | 相关单测与 E2E 全绿；most-likely@2 仍非法，服务端过滤为空回落。 |
| CB-QA-03 | 普通 P1 | 否 | lint / typecheck / unit / E2E / build / matrix selfcheck | PASS | Change B 全门禁 | 本轮命令全部退出 0；见下方实测尾部。 |

## A. 全门禁实测

1. `pnpm lint`：退出 0；`✖ 7 problems (0 errors, 7 warnings)`。7 条 warning 只位于 `scripts/decision/orca-decide.mjs`、`scripts/decision/run-shadow.mjs`、`tests/phone/dump-state.ts`，均不在本轮改动文件清单内，无本轮改动文件新增 warning。
2. `npx tsc --noEmit`：退出 0；无输出，0 error。
3. `pnpm vitest run`：`Test Files 100 passed (100)`；`Tests 902 passed (902)`；退出 0。
4. `pnpm test:e2e`：`94 passed (46.6s)`；`4 skipped`；退出 0。跳过项包含 PWA Service Worker reload 场景；不能据此声称该项本轮已实测。
5. `pnpm build`：退出 0；Next.js 16.3.3 webpack production build 编译、TypeScript、静态页生成均成功。route 列表尾部：
   ```text
   ○ /settings/ai
   ○ /setup
   ○ /summary
   ○ Static · ƒ Dynamic · ● SSG
   ```
6. `npx tsx tests/mac/ai-matrix-3l.ts selfcheck`：退出 0；176 格、合法 App 分母 174、L1=43 / L2=123 / L3=18，覆盖自检、对照组、红线反向自检、3.3 分类和分母排除均 PASS；末行为 `selfcheck 全部通过`。

## B. DoD 15 条硬断言映射与独立复算

| # | 断言摘要 | 自动化覆盖（测试文件＋测试名） | 复核 |
|---:|---|---|---|
| 1 | `min==1 && max>=3`；inactive/null 不计 | `tests/unit/v2-single-anchor.test.ts`「① min==1…null / inactive 一律不计入」 | PASS |
| 2 | 普通桌 2:N / N:2 不触发 Guard | 同文件「② 2:N / N:2 普通桌不触发」；重点 2男2女、2男3女、3男2女 | PASS |
| 3 | Anchor targeted 后下一张不再 targeted | 同文件「③ anchor targeted 后下一张不是 anchor targeted」及 7 组固定 fixture 测试 | PASS |
| 4 | 展示即 Exposure；skip 不撤销 Guard、不制造 Signal | 同文件「④ targeted 展示即 Exposure」；`tests/unit/v2-reducer.test.ts`「REL_CARD_SKIPPED 不制造 Signal / Coverage 终态」相关断言 | PASS |
| 5 | 未获 targeted offered 的多数方优先 | 同文件「⑤ 未获 targeted offered 的多数方先于已获者」；`tests/unit/v2-routing.test.ts`「Coverage 少者优先」 | PASS |
| 6 | 非定向轮不消耗/清除 D7 pending | 同文件「⑥ 第一层：非定向轮不计 qualifying」及「⑦e 20 轮轨迹」 | PASS |
| 7 | Pair opportunity 第二次合格机会强制合法 5 档；展示算 offered | 同文件「⑦a」「⑦b」「⑦d」；`tests/unit/v2-session.test.ts`「seen=1 时强制合法 5 档，展示即 offered」；`tests/unit/v2-guarantee.test.ts`「D7 语义」 | PASS |
| 8 | 无合法非定向候选给 reason、受控 bypass 有限步返回 | 同文件「⑧ reason 是显式常量…有限步返回」「⑧b 连一张卡都没有时…不死锁」 | PASS |
| 9 | Heat 仅随首次合法 relationship completed 推进且单调 | 同文件「⑨ 20 轮轨迹 Heat 单调不降」；`tests/unit/v2-reducer.test.ts`「推进 effective 计数＋Heat」 | PASS |
| 10 | Mutual 只在 effective count 9/14/19 冻结检查点触发 | `tests/unit/v2-mutual-check.test.ts`「9/14/19 检查点」；`tests/unit/v2-reducer.test.ts`「SYSTEM_MUTUAL_CHECK_DUE」检查点及剩余轮数/次数/间隔门禁 | PASS |
| 11 | 仅双向秘密选择成 MATCH；单向/Yes-No null 不成 | `tests/unit/v2-mutual-check.test.ts`「双方互选成 MATCH」「暂时没有 → null」；`tests/unit/mutual-check-sheet.test.tsx`「愿意 / 暂时没有」映射 | PASS |
| 12 | 玩家 active MATCH ≤2；拦截不泄露原因 | `tests/unit/v2-mutual-check.test.ts`「一方已有 2 个 active MATCH…没有任何线索」；`tests/unit/v2-reducer.test.ts`「D5 MATCH 上限 2」 | PASS |
| 13 | 单向原始选择不进入 Session / 存储 / 外发快照 | `tests/unit/v2-privacy-regression.test.ts`「单向互选：原始选择不落盘、不落 Session、不出现在外发序列化里」；`tests/unit/v2-mutual-check.test.ts`「Storage / IndexedDB 全程无写入」 | PASS |
| 14 | AI payload/prompt、日志/导出不含性别/姓名/anchor/性别结构 | `tests/unit/v2-privacy-regression.test.ts`「实际 HTTP body」「实际 payload / prompt」「日志同样干净」 | PASS；按编排者裁定，displayName 昵称沿用 V1.0 冻结行为；真名、参与者投影、性别结构不外发 |
| 15 | 2男2女/2男3女/3男2女普通桌排序、合法性、D7、mutual、出卡回归 | `tests/unit/v2-single-anchor.test.ts`「回归 3 组：Guard 恒 false…」；`tests/unit/v2-routing.test.ts`「普通桌…20 次调度」；`tests/unit/v2-session.test.ts` Coverage / D7 测试 | PASS |

**四项独立复算（脚本仅在 `/tmp/qa-change-b-independent.ts`，未改仓库代码）：**

- `1男3女、1男4女、1男5女、3男1女` 各 20 抽，共 80 抽：anchor targeted 不连续，且每组均有 targeted opportunity：PASS。
- `2男2女、2男3女、3男2女` 各 20 抽，共 60 抽：Guard 恒未应用、`singleAnchorTable=false`：PASS。
- 预置上一轮 anchor targeted、router 仅提供定向卡：单次返回 CARD，Guard `applied=true`，reason 精确为 `NO_LEGAL_NON_TARGETED_CANDIDATE`：PASS；无死锁。
- 20 次合法 completed：Heat 单调不降，逐次等于 `heatForEffectiveCount`：PASS。

## C. 回归真实性抽查

- `tests/unit/v2-single-anchor.test.ts`：**中高强度**。测试通过真实 `drawV2SessionCard` / pair ranking / reducer 调度，只把 Router 卡池替身化为固定确定性 fixture；断言检查展示事实、Guard、D7、Coverage、Heat 多项状态。风险是 fixture Router 与生产 Router 的卡资格由测试辅助代码镜像，不能单独证明生产 SSOT 内容集无误；生产 Router 的 all-players 过滤另有同文件测试。没有发现从被测实现生成预期值的自证循环或明显弱化断言。
- `tests/unit/setup-mixed-empty-pool.test.ts`：**中高强度**。直接调用 setup/mixed 候选、主局切包、快速开局的真实函数，覆盖 2 人空池、3 人恢复和不复活已关闭玩法；具体预期集合固定，不由被测实现动态生成。强度足以证伪“空池回退全部玩法”。
- `tests/unit/pack-minplayers-floor.test.ts`：**高强度**。固定构造模型自报 minPlayers=2 的非法卡，同时跑 normalize、共享 safety filter、实际 API POST 和 App buildPlayableDeck；断言明确要求非法卡被滤、合法卡保留、服务端过滤计数和客户端/服务端卡序一致；另查 SSOT 本地卡源。没有通过降低预期人数阈值来取绿。注意 fake Provider 是隔离测试替身，覆盖边界逻辑而非外部供应商服务可用性。

## D. AI Matrix 原始证据独立复算

直接遍历 `docs/qa/ai-content-3l/` 下全部 JSON（176 份），按每份 `verdict / p0 / p1 / cell.mode` 汇总：

- 全体：PASS 173（含负向探测 2），EXPECTED-ERROR 3，FAIL 0；P0=0、P1=0。
- App 合法分母：174；其中 PASS 171、EXPECTED-ERROR 3、FAIL 0；通过率 171/174 = 98.3%。SKIPPED-ILLEGAL 6 与 SKIPPED-ENV-FALLBACK 2 不在 176 个已执行 JSON 中；3.3 两格为额外执行的 NEGATIVE_BOUNDARY_PROBE，不进 App 分母。
- 两个 3.3 JSON 均 `mode=boundary-probe`、2 人、HTTP 200、`cardCount=0`、`cards=[]`、`generationSource=local-fallback`；pointing-game `filteredCount=25`、most-likely `filteredCount=20`，各 `retryCount=1`，分类和预期结论均正确，防线 2/2 PASS。它们没有被计作 AI PASS。
- 与 `docs/qa/AI-MATRIX-RESULT.md` 摘要相符：174 合法分母、171 PASS / 3 EXPECTED-ERROR / 0 FAIL、P0/P1=0、3.3 2/2。差异：文档 §0 写 171/171 `generationSource=ai`，该统计口径针对合法且成功 AI PASS 格；不是全 174 格。独立汇总未发现 FAIL 或 P0/P1 漏报。

## E. 安全红线与 2 人非法玩法

- `lib/ai/safety-filter.ts` 的 diff 仅在人数下限收口：导入 `effectiveMinPlayers` 并把 `card.minPlayers > playerCount` 替换为 `effectiveMinPlayers(card) > playerCount`；`HARD_BLOCK_PATTERNS`、`PAIRWISE_BLOCK_RULES`、`isHardBlocked` 文本及条件未变。`tests/unit/safety-redteam.test.ts` 18 项通过；矩阵 selfcheck 红线正反例均通过。
- `most-likely@2` 未被改成合法：`pack-minplayers-floor.test.ts` 明确断言服务端、App 与本地 SSOT 两人滤除、三人恢复；Matrix 两人负向探测实测 0 卡 local-fallback（filteredCount=20）。因此没有通过允许非法玩法来消除 FAIL。

## F. 版本号

- `package.json` `version`：`1.5.0`
- `public/version.json` `version`：`1.5.0`
- `public/sw.js` `CACHE_VERSION`：`1.5.0`
- 三处一致；本轮 diff 均未修改这些文件，未 bump。

## G. 已知待办与非阻断事项

以下均登记为已知待办，不计本轮 P0 / blocking P1；终审不替代后续用户裁定：

- Exposure 轮级口径：P2。
- Coverage offered 终态计数：P2。
- Single-Anchor 桌 pair opportunity 减半的体验影响：待用户过目。
- DoD #14 昵称口径：按编排者裁定，真名、参与者投影、性别结构不外发；displayName 昵称沿用 V1.0 冻结行为。
- finalize 不重算边在场性：P2。

## 结论与放行建议

- 本次 Change B 自动化 QA：**PASS**；按用户 §三七条口径，P0=0、blocking P1=0。矩阵侧已销项：PASS。
- 建议**可以进入 Android release build 与新构建 machine smoke 阶段**，但当前没有执行 Android release build / 新构建 smoke 的证据，不能标为通过或据此重冻 RC。用户 V1.2 §十三的冻结链仍要求新构建 smoke、Reviewer/QA/Supervisor 最终回执完成后，才 commit/push 和 NEW RC。
- RG-01~RG-07 状态保持 `NOT STARTED / PENDING`，本轮未触设备；RG-01 仍需新 RC 后真人手点，RG-02~RG-07 仍需真人 4/5 人局证据。真机 QA 状态：`NOT VERIFIED`。

## 真机QA会话能力预检结果

本轮未启动真机 QA session，未碰设备；不拼接此前 session 的证据。

- 日期/任务名：2026-09-27 / Change B 终审
- session ID：不适用
- 模型精确ID：`codex/gpt-6-luna`
- Runtime：本窗口终端（普通 QA；未执行真机操作）
- 原生CUA是否实际注入：不适用
- 可用工具精确名称：不适用
- CLI备用入口 / Orca Runtime / 权限 / UI Canary：未执行
- 最终结论：`NOT_VERIFIED`
- 是否允许进入正式真机 QA：本轮未执行；Android smoke 待后续新构建阶段

## Fix Attempt Fingerprint

- Task ID：CHANGE-B-QA-FINAL
- Root Cause Hypothesis：不适用（终审，无新增缺陷）
- Approach：全门禁＋DoD 映射审阅＋独立 deterministic fixture 复算＋176 份矩阵 JSON 汇总
- Files Changed：仅新增 `docs/qa/BUGS-CHANGE-B.md`
- Verification：见 A–F；所有执行命令退出码 0
- Failure Reason：无；4 项已跳过的 E2E 保持 skipped，Android smoke / RG 真人证据未执行
- Difference From Previous Attempt：本轮不改业务代码，不做设备验证

自证：本轮未改 app/、lib/、tests/ 代码；未 bump 版本；未 commit / push。
