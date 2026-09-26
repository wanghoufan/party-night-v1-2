# HANDOFF｜交接（暂停/恢复用，先读我）

> 旧版字段（governance-state / Evidence / Human Gate / Promotion / Dispatch ID）已废弃，不填。

- Captured at（YYYY-MM-DD HH:MM）：2026-09-27 00:40（Change B 收口大交接：用户 V1.2《RC冻结前最终收口》16 节全部落地——Matrix 对账+销项、2人局漏洞 CLOSED、Coverage 接入 Router、Single-Anchor Guard PASS、D7 两层消解、Mutual 单候选 UI、隐私回归、普通桌回归、Plan/QA 文档同步、三轮 reviewer + 三轮 qa + supervisor 终检全过；全门禁绿（lint0/typecheck0/unit902/E2E94+4skip/build/selfcheck）；`pnpm android:release` 已跑通。**卡在两处物理依赖**：①本机无 JDK21（只有 openjdk@17，gradle 报"无效的源发行版：21"）→ 新 release APK 未出；②11T Pro+ 无线不可达（ping 192.168.31.63 全丢包、adb connect 超时）→ 新构建 machine smoke 未做。HEAD 741e2e9 全部未提交）
- PROJECT_PHASE：（DEVELOP：RELEASE_GATE_VALIDATION；RELEASE_GATE NOT_STARTED）
- PLAN_VERSION：（PRODUCT_PLAN_V2.0）
- PLAN_READINESS_SCORE：（83＋Human例外有条件批准）
- PLAN_GATE：（APPROVED，V2.0 Human Gate终版）
- DEV_BASELINE：（PRODUCT_PLAN_V2.0）
- CHANGE_REQUEST：（B：用户 2026-09-26 V1.2 收口提示词；局部 Requirement/DoD 增量见 docs/pm/PRODUCT_PLAN_V2.0-CHANGE-B.md，基线与 Plan 版本不变）
- Stage ID（本阶段叫什么）：V2.0-Relationship Engine（Human已决D1换真源/D2切Router/D3=A20+5/D4=A异性/D5上限2/D6中性不推进/D7=A展示即给过/D8=A+；Release前强制Gate RG-01~RG-07须7/7）
 - 剩 P0（没完的才列，多一条都不行）：
  - **Change B 收口（用户 V1.2 §十五）已全部满足，只剩 2 项物理依赖卡住重冻**：① **新 release APK 未出**——本机只有 openjdk@17，`android/gradlew assembleRelease` 报「无效的源发行版：21」，需 JDK21（用户 V1.2 §十三 明确要求新 RC 重跑最小机器 smoke，旧 RC 证据不得顶替）；② **新构建 machine smoke 未做**——11T Pro+（IN9LZTAYV4UGU4JF）无线不可达（ping 192.168.31.63 100% 丢包、adb connect 超时），USB 上只挂着禁碰的 12 Pro（indq5xfi6hovay4d）。两项都不是代码问题，回来了就能一次跑完。
  - RG-01~RG-07（RELEASE_GATE NOT_STARTED）：7/7 PASS才Release；RG-01须RC重冻后、由真人手点；RG-02 真人 fixture 已按 Change B 固定为 1男3女/1女3男（凑不齐保持 PENDING，不得用 2男2女 替代宣称）；RG-02~07需真人4/5人局（用户令：现在不排）。
