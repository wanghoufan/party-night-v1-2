# HANDOFF｜交接（暂停/恢复用，先读我）

> 旧版字段（governance-state / Evidence / Human Gate / Promotion / Dispatch ID）已废弃，不填。

- Captured at（YYYY-MM-DD HH:MM）：2026-09-26（Change B闭环待冻新RC：reviewer PASS+附录/qa PASS(lint0/typecheck0/750/E2E86+4)/supervisor三检PASS；自包含APK飞行模式smoke过；离线smoke见RG-01-NEWRC-SMOKE.md）
- PROJECT_PHASE：（DEVELOP：RELEASE_GATE_VALIDATION；RELEASE_GATE NOT_STARTED）
- PROJECT_PHASE：（DEVELOP：RELEASE_GATE_VALIDATION；RELEASE_GATE NOT_STARTED，7/7通过才Release）
- PLAN_VERSION：（PRODUCT_PLAN_V2.0）
- PLAN_READINESS_SCORE：（83＋Human例外有条件批准）
- PLAN_GATE：（APPROVED，V2.0 Human Gate终版）
- DEV_BASELINE：（PRODUCT_PLAN_V2.0）
- CHANGE_REQUEST：（B：自包含离线RC+Key持久化+Matrix分离；旧RC 6dc861b作废待重冻）
- Stage ID（本阶段叫什么）：V2.0-Relationship Engine（Human已决D1换真源/D2切Router/D3=A20+5/D4=A异性/D5上限2/D6中性不推进/D7=A展示即给过/D8=A+；Release前强制Gate RG-01~RG-07须7/7）
- 剩 P0（没完的才列，多一条都不行）：
  - RG-01~RG-07 真机/真人验证（RELEASE_GATE NOT_STARTED）：7/7 PASS才Release，任一FAIL即BLOCKED禁发版。
- RC冻结（2026-09-26，commit 6dc861b，已作废）：见Change B行；重冻后刷新本节。
- 当前 Task：Change B收尾（新RC重冻+自包含APK离线smoke+RG-01从头验证准备）。
- 历史执行口径（存档，勿作当前指令）：V1.5文档包落盘→验数→发用户审查；V1.5主链→commit+push+生产验证→GAP-04放行；链入/宽屏热修证据见git log；执行链TM直驱+codebuddy builder+codex qa(TM接管E2E)+opencode supervisor；旧supervisor停线账本dup结论已处理。
- 未闭环评审意见：无。
- docs 落盘清单：
  - 基线：`docs/2026-09-21 - MAC - ChatGPT - Party Night玩法扩展与主局整合-计划 - V1.1/`（4 份，用户提供）
  - 评审：`docs/review/CODE_REVIEW-V1.1.md`、`docs/review/CONVERGE-V1.1.md`
  - QA：`docs/qa/BUGS-V1.1.md`、`docs/qa/V1.1-放行证据.md`
  - 事实备份：`docs/handoff/HANDOFF.md.旧版-2026-09-13`（V1.2 真源）；`docs/pm/V1.3-讨论稿.md`（挂起：7 待定+酒罚默认含决策）
  - 账本：`docs/model/TASK-MODEL-LOG.jsonl`（示例行已清）；`docs/model/DISPATCH-LOG.jsonl`（空，首个真实派工前由 TM 写）
   - V1.6：评审`docs/review/CODE_REVIEW-V1.6.md`（PASS，commit 4ba3d13）、QA`docs/qa/BUGS-V1.6.md`（lint0/typecheck0/511/E2E80+4skip/三处1.5.0）、把关`docs/content/题库把关/`9件（00总览旧180审计+01–07+08新题纲）、终稿`docs/content/题库终稿/`9件（00总览§一终稿350分布3/5/7/14/21+01–07各50+08新题纲）；旧`docs/content/题库审查/`已删（文档搬家映射）；账本35行至V1.6补遗（dup删后27行自验口径作废，以现35行为准）
 - V2-B3：评审`docs/review/CODE_REVIEW-V2-B3.md`（FAIL→返工→复验PASS）、QA`docs/qa/BUGS-V2-B3.md`（lint0/typecheck0/610）；账本随行。
