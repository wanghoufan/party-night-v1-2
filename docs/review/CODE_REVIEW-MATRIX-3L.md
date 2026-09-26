# CODE REVIEW｜三层矩阵修复链（Change C 过滤+重试 · 红线双档判定器 · 3L 执行器 · 单测）

- Task：评审三层矩阵修复链未提交改动（死局修复已由 CODE_REVIEW-DEADLOCK-P1.md 过，不重评）
- Commit：未提交（工作区；范围=app/api/generate-session/route.ts、tests/mac/ai-matrix-redline.ts、tests/mac/ai-matrix-3l.ts、tests/unit/generate-session-filter.test.ts、docs/qa/AI-MATRIX-RESULT.md + ai-content-3l/-pre-fix/）
- Reviewer：code-reviewer（codebuddy/glm-5.3-flash）
- Result：**过**（P0=0；P1=2 带整改单；P2=4 backlog）

> 验证记录：pnpm lint 0 error（7 warning 均为既有 scripts//tests/phone 旧文件，非本次改动）；tsc --noEmit 过；vitest 831/831 全绿；`npx tsx tests/mac/ai-matrix-3l.ts selfcheck` 全过（覆盖 342/342 + 红线 15 项 + 语义豁免双向）。评审全程未改代码、未发 AI 请求、未碰设备。

## 逐项核验（任务目标 4 条）

1. **route.ts 过滤+重试语义（过）**
   - 重试有界：首跑循环 ≤2 次（UPSTREAM_FAILED 才续）+ 补齐重试恰 1 次，上游调用上限 3 次，无无限重试（route.ts:59-92）。
   - 去重按 id：`seen = Set(kept.map(id))` 合并重试批次（route.ts:89-90）。
   - slice 后 meta 如实：`generatedCount = slice 后 kept.length`（route.ts:95-96），不沿用首跑旧值；filteredCount 只计安全滤除、不计截断，口径自洽。
   - generationSource 口径未绕过：用最终 kept 调 `deckGenerationSource`（route.ts:97 → lib/domain/generation-source.ts:13）；AI 卡 `source` 由 `aiDeckResponseSchema` 强制默认 `"ai"`（lib/ai/card-schema.ts:6），故只要 kept 非空必判 ai；全滤时 200+0 卡+`local-fallback`，与客户端 `buildPlayableDeck` 本地补齐（lib/ai/generate-deck.ts:39-63）衔接一致，不静默混本地卡。
   - 复用 `filterCards` 全量口径（route.ts:77 vs lib/ai/generate-deck.ts:37 同参），无第二套局部实现。
2. **红线判定器（过）**：不违法 lookbehind 合法（V8 变长/多分支均支持，ai-matrix-redline.ts:47/57/67/83）；「查看手机」收窄为宾语枚举、裸「手机」移除（:67）；否定语境双档——selfcheck 实测 d 组「不得包含强迫饮酒」→ suspect 不 FAIL，c/f1-f3 真违规仍 strict（判定器未被改空）；e1-e7 六格误杀回归全过。
3. **3L 执行器（过，两处 P1 见下）**：pairwise 覆盖自检硬门（run 前 assertPairwiseReady，:1775-1782）；11 项断言齐；9-semantic 祈使放宽后负样本仍 FAIL（人工核验「今天天气不错/我们今晚都很开心/这个玩法真有意思」均不命中问句/前缀/动词表）；customText 否定豁免有正向防改空对照（selfcheck §5）；rescreen/rehydrate 只回写 assertions/verdict/p0/p1/observes，不动 request/response 原文（:1362-1366），SKIPPED-ILLEGAL 无落盘文件天然不受影响、ENV-FALLBACK/EXPECTED-ERROR 由 evaluate 纯函数确定性推出，口径不破坏。
4. **证据链（过，但见 P1-2）**：全量重算 176 落盘 = 173 PASS + 3 EXPECTED-ERROR，P0=0/P1=0，98.3%=173/176，与 AI-MATRIX-RESULT.md 一致；pre-fix 备份恰 14 格、全为 FAIL→PASS。抽样 4 格深查（L1-1-011、L2-2_1-002、L2-2_6-106、L3-3_4-008）：响应体确实变化（延迟/卡数不同、新 meta.filteredCount/retryCount 字段出现、boundary 命中在新响应里消失）——**14 格是对新服务端的真重跑，不是改判定器硬掰**；L3-3_4-008 的「没有身体接触要求」属真实否定语境豁免。单测 4 例（滤卡/retry prompt 断言/超数截断/全损如实返回）与实现吻合。

