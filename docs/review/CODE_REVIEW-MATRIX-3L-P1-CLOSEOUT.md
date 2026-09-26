# CODE REVIEW｜三层矩阵 P1-1/P1-2 整改复评（只复评 P1 闭环，不重评全链）

- Task：复核上轮 CODE_REVIEW-MATRIX-3L.md 两条 P1 的整改是否真闭环，给 RC 放行复评结论
- Commit：未提交（工作区；本轮复评对象=tests/mac/ai-matrix-3l.ts 增量分支 + docs/qa/ai-content-3l/ 10 格重刷证据 + docs/qa/AI-MATRIX-RESULT.md 重算）
- Reviewer：code-reviewer（codebuddy/glm-5.3-flash）
- Result：**过（P1-1/P1-2 均可关闭；P0=0；P1=0；新增 P2×1 backlog）**

> 验证记录：`npx tsc --noEmit` 过；`npx tsx tests/mac/ai-matrix-3l.ts selfcheck` 全部通过；`pnpm vitest run` 831/831 全绿；`pnpm lint` 0 error（7 warning 均既有）。评审全程未改代码、未发 AI 请求、未碰设备、未删任何证据（pre-refresh 与 pre-fix 备份均在）；只读复扫脚本放 temp/ 已清理。

## 5 条验项逐条结论

1. **严防外溢复扫——闭环（行为等价确认，逐字 diff 不可得，如实说明）**
   `boundaryEmptyFallback` 定义于 tests/mac/ai-matrix-3l.ts:921-922，四条件缺一不可（`mode==="boundary-probe" && status===200 && cards.length===0 && source==="local-fallback"`），且是该文件唯一 gate。三处放行点 6-players :1023-1025、7-empty :1046-1048、11-source :1088-1090 全部包在 `if (boundaryEmptyFallback)` 内；回落分支之外的判定路径逐字保留：0 卡 P0 :1049（`else add(...FAIL,"P0","返回 0 张卡")`）、非 ai 来源 P0 :1092、非 boundary 格越下限 P1 :1036-1037、非 200/非 JSON 早退 :967-977（内含 EXPECTED-ERROR 口径不变）。三条外溢路径（非 boundary-probe 的 0 卡 / boundary-probe 非 200 / 卡数>0 且 local-fallback）均不可能进入放行分支。
   限制说明：ai-matrix-3l.ts 为未跟踪新文件，无整改前基线可做逐字 diff；「与整改前逐字等价」的结论依据是①新分支为纯增量 if（else 路径原样）的结构化读码 + ②selfcheck §6 两负例的行为锁定。此为复评可得的最高置信度，无异常发现。
2. **selfcheck §6 覆盖——成立，无自证循环**
   正例 1（:1810-1816）：boundary-probe+200+0卡+local-fallback → 断言 verdict=PASS、P0=0、7-empty=PASS、11-source=PASS、观察项含 local-fallback；正例细节锁（:1818-1820）：7-empty detail 必含 filterCards/buildPlayableDeck/filteredCount=10、11-source detail 必含 PLAN §3.3。负例 2（:1822-1826 normal 同输入 → FAIL P0=2、7-empty=FAIL/P0；:1828-1832 502 → FAIL P0=1、6-players=N/A）。期望值全部为硬编码字面量，不是用被测函数重算再对拍，**不构成自证循环**（evaluate 是同文件纯函数，但 §6 断言的是独立写死的期望输出）。
   小缺口记 P2（见下）。
3. **P1-2 真闭环——实锤（真重跑，非改判定器硬掰）**
   抽查 9 格新证据（L3-3_3-005、L2-2_2-025、3-062、4-072、4-076、4-079、4-082、5-096、5-100）：新响应全部带 `meta.filteredCount/retryCount`（pre-refresh 旧响应均无此二字段）；新旧卡面内容实质不同（如 2-025 新 card-1「你第一次见到对面这个人时…」vs 旧「你相信一见钟情吗？为什么？」）；延迟/尝试数不同（2-025 新 10324ms/1 次 vs 旧档无此值）。L3-3_3-005 新证据与回执完全一致：status 200、attempts 2、0 卡、generationSource=local-fallback、meta.filteredCount=20、retryCount=1、latency 7529ms（旧：10 卡/ai/1 次/4237ms）。
   反扫 pre-refresh-0926 备份（当前 filterCards 全量口径）：8 风险格全部 STALE（各滤 1-2 张）、L3-3_3-005 全滤 10 张（normalizeAICard 强制 pointing-game minPlayers=3>2人）、L3-3_3-006 未命中滤卡规则（compatibility-test minPlayers=2，属 3.3 成对格顺带重刷，无害）。搬走的恰好是该搬的 10 格。
   全量正扫现行 176 格落盘响应（同一口径独立脚本）：**0 格**含会被当前服务端滤掉的卡 → 8 风险格 + 3.3 两格之外无其他过期格。