- 下一步（Next Single Action）：Change B supervisor复检通过→自包含release APK构建装机→Mac断网离线smoke 10项→新RC冻结→RG-01从头验证。
- 人要拍什么板：
  - RG-01需本人上手真机操作；RG-02~07需组织4人/5人真人局+主观体验判断；局内“移出本局”入口是否加（Change B/C另报，不拦RC）。
- permission_request：无。
- 收尾记一笔（neat-freak 2026-09-22）：docs 与代码已对齐（8 包/规则 8 条/工具 2 个/Session v2；V1.3 讨论稿 2 处已校准）；test-results 空、:3000 无残留进程；README 中英 8 玩法为 TM 后续补齐（校验 DOCUMENTATION_READY）。
 - 收尾记一笔（neat-freak 2026-09-22 V1.6）：docs/content下仅题库把关/9件，题库审查/已删（映射见CODE_REVIEW-V1.6 P2）；V1.6评审/QA/把关/账本35行与代码现状一致（350/陡坡/L1L2/开关/1.5.0）；未碰业务代码。
 - 收尾记一笔（neat-freak 2026-09-23）：docs/content下把关/9件＋终稿/9件双包并存（终稿00§一为终稿350分布3/5/7/14/21、旧180只剩注脚，01–07各50）；与代码现状一致（种子350/陡坡16:8:4:2:1/L1L2/开关/三处1.5.0）；终稿00标题/数据源头已校准350；只改docs与经验，未碰业务代码。

## 一、当前工作进展（2026-09-22 晚，大交接冻结口）

- 生产站 https://party-night-v1-2.vercel.app（GitHub wanghoufan/party-night-v1-2，Vercel自动部署已断，改手动直推；见注意事项）。
- V1.5：转瓶子链回跳＋切包1/40重计＋顶栏暂停结束＋双页视觉＋题库180导出；宽屏热修（座位遮挡＋巨型按钮）；链入无响应热修（空牌堆补种＋耗尽提示）。已上线。
- V1.6（1.5.0）：终稿350入库（7类各50＝互动35/了解15/看戏0，4-5档35；红线三条卡面零命中；25张旧题面补遗改写全清零）；指数陡坡抽法（16:8:4:2:1）；耗尽不断游L1洗牌循环＋L2后台AI补题；Toggle重设计（品牌粉+✓/已避开）；三处1.5.0同值。门禁lint0/typecheck0/511/E2E80pass+4skip，reviewer＋supervisor PASS。已上线（手动部署）。
 - 题库文档：docs/content/下把关/9件（旧180审计＋处置＋新题纲）＋终稿/9件（终稿350题面：00总览§一3/5/7/14/21＋01–07各50＋08新题纲）；题库审查/7件已删（可pnpm export:questions重生）；评审CODE_REVIEW-V1.5/V1.6、QA BUGS-V1.5/V1.6；账本35行。
- 把关包vs软件：不一致是设计好的——把关包是旧180审计＋改写方向（给人审的），软件里是终稿350（已入库生效）。终稿/00总览§一已按种子实算重写（3/5/7/14/21，旧数注脚存档）。
- 终稿文字版终稿/9件已交付用户审题（按编号报问题）；25张旧题面补遗改写＋复核PASS已上线；neat-freak两轮对齐完成。

## 二、当前任务（Release Gate，唯一有效；旧V1.5/V1.6审题/发版口径已作废）

1. RG-01真机发布候选+离线恢复（首优先级，真机上手，PASS/FAIL二态）。
2. 4人完整局一次过RG-02/04/05/06/07（Intensity5，弱光，单手机传，≥20轮）。
3. 5人局RG-03（20轮→再玩5轮→25轮）。
4. 任一Bug：Change A/B→builder→reviewer→qa→回归→RC重冻→相关RG重验。Change C另起重开。
5. 7/7 PASS前禁版本号升级/正式部署。

## 三、注意事项及相关规矩

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
- 仓库：origin main 已同步（HEAD 86e2fd1起后续见git log）。

## 恢复读盘（全体系唯一顺序，别乱）

1. AGENTS；2. 角色卡；3. 根 `USER_MODEL_OVERRIDE.md`（软链指母版 T3）；4. 本 HANDOFF；5. 根 `经验一句话.md`；6. 任务目标放最后。
冲突才扩大读。