- RC状态：cce4306已作废；**未重冻**——工作区全部未提交（HEAD 741e2e9）。Change B 代码/文档/门禁/评审/QA/supervisor 全绿，Matrix 侧 P0 已销项；只等 JDK21 出新 APK + 11T Pro+ 跑新构建 machine smoke → 才 commit+push(main)+重冻 NEW RC（7/7前禁版本号升级/正式部署；本轮不 bump，三处仍 1.5.0）。
- 当前 Task：暂停于「新构建 machine smoke」前。已完成：Matrix 三波对账与 P0 销项（docs/qa/AI-MATRIX-RESULT.md，合法分母 174=171 PASS+3 EXPECTED-ERROR，3.3 两格 NEGATIVE_BOUNDARY_PROBE 防线成立 filteredCount 25/20）；B1 2人局+mixed 空池不复活（危险回落已物理删除，三入口同口径）；B2a Coverage 进 rankPairs（软排序，扣分上界 0.4 < 最小 Signal 步长 0.5，硬合法未动）；B2b Single-Anchor Guard + Anchor Exposure + D7 两层消解 + 受控 bypass（reason=NO_LEGAL_NON_TARGETED_CANDIDATE）；B3 Mutual 单候选 Yes/No + 隐私回归（真实边界捕获 9 例）；B4 矩阵 3.3 改负向探测；B5 pack 契约 minPlayers 下限收口（**修掉了 3.3 探测抓出的真实漏洞：most-likely@2 曾返回 10 张卡，非法玩法可进入**）；B6 修 `pnpm android:release` 被单测 import 卡死（`scripts/build-static-export.mjs` 暂存清单扩展 + 异常自愈，已连跑两次通过 + SIGKILL 自愈实测）。
- 未闭环评审意见：CODE_REVIEW-CHANGE-B-ROUTING.md 过（P0=0/blocking P1=0，P2×3 P3×2）；CODE_REVIEW-CHANGE-B-UI-SAFETY.md 过（P0=0/blocking P1=0，P2×2 P3×3）；CODE_REVIEW-MATRIX-3L.md 的 P1×2 已由复评关闭（新增 P2-5 backlog）；CODE_REVIEW-DEADLOCK-P1.md 过；CODE_REVIEW-AI-GEN-STABILITY.md 过。
- docs 落盘清单：
  - 基线：`docs/2026-09-21 - MAC - ChatGPT - Party Night玩法扩展与主局整合-计划 - V1.1/`（4 份，用户提供）
  - 评审：`docs/review/CODE_REVIEW-V1.1.md`、`docs/review/CONVERGE-V1.1.md`
  - QA：`docs/qa/BUGS-V1.1.md`、`docs/qa/V1.1-放行证据.md`
  - 事实备份：`docs/handoff/HANDOFF.md.旧版-2026-09-13`（V1.2 真源）；`docs/pm/V1.3-讨论稿.md`（挂起：7 待定+酒罚默认含决策）
  - 账本：`docs/model/TASK-MODEL-LOG.jsonl`（86 行）；`docs/model/DISPATCH-LOG.jsonl`（137 行）；`node scripts/model/check-ledger.mjs` = LEDGER-OK（2026-09-27 复核，旧文"DISPATCH 空"为过期快照）
   - V1.6：评审`docs/review/CODE_REVIEW-V1.6.md`（PASS，commit 4ba3d13）、QA`docs/qa/BUGS-V1.6.md`（lint0/typecheck0/511/E2E80+4skip/三处1.5.0）、把关`docs/content/题库把关/`9件（00总览旧180审计+01–07+08新题纲）、终稿`docs/content/题库终稿/`9件（00总览§一终稿350分布3/5/7/14/21+01–07各50+08新题纲）；旧`docs/content/题库审查/`已删（文档搬家映射）；账本35行至V1.6补遗（dup删后27行自验口径作废，以现35行为准）
 - V2-B3：评审`docs/review/CODE_REVIEW-V2-B3.md`（FAIL→返工→复验PASS）、QA`docs/qa/BUGS-V2-B3.md`（lint0/typecheck0/610）；账本随行。
 - 2026-09-26 收口链：评审`docs/review/CODE_REVIEW-AI-GEN-STABILITY.md`（过）/`CODE_REVIEW-DEADLOCK-P1.md`（过）/`CODE_REVIEW-MATRIX-3L.md`（过，P1×2待整改+P2×4）；QA`docs/qa/BUGS-AI-GEN-STABILITY.md`（PASS，终审待更新）/`AI-MATRIX-FULL.md`（OpenCode 80/80，72合法）/`AI-MATRIX-PHONE.md`（24/24，origin运行时口径）/`AI-MATRIX-RESULT.md`（三层 DeepSeek 176合法 98.3% P0=0）/`AI-GEN-DIAG-0926.md`；三层逐格`docs/qa/ai-content-3l/`（176）+修复前备份`ai-content-3l-pre-fix/`+OpenCode旧证据`ai-content/`+DeepSeek旧证据`ai-content-deepseek-0926/`；harness `tests/mac/ai-matrix-3l.ts|ai-matrix-full.ts|ai-matrix-redline.ts`、`tests/phone/ai-matrix-phone.ts`；真机截图`test-results/phone/ai-matrix/`25张（gitignore本地证据）。
 - 下一步（Next Single Action）：① 装 JDK21（`brew install openjdk@21`）→ `android/gradlew assembleRelease` 出新自包含 APK；② 11T Pro+ 回网（`adb connect 192.168.31.63:5555` 验 `ro.serialno=IN9LZTAYV4UGU4JF`）→ install -r + 最小机器 smoke（离线启动/组局页/杀进程重启恢复，Key 与开局抽卡留用户手点）→ 把结果补进 `docs/qa/RG-01-NEWRC-SMOKE.md`；③ 两步都过 → commit+push(main)+重冻 NEW RC+回填本文件 NEW_RC_COMMIT → 通知用户开 RG-01。