## P0 / P1 Findings

- **P1-1｜3.3 边界探测格在 Change C 新服务端下会翻 P0，现 PASS 是旧服务端证据（tests/mac/ai-matrix-3l.ts:1001-1010、:1020、:1058-1060）**
  新 route 的 `filterCards` 会滤掉 `minPlayers > playerCount` 的卡（lib/ai/safety-filter.ts:55），而 normalizeAICard 把 pointing-game 卡强制 minPlayers=3。L3-3_3-005（pointing-game@2 人）现落盘响应是**旧服务端**返回的 10 张越下限卡（6-players 按 PLAN §3.3「明确回落」改判 PASS）。同一请求打到新服务端将全滤 → 200+0 卡+`local-fallback` → 按现 executor 判 7-empty P0（:1020）+ 11-source P0（:1060）。且格文件已存在、续跑会静默跳过，过期证据不会自愈。
  **改法**：evaluate 给 boundary-probe 补「0 卡 + 服务端回落」分支（服务端滤光=PLAN §3.3「明确回落」的更强形态，判 PASS 并注明回落层级），然后真跑重刷 3.3 两格；或在报告 §8/交接记明该格证据为旧服务端口径。
- **P1-2｜另有 8 个未重跑格的落盘响应含新服务端必滤卡，其 PASS 证据对当前服务端已过期**
  我按 safety-filter 全量口径复扫全部 162 个未重跑格：8 格含至少 1 张会被新 route 滤掉的卡——L2-2_2-025、L2-2_3-062、L2-2_4-072（2 张）、L2-2_4-076、L2-2_4-079、L2-2_4-082、L2-2_5-096、L2-2_5-100（多数命中 safety-filter.ts:21 裸 `(强迫|强制|逼着|强行)` 规则，如「不得强迫靠近或接触」）。重跑后这些格将触发补齐重试（卡数可能 9→10，或如实少卡），现「零重试、恰 10 张」的断言证据不再代表新服务端行为。
  **改法**：删除这 8 格落盘文件后 `run` 重刷（14+8=22 格即全量对齐），重出报告后再引「P0=0/98.3%」作放行证据。

## P2 / P3 Backlog Findings

- **P2-1｜服务端 HARD_BLOCK_PATTERNS 无否定豁免，免责卡被过度滤除推高重试成本（lib/ai/safety-filter.ts:18/21）**：裸 `(强迫|强制|逼着|强行)`/`(违法|偷窃…)` 把「不得强迫饮酒」「最离谱但又不违法」这类否定语境卡也滤掉（P1-2 的 8 格即实证），filteredCount 虚高且常触发一次额外上游调用（延迟翻倍）。与矩阵红线模块的双档口径不一致是「宁枉勿纵」的有意设计，可接受；建议观察线上 retry 率，必要时给 HARD 规则加 `(?<!不|没|别|勿)` lookbehind（与 ai-matrix-redline.ts:47 同法）。
- **P2-2｜补齐重试的异常路径丢弃首跑已得卡（route.ts:85）**：`generateOnce` 内 `callProvider` 可 throw（fetch 网络异常及 lib/ai/upstream.ts:14/16/29/31/42/52），首跑成功后重试若抛错会走外层 catch 整体 400。与改前 attempt 循环行为同形、非回归，但属新增暴露面；可在 retry 调用处 catch 后沿用首跑结果。
- **P2-3｜9-semantic 祈使放宽的 3 正 3 负回归样本只落在注释（tests/mac/ai-matrix-3l.ts:855-864），未进 selfcheck 自动断言**；建议补为 selfcheck §6（本轮已人工核验负样本仍 FAIL、正样本均过，暂不阻断）。
- **P2-4｜`report` 模式也有写盘副作用（writeReport→readCellFiles→rehydrate，tests/mac/ai-matrix-3l.ts:1370-1384）**：判定变化时会回写格文件（不动 request/response）。与「rescreen 只重判」声明一致，但 "report" 语义暗示纯读，备注知悉即可。

## 七查结论

DEV_BASELINE 一致（Change C 口径）；Requirement/DoD 覆盖（11 项断言+双档+单测齐）；Diff 未越界（route.ts 仅过滤/重试/meta，玩法逻辑零改动；本次工作区其余改动属已评死局链，不在本评范围）；回归影响=两处矩阵证据过期（P1）；可回滚（全部未提交）。
