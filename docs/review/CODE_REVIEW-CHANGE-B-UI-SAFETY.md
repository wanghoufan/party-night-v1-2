# CODE REVIEW｜Change B 复评第 2 单：B1 两人局/mixed 空池 · B3 Mutual 单候选 UI+隐私 · B4 矩阵 3.3 负向探测 · B5 pack 下限收口

- Task: Change B · B1（R-CB4 六路径空池封堵）＋B3（R-CB9 Mutual 单候选 UI / R-CB10 隐私回归）＋B4（R-CB11 矩阵 3.3 负向口径）＋B5（pack 契约人数下限收口）
- Commit: 未提交（工作区；HEAD 741e2e9，与收口链其他单混在同一工作区，本评审只看本单点名文件与段路；B2a/B2b 路由单已过，见 CODE_REVIEW-CHANGE-B-ROUTING.md，不重复评）
- Reviewer: code-reviewer（codebuddy/glm-5.3-flash）
- Result: **过**（P0=0；blocking P1=0；P2×2、P3×3 记 backlog；1 项口径偏差需人确认）

> 自测（只读，本机实跑）：`npx tsc --noEmit` 0 错；`pnpm vitest run` 100 文件 **902/902 全绿**（与派单基线 902 一致）；`pnpm lint` 0 error（7 条既有 warning，非本单引入）；`npx tsx tests/mac/ai-matrix-3l.ts selfcheck` 全部通过（§1–§7 含 7.1–7.6 负向分类与分母排除自检）。

## P0 / P1 Findings

- 无。
- 逐条对照用户 V1.2 §三 blocking P1 七条口径（R-CB3）：①合法路径死局——空池三入口全部停下给出口，无死局（B1 六路径测试+E2E 实证）；②违反 D1～D8——D5 四条冻结语义原样并有回归钉（v2-mutual-check.ts 本单为纯增量：mutualPartnerIds＋4 条文案常量，submit/finalize/reducer 一行未改）；③真实隐私泄露——三条外发边界运行时负断言+反向对照（v2-privacy-regression.test.ts），未发现泄露；④真实安全过滤穿透——safety-filter 红线/雷区规则未动，唯一改动是人数下限一行收紧（safety-filter.ts:55）；⑤合法玩法误禁/非法进入——minPlayers 契约值未放宽（most-likely/pointing-game 仍 3），minPlayers=2 五玩法不误伤；⑥Release Gate 可执行性——3.3 改 NEGATIVE_BOUNDARY_PROBE 后分母口径自洽（selfcheck §2/§7 实证）；⑦Single-Anchor/Coverage 硬 DoD——DoD 10–15 断言齐备可证伪（DoD 1–9、15 已由第 1 单评过）。**七条全不命中。**

## 七查结论

| # | 查项 | 结论 | 证据 |
|---|---|---|---|
| 1 | DEV_BASELINE 一致 | ✅ 全部落在 CHANGE-B §四 B1/B3/B4/B5 建议文件内 | 本单 diff 清单 |
| 2 | Requirement 覆盖 | ✅ R-CB4/R-CB9/R-CB10/R-CB11 全落地（R-CB1/2/3 属对账与口径单，R-CB5–8 第 1 单已评） | 必查清单逐条 |
| 3 | DoD 达成 | ✅ 硬断言 10–15（本单部分）有测试且通过；13/14 由新 v2-privacy-regression.test.ts 9 例承载 | tests/unit 四件＋B4 selfcheck |
| 4 | Diff 越界 | ✅ 题库/prompt-builder/版本号（package.json/version.json/sw.js）未碰；safety-filter 仅 minPlayers 一行（属 §二允许的链内复审收口，见必查 9） | git status/diff |
| 5 | 回归影响 | ✅ mixedCandidatePackIds 缺省不按人数过滤（既有调用方 pack-enablement.ts:18/39 行为不变）；R-057 主局切包不吃开关语义原样 | lib/engine/pack-switcher.ts:33/88 |
| 6 | P0-P2 分级 | 见 backlog | — |
| 7 | 可回滚性 | ✅ B1/B5 均为收敛型小改：B5 回滚=还原 normalize/safety-filter 两处；B3 纯增量可直接摘除；B4 是 harness 层口径，不动生产 | 各 diff |