- 人要拍什么板：
  - **装 JDK21 需用户点头**（`brew install openjdk@21`，本机只有 17；不装则新 APK 出不来、smoke 无从做起，RC 不能重冻）。
  - **11T Pro+ 需开机回同一 Wi-Fi**（或插 USB）；12 Pro indq5xfi6hovay4d 仍禁碰，本轮全程未碰。
  - 本轮已由编排者裁定的口径（不再占用用户决策，除非否决）：① DoD#14 昵称口径＝**真名/参与者投影/性别结构/anchor 标志不外发，Host 输入的 displayName 昵称沿用 V1.0 冻结 prompt 行为**（域模型无真实姓名字段；否决则走 Change C 并重冻 prompt fixture）；② Exposure 轮级口径、Coverage offered 终态计数、finalize 不重算边在场性＝P2 backlog 本期放行；③ Single-Anchor 桌 pair opportunity 减半（10 定向+10 非定向交替）的节奏**请用户在 RG-02 真人局前过目**。
  - 收口全绿后 TM 自行 commit+push+重冻（用户已授权本轮收口链），**通知后**才由用户真人手点 RG-01；RG-02~07 真人局由用户排期（现在不排）；局内"移出本局"入口是否加（另报，不拦RC）。
- permission_request：无。
- 收尾记一笔（neat-freak 2026-09-22）：docs 与代码已对齐（8 包/规则 8 条/工具 2 个/Session v2；V1.3 讨论稿 2 处已校准）；test-results 空、:3000 无残留进程；README 中英 8 玩法为 TM 后续补齐（校验 DOCUMENTATION_READY）。
 - 收尾记一笔（neat-freak 2026-09-22 V1.6）：docs/content下仅题库把关/9件，题库审查/已删（映射见CODE_REVIEW-V1.6 P2）；V1.6评审/QA/把关/账本35行与代码现状一致（350/陡坡/L1L2/开关/1.5.0）；未碰业务代码。
  - 收尾记一笔（TM代neat-freak 2026-09-26，通道限额）：docs与代码一致（CHANGE-B评审/QA/RG smoke/AI-MATRIX-PLAN/direct-provider及单测均在位，单测815全绿）；工作区22文件未提交（AI直连+分块+回退提示，HEAD 741e2e9）；未碰业务玩法逻辑；分离前codebuddy deepseek限额切glm；只动11T Pro+（IN9LZTAYV4UGU4JF），12 Pro（indq5xfi6hovay4d）后半程未碰。

## 一、当前工作进展（2026-09-22 晚，大交接冻结口）

