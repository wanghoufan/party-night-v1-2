# HANDOFF｜交接（暂停/恢复用，先读我）

> 旧版字段（governance-state / Evidence / Human Gate / Promotion / Dispatch ID）已废弃，不填。

- Captured at（YYYY-MM-DD HH:MM）：2026-09-22 上午
- PROJECT_PHASE：（DEVELOP：V1.6已上线，大交接暂停，用户终稿审题中）
- Captured at（YYYY-MM-DD HH:MM）：2026-09-22 15:30
- PLAN_VERSION：（PRODUCT_PLAN_V1.5）
- PLAN_READINESS_SCORE：（98）
- PLAN_GATE：（APPROVED）
- DEV_BASELINE：（PRODUCT_PLAN_V1.5）
- CHANGE_REQUEST：（B：题库互动纲重写先行文档包＋耗尽不断游L1L2＋开关重设计＋尺度放开；本次只做文档包，不碰业务代码）
- Stage ID（本阶段叫什么）：V1.1-玩法扩展与主局整合开发
- 剩 P0（没完的才列，多一条都不行）：
  - GAP-04 真机弱光验收（唯一 P0）：请在手机上打开生产站走一局新玩法（二选一→切转瓶子→规则库看小姐牌），确认弱光可读、好按、切换不丢局；回“放行”即 Release。
- 当前 Task（正干到哪）（累计打回 n/2）：迁移整理完成待收尾；音效V1.7计划待用户拍范围（未开工）。
- 下一步（Next Single Action）：文档包落盘 → TM验数 → 发用户审查（绝对路径），用户点头才进内容重写。
- 链入热修证据（TM实证）：空牌堆点真心话复现pack=spin-bottle/round=none/chain.returning+exhausted/无报错；修后lint0/typecheck0/unit500；spin+desktop E2E 11项过；reviewer 4项成立无必须修。
- 宽屏热修证据：lint0/typecheck0/unit497；桌面1280x800 E2E 4项过（座位最小间隙21.2px/长昵称5.8px/无巨型元素/无溢出；/、/packs居中390）。
- 执行链：本窗口 TM 直驱 + codebuddy builder + 本窗口 reviewer/qa/recorder待派 + opencode supervisor。
- 未闭环评审意见：无。
- docs 落盘清单：
  - 基线：`docs/2026-09-21 - MAC - ChatGPT - Party Night玩法扩展与主局整合-计划 - V1.1/`（4 份，用户提供）
  - 评审：`docs/review/CODE_REVIEW-V1.1.md`、`docs/review/CONVERGE-V1.1.md`
  - QA：`docs/qa/BUGS-V1.1.md`、`docs/qa/V1.1-放行证据.md`
  - 事实备份：`docs/handoff/HANDOFF.md.旧版-2026-09-13`（V1.2 真源）；`docs/pm/V1.3-讨论稿.md`（挂起：7 待定+酒罚默认含决策）
  - 账本：`docs/model/TASK-MODEL-LOG.jsonl`（示例行已清）；`docs/model/DISPATCH-LOG.jsonl`（空，首个真实派工前由 TM 写）
   - V1.6：评审`docs/review/CODE_REVIEW-V1.6.md`（PASS，commit 4ba3d13）、QA`docs/qa/BUGS-V1.6.md`（lint0/typecheck0/511/E2E80+4skip/三处1.5.0）、把关`docs/content/题库把关/`9件（00总览旧180审计+01–07+08新题纲）、终稿`docs/content/题库终稿/`9件（00总览§一终稿350分布3/5/7/14/21+01–07各50+08新题纲）；旧`docs/content/题库审查/`已删（文档搬家映射）；账本35行至V1.6补遗（dup删后27行自验口径作废，以现35行为准）
- 下一步（Next Single Action）：V1.5 主链全过 → commit+push+生产验证 → 用户真机验收（GAP-04）回“放行”即收工。
- 执行链：本窗口 TM 直驱 + codebuddy builder + 本窗口reviewer + codex Luna qa(+TM接管E2E) + opencode supervisor（打回1/2→返工→打回2/2停线→TM删账本重复1行自验27行无dup→按停线结论放行）。
- supervisor 终检：除账本dup外全PASS；dup已删（27行/dups{} /JSON合法，TM自验）；其余无需重跑；sha记P2不阻塞。
- 人要拍什么板：
  - 真机验收（GAP-04）后放行;GAP-03 规则收藏不实现（已知限制），异议请下 `变更请求：规则收藏`。
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

## 二、下一步任务

1. 用户终稿审题反馈（按“玩法＋编号”报问题，如06指人第18条太素）→ 按编号改种子 → 门禁＋发版 → 真机验收回“放行”即收工。
2. 待办（用户明确暂缓）：全回归12局清单用户亲跑；Vercel Git自动部署重连（用户侧看集成）。
3. 若验收出bug：Change A/B主链builder→reviewer→qa→supervisor修；产品级变更走Change C重开。
4. V1.3方向（7待定+AI即兴去留）另起Phase1，不与本轮混。

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