## 必查清单逐条结论（12 条）

1. **危险语义物理删除 ✅**：`mixedPackIds.length ? mixedPackIds : [...BUILTIN_PACK_IDS]` 已从 draftConfig 删除（app/setup/page.tsx:75 现为 `enabledPackIds: validTargetPack ? [validTargetPack] : mixedPackIds`，空池即空数组）；全仓 grep `BUILTIN_PACK_IDS` 仅剩 constants 定义与测试，无任何「候选为空回退全量」的第二条路径（lib/engine/pack-entry.ts:21 挑不出即返回 /packs；deriveQuickStartConfig 无 pack 回落且 quickStart 补了 `!reused && mixedPoolEmpty` 拦截 app/setup/page.tsx:95）。三处入口同口径：setup 混合池（mixedCandidatePackIds 传 activePlayerCount）、快速开局（按上次名单 active 数复核同一 packMinPlayersNotice）、主局切包（listSwitchablePacks 按 active 人数 + packSwitchBlockedNotice 共用同一文案口，lib/engine/pack-switcher.ts:45/58/113）。空池文案先说原因再给两步出口（加人 / 去游戏包开启），用户可懂。
2. **无误伤 ✅**：registry 的 minPlayers 数值一行未改（most-likely.ts/pointing-game.ts 不在改动清单，契约仍 3）；关闭玩法不复活（过滤顺序保留 disabled 过滤，setup-mixed-empty-pool.test.ts:70-83 实证 3 人时被关玩法不回来）；3 人局正常恢复（测试 3 + E2E tests/e2e/pack-min-players.spec.ts:71-88 实际开局出指人卡）；R-057 未被静默改动——listSwitchablePacks 仍只看注册表+在场人数、不读禁用名单（pack-switcher.ts:88-94），random-launcher 测试钉住「不吃开关」语义（tests/unit/random-launcher.test.ts:42-44）。
3. **Mutual 冻结语义零破坏 ✅**：双向才 MATCH（v2-mutual-check.test.ts「D5 四条冻结语义回归钉」①）；单向不公开（②结果空+事件只含 DUE 且无单向明细字样）；active MATCH≤2（③走真实 mayCreateMatch、不泄露原因）；raw unilateral choice 不落盘（④Storage/IDB spy 全程零写入+finalize 后内存清零）。B3 对 v2-mutual-check.ts 的 diff 为纯追加（+35 行），无语义改动。
4. **Yes/No 触发与 Guard 解耦 ✅**：分支只看 `mutualPartnerIds(...).length===1`（MutualCheckSheet.tsx:240），唯一真源是 eligiblePairKeys（v2-mutual-check.ts:132-145），不看 singleAnchorPlayerId 阈值；测试实证 1男2女 Guard=false（singleAnchorPlayerId 为 null）时多数方仍走 Yes/No（mutual-check-sheet.test.tsx:263-270），anchor/多候选仍走多人 UI（:249-261）。
5. **提交前边合法校验用最新 participants ✅（一处 P2 备注）**：enterSelect 只把快照用于视图，submitChoice 一律用 `legalCandidates(current.id)`（participantsRef 最新值）重算（MutualCheckSheet.tsx:150-157），暂离/候选变化后失效目标被拒并给可读提示，单测有真实 rerender 失效场景（mutual-check-sheet.test.tsx:308-334）；快照与重算关系自洽（快照仅为展示，不参与判定）。P2-① 备注：更早已提交进 pairRuns 的选择不在重算面内，若作答期间有人「真离开」且面板未取消，finalize→reducer 建 MATCH 只查 cap/重复不查参与者在场（v2-reducer.ts:373-378）——正常 UI 下互选遮罩 backdrop 挡住局中设置，不可达，记 backlog 加固。
6. **隐私断言可证伪 ✅**：捕获点全是真实边界——App 实际 HTTP body（fetch spy 截获 requestGeneratedDeck 请求体）、服务端实际 payload/prompt（callProvider 第 3 参 messages，prompt 含冻结开头语证明抓到真物）、直连 wire body（generateDeckDirect 的 fetch body 且断言 URL/model）、console.error 实捕（先证「确有日志」再负断言）、Storage/IDB spy；反向对照有效（fixture 序列化确含 pairGender/真名/lastTargetedPairKey 证明断言非空跑；双向愿意走通 MATCH 证明管道通，非恒真）。**DoD#14 口径冲突判定**：应用域模型无「真实姓名」字段，只有 Host 输入昵称 displayName；昵称进 prompt 是 V1.0 冻结契约（tests/fixtures/ai-prompt-v1.0.json 逐字钉死，实查含「玩家：a、b」），改 prompt 即触碰冻结面应走 Change C。用户 §八原文是「玩家真实姓名」——builder 处置（保留昵称通道、把真名以注入 realName 的方式钉成真断言、参与者投影/性别结构/anchor 全部负断言）**符合用户原意，不升级 P1**；但属对 DoD#14 字面（"不含 name"）的偏离解释，列入需人拍板。
7. **B4 判定未被改弱 ✅**：NEGATIVE_BOUNDARY_PROBE 两格不进 App 通过率分母（LEGAL_CELLS = EXECUTABLE − probe，ai-matrix-3l.ts:779-780；selfcheck §7.4 实证 probe 格不在 LEGAL_CELLS）；「显式拒绝」口径严——仅 4xx 结构化 JSON 或带既有分类码（REQUEST_FAILED/PROVIDER_REQUEST_INVALID/URL_REJECTED）的 5xx，超时/网络错误/纯上游 502 一律不算、走原失败判定（:931-938 + selfcheck 负例2 boundary-probe+502→FAIL/P0）；「返回越下限卡=防线不成立→FAIL」是真实防线失败信号而非假阴性——且因 probe 格不进分母，不会污染合法格结论（selfcheck §7.6 负例）；SKIPPED-ILLEGAL 例外只对 mode==="boundary-probe" 生效，而该 mode 只存在于 3.3 两格（:232-235 + selfcheck §7.3 非 3.3 非法格仍 SKIPPED-ILLEGAL 不执行）。**与 QA 实跑自洽**：落盘 JSON L3-3_3-005（filteredCount=25）/006（filteredCount=20）均为 200+0 卡+generationSource=local-fallback→判定 PASS，与 evaluate 的四条件（boundary-probe+200+0卡+local-fallback 缺一不可）逐条吻合，且 11-source 如实记「generationSource=local-fallback 非 ai，不计 AI PASS」——不是靠改判定器把 FAIL 变 PASS。
8. **B5 真源收敛正确 ✅**：唯一真源＝pack 契约（packMinPlayersFloor = getGamePack(packId)?.minPlayers ?? 2），实际下限 = max(卡自报, 契约下限)，自报更严时保留（normalize.ts:25-35 + 测试②自报 4 保持 4，未写死）；三条来源全覆盖且无第二套实现——服务端 route 与 App buildPlayableDeck 复用同一 filterCards 漏斗（grep 全仓 filterCards 调用仅 route.ts:77/87 与 generate-deck.ts:37），本地 SSOT 卡受同一约束（测试⑦），且测试⑥实证两路对同一批卡判定逐张一致；minPlayers=2 玩法零误伤（测试⑤ compatibility-test/would-you-rather/truth-dare/never-have @2 全保留；spin-bottle 为纯本地无卡玩法不受影响；registry 契约值 2 未改）。
9. **B5 越界判定：属「现有链内收口」，非新增强制层 ✅**：生产链结构 `POST /api/generate-session → normalize/schema → filterCards → playable` 未变（route.ts 结构未动），B5 只在既有 normalizeAICard 归一步与既有 filterCards 人数过滤行内收紧取值（safety-filter.ts:55 一行），无新增链层、无 debug API、无 Provider 原始输出暴露。符合用户 §二「保留现有 PRODUCT_SAFETY 生产链；不新增强制双层链」。
10. **越界与红线 ✅**：safety-filter 红线/雷区/hard-block 规则零改动（diff 仅 import+注释+minPlayers 一行）；most-likely@2 未被改成合法（filterCards 滤光 + mixedCandidatePackIds 剔除 + setup/切包拦截三层都在，测试①与 selfcheck §7.6 双钉）；D1～D8、题库、prompt 文本（prompt-builder.ts 未改）、版本号（package.json/public/sw.js/version.json 均不在改动清单）未碰；local-fallback 未当 AI PASS（矩阵 11-source 显式记非 ai；probe 格不进分母）。
11. **测试可证伪性 ✅**：抽验 5 条——①setup 空池④（池归零+3 人不复活+再关 3 人玩法仍归零，断言对象是被测纯函数而非实现自身）；②pack-minplayers-floor⑥（服务端真实 POST 与 App buildPlayableDeck 对同一批卡逐张对账，filteredCount=1 精确断言）；③隐私反向对照+双向 MATCH 管道证明（如上第 6 条）；④B4 selfcheck 三个负例（normal 模式 0 卡仍 P0、502 不套用回落、越下限卡 FAIL）——若把回落分支放宽到非 probe 格，负例 1 直接翻红；⑤MutualCheckSheet 失效候选 rerender 实测。均无自证循环、无「改弱实现仍绿」通道。
12. **blocking P1 七条口径逐条对照 ✅（全不命中，已列于 P0/P1 节）**：两条口径偏差均不构成 blocking——DoD#14 昵称（见第 6 条，需人确认）；主局空牌堆「洗牌也补不出」提示文案属既有 P1 整改闭环（session-current-pack-recovery.spec.ts 同步更新口径，E2E 旧断言随产品语义走，符合经验一句话 V1.5 教训），不属七条任一。