- 生产站 https://party-night-v1-2.vercel.app（GitHub wanghoufan/party-night-v1-2，Vercel自动部署已断，改手动直推；见注意事项）。
- V1.5：转瓶子链回跳＋切包1/40重计＋顶栏暂停结束＋双页视觉＋题库180导出；宽屏热修（座位遮挡＋巨型按钮）；链入无响应热修（空牌堆补种＋耗尽提示）。已上线。
- V1.6（1.5.0）：终稿350入库（7类各50＝互动35/了解15/看戏0，4-5档35；红线三条卡面零命中；25张旧题面补遗改写全清零）；指数陡坡抽法（16:8:4:2:1）；耗尽不断游L1洗牌循环＋L2后台AI补题；Toggle重设计（品牌粉+✓/已避开）；三处1.5.0同值。门禁lint0/typecheck0/511/E2E80pass+4skip，reviewer＋supervisor PASS。已上线（手动部署）。
 - 题库文档：docs/content/下把关/9件（旧180审计＋处置＋新题纲）＋终稿/9件（终稿350题面：00总览§一3/5/7/14/21＋01–07各50＋08新题纲）；题库审查/7件已删（可pnpm export:questions重生）；评审CODE_REVIEW-V1.5/V1.6、QA BUGS-V1.5/V1.6；账本35行。
- 把关包vs软件：不一致是设计好的——把关包是旧180审计＋改写方向（给人审的），软件里是终稿350（已入库生效）。终稿/00总览§一已按种子实算重写（3/5/7/14/21，旧数注脚存档）。
- 终稿文字版终稿/9件已交付用户审题（按编号报问题）；25张旧题面补遗改写＋复核PASS已上线；neat-freak两轮对齐完成。

## 二、当前任务（小交接 2026-09-26 深夜，唯一有效；旧大交接RG清单已被用户5项收口单取代）

用户收口令（全做完才 commit+push+重冻，然后才通知用户跑 RG-01；**不进 RG-01、不排4/5人真人局**）：
1. ✅ 两人局 pointing-game/most-likely 死局升 RC 前必修 P1——已修（setup/quickStart/mixed按 active 人数过滤+「至少3人」拦截不进生成页+deck=0耗尽三出口兜底+测试15例；minPlayers 保持3未放宽）；reviewer CODE_REVIEW-DEADLOCK-P1.md 过（P0/P1=0）。
2. ✅ AI Matrix 合法格口径统一（players<minPlayers→SKIPPED-ILLEGAL 不进分母）——AI-MATRIX-FULL 重算 72合法/8SKIP；PHONE 24合法/4SKIP；三层 176合法/6SKIP。
3. ✅ 自包含真机证据修正——harness 运行时记录 location.origin（APP_ORIGIN=https://localhost）、AI-MATRIX-PHONE 头部改自包含口径、Mac :3000 非真机业务依赖、真机证据格 PASS（origin+generationSource=ai）。
4. ✅ AI-MATRIX-PLAN 三层正式矩阵（DeepSeek 主）已执行——tests/mac/ai-matrix-3l.ts（L1 pairwise 43+L2 高风险123+L3 定向18=184格/合法176）；修复链（route雷卡过滤+补齐重试+截断、redline判定器、semantic断言、customText否定豁免、rescreen）；现状 **P0=0/P1=0/通过率98.3%**（173 PASS+3定向预期失败）；OpenCode 80/80 留作补充证据；报告 docs/qa/AI-MATRIX-RESULT.md。
5. ⏳ 待收口：reviewer 2条P1整改 → qa 终审 → 全门禁（lint0/typecheck0/unit831/E2E全量/build全绿）→ supervisor 终检 → commit+push(main)+重冻 NEW RC → 通知用户开 RG-01。

## 三、注意事项及相关规矩