4. **报告与落盘一致——无编造**
   独立重算 176 个落盘文件：verdict 分布 PASS 173 + EXPECTED-ERROR 3、P0 合计 0、P1 合计 0，与 AI-MATRIX-RESULT.md §0（184 总/176 合法/8 SKIP=6 ILLEGAL+2 ENV-FALLBACK/173 PASS/3 预期失败/98.3%=173/176）完全一致；重刷明细（§3 末行：2-025 与 5-100 retryCount=1、filteredCount=1/2，其余 6 格 0/0）与落盘逐一吻合；latency max 10324ms=2-025 新延迟、min 5ms=3.5 超长格、3.3 行 7529ms/local-fallback 均对得上；§8/§8.1 两张 SKIP 清单与 176 文件集合互斥完备（184-8=176）。
   不确定项如实记录：「rescreen 判定变化 0 格」无法独立复验（无重刷前全量断言快照可比），但 176 格落盘 verdict/p0/p1 与报告一致、且全量复扫未发现任何矛盾，无反证。
5. **无新 P0/P1；11-source 边界回落 PASS 口径可接受，不构成放水**
   ①该分支仅覆盖 mode=boundary-probe，此格的测试目标是 PLAN §3.3「不返回越下限卡，或明确回落」的边界安全性，不是 AI 来源验证；②0 卡+local-fallback 是「明确回落」的更强形态——上轮已接受的「返回越下限卡也算回落」（:1026-1035，原口径）是其真子集，本轮对放行面的净变化为零新增；③非静默：观察项（:1090）+detail+报告 §6 观察项行 + §0「生成来源非 ai 1 格」全部如实留痕，meta.filteredCount=20/retryCount=1 提供服务端确证；④0 卡后由客户端 buildPlayableDeck 本地补齐，该路径已有死局修复链兜底（CODE_REVIEW-DEADLOCK-P1 过）。四条件外的任何偏离（非 200、卡数>0 的 local-fallback、非 boundary 格）仍 P0。

## 每条 P1 闭环判定

- **P1-1（3.3 边界格旧服务端证据）｜闭环**：evaluate 增量分支（:921-932/:1023-1025/:1046-1048/:1088-1090）+ selfcheck §6（正例 1+负例 2，防改空）+ 3.3 两格真重刷（新证据 0 卡/local-fallback/filteredCount=20/retryCount=1/7529ms；旧证据 10 卡/ai/4237ms 已移 ai-content-3l-pre-refresh-0926/ 留存）。
- **P1-2（8 格落盘证据对当前服务端过期）｜闭环**：10 格移入 pre-refresh-0926 备份并真重跑落盘（新 meta 字段+新卡面+新延迟，非判定器硬掰）；全量 176 格按 safety-filter 全量口径复扫 0 过期；报告重算与落盘一致。

## P0 / P1 Findings

（无）

## P2 / P3 Backlog Findings

- **P2-5｜selfcheck §6 缺第三负例**：boundary-probe + 200 + cards>0 + local-fallback 应走 11-source P0（:1092），现仅由代码保证、无自动断言锁定；建议后续补进 §6（不阻断本轮放行）。

## 七查结论

DEV_BASELINE 一致（Change C 口径）；Requirement/DoD 覆盖（整改单两项动作全部落地且有真证据）；Diff 未越界（改动仅 evaluate 增量分支+selfcheck §6+证据重刷+报告重算，玩法逻辑零改动）；回归影响=无（负例锁定+831 单测+selfcheck 全过）；P0=0/P1=0；可回滚（全部未提交，备份证据完整）。

## 最终结论

**P1-1/P1-2 均可关闭。** 三层矩阵证据链（176 格落盘=P0 0/P1 0/98.3%）与报告一致且全部对齐当前服务端，RC 放行的矩阵侧阻碍已清空。