## P2 / P3 Backlog Findings

- **P2-①｜互选 run 进行中「真离开」的 MATCH 边合法性兜底在 reducer 之外**：finalize 只查 cap/重复（v2-reducer.ts:373-378），早前已提交进 pairRuns 的选择不随参与者离场重算。正常 UI 下互选遮罩挡住局中设置故不可达；建议后续在 finalize（或 COMPLETE 归约前）按最新 participants 复核一次边在场性，一次改动收口。
- **P2-②｜矩阵合法格分母随 env fallback 漂移**：`.env.local` 开 `PARTY_NIGHT_ENABLE_ENV_AI_FALLBACK=true` 时本地 selfcheck 显示 App 分母 174（含 ENV-SKIP 2 格），关闭时 176——QA 终审引用数字时须注明 env 口径，避免两份报告分母对不上被误读为口径不一致。
- **P3-①｜setup 直选玩法被拦时整页 CTA 变灰**：2 人直选 most-likely 后连混合组局路径也被 startBlockedNotice 拦住（app/setup/page.tsx:64/92），玩家只能「返回首页换个玩法」而不能就地转混合。与「阻止继续」的字面要求一致且有出口，是否放宽为「转混合继续」由产品定。
- **P3-②｜E2E 硬编码候选计数**：pack-min-players.spec.ts:64/68/105/120 依赖「5 个玩法/7 个玩法/2 个玩法」字面计数，未来加第 8 个内置玩法会脆断，建议改区间或按 id 断言。
- **P3-③｜隐私 FORBIDDEN 正则较宽**（含 `playerId`/`participants` 等词）：当前依赖「单数 playerId 不出现在外发体」的巧合成立（公开事件用的是复数 playerIds 且仅在 §3 断言面）；若未来外发结构加入这些词会误报。可接受，留意维护点。

## 需人拍板

1. **DoD#14 昵称口径确认**：保留 displayName 昵称进 AI prompt（V1.0 冻结契约、fixture 逐字钉死），隐私断言钉「真名/参与者投影/性别结构不外发」——是否接受此解释作为 R-CB10 的最终验收口径（接受则本单闭环；不接受需按 Change C 改冻结 prompt）。
2. **P2-① finalize 边在场性兜底**：本期记 backlog 放行，还是要求 builder 补一处 finalize 重算（约 +5 行 + 1 测试）再收口。