- **本轮新增（2026-09-26 收口实证，重要）**：
  - route.ts（服务端）改完后 **dev server 必须重启**——热重载没生效实证过（slice修复已落但矩阵仍拿14张，重启后才正确）；跑矩阵前确认 `curl 127.0.0.1:3000` 200。
  - 11T Pro+ USB 掉线时用无线 `adb connect 192.168.31.63:5555`——`getprop ro.serialno`==IN9LZTAYV4UGU4JF 即同一台（已核验），**12 Pro indq5xfi6hovay4d 仍禁碰**；每轮真机跑前重建 `adb forward tcp:9363 localabstract:webview_devtools_remote_<新pid>`（APP重启pid会变，502即失效）。
  - 真机/CDP 自动化走 tests/phone harness（WebView CDP 表定通道）；「真人手点」红线指 adb input 代点测试连接/开局，不禁止 CDP 自动化。
  - codebuddy 派工：deepseek 429→切 glm-5.3-flash（表定备用）；大单必超时——**超时先查落盘再小单续派**（本轮 D/D2/D3/E 连续续派5次才收敛，别盲重派）。
  - 矩阵重跑受影响格：把该格 JSON `mv` 到备份目录再 `run`（脚本按文件存在跳过）；判定器类修复用 `rescreen` 只重判不烧API。
  - OpenCode key 从 `~/.local/share/opencode/auth.json` 读进内存（不打印不落盘）；DeepSeek 走 `.env.local`（服务端）。
- Vercel Git自动部署已断（13:00后push不触发，GitHub侧无webhook/无check-runs）：发版走CLI手动`vercel deploy --prod --scope houfan`，上线后curl验age归零+version.json。
- codebuddy派工必带`-y`且常超时（10分钟）：超时先查工作区落盘再续派，不要盲重派。
- codex沙箱起不了127.0.0.1:3000（EPERM）：E2E一律本窗口bash直跑，DISPATCH注记TM接管。
- 内容安全三条红线永不进题库（露骨/强迫惩罚灌酒/隐私脱衣非自愿，用户已认可只做安全线内放开：亲脸颊/公主抱需双方同意+可跳过）。
- 版本号联动：package.json/version.json/sw.js CACHE_VERSION三处同值（test会卡）。
- 四 Tab 不动（首页/组局/游戏包/设置）；单设备单桌 local-first；整局预生成后离线可玩；Engine 与 Pack 解耦；无账号/联机/云库。
- 强度 1–5 沿用现有尺度 UI，不重做；酒罚默认含、雷区可关；跳过机制保留。
- 手机是 Party 主持人：不做逐人手机录入；默契测试单机口头+Host 点选。
- E2E 已知坑（修过，勿回退）：换题后读数必须等 header 轮次推进；Toggle 不用 label 包裹（span+input）；check/uncheck 改 click+断言；seedSession 不删库、版本与 App 对齐（当前 v2）；pack-switch 旧未完成轮记 skipped；顶栏计数只数completed（swap复用、skip不递增）；换一个烧卡不涨轮次。
- 不擅自 commit/push（修完默认推送部署是用户立规：commit＋push＋手动发版＋线上实测＋生产站地址同步）；不碰 secrets；`docs/sop/` 为规范位。
- E2E 全量约1分钟；production smoke 需先 `pnpm build` + `pnpm start` 再带 `PARTY_NIGHT_PRODUCTION_SMOKE=true` 跑。
- 仓库：origin main 已同步（HEAD 741e2e9起后续见git log；push曾切p028-party-night，核对remote）。
- 设备规矩：只动11T Pro+（IN9LZTAYV4UGU4JF）；12 Pro（indq5xfi6hovay4d）禁碰（前车之鉴）。
- 测试连接/开局验证只能真人手点，adb代点无响应（已实证两次），不要再让机器代点。

## 恢复读盘（全体系唯一顺序，别乱）

1. AGENTS；2. 角色卡；3. 根 `USER_MODEL_OVERRIDE.md`（软链指母版 T3）；4. 本 HANDOFF；5. 根 `经验一句话.md`；6. 任务目标放最后。
冲突才扩大读。

## 治理审计待办（2026-09-26，ORCA 治理层）
- 回填 TASK-MODEL-LOG #60 的 chain_status=OPEN（「RC清障三件」result=PASS 但备注'待评审初版/产品阻塞'）；修正本 HANDOFF 中「DISPATCH-LOG（空…）」与实际 106 行不符。
- 依据与全量清单见 `1.Active/ORCA派工账本-逐项目待办清单.md`；新账本规则：model 用 provider/model 精确写法，角色交付 PASS≠整链验收（未闭环记 chain_status=OPEN）。
