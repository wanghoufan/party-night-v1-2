# HANDOFF｜交接（暂停/恢复用，先读我）

> 旧版字段（governance-state / Evidence / Human Gate / Promotion / Dispatch ID）已废弃，不填。

- Captured at（YYYY-MM-DD HH:MM）：2026-09-22 上午
- PROJECT_PHASE：（DEVELOP：V1.5 已发布验证通过，剩用户真机验收）
- Captured at（YYYY-MM-DD HH:MM）：2026-09-22 15:30
- PLAN_VERSION：（PRODUCT_PLAN_V1.5）
- PLAN_READINESS_SCORE：（98）
- PLAN_GATE：（APPROVED）
- DEV_BASELINE：（PRODUCT_PLAN_V1.5）
- CHANGE_REQUEST：（C：指人/转瓶子视觉重设计＋转瓶子链回跳＋切包从1/40重计＋暂停/结束顶栏＋题库分类导出）
- CHANGE_REQUEST：（C：指人/转瓶子视觉重设计＋转瓶子链回跳＋切包从1/40重计＋暂停/结束顶栏＋题库分类导出）
- Stage ID（本阶段叫什么）：V1.1-玩法扩展与主局整合开发
- 剩 P0（没完的才列，多一条都不行）：
  - GAP-04 真机弱光验收（唯一 P0）：请在手机上打开生产站走一局新玩法（二选一→切转瓶子→规则库看小姐牌），确认弱光可读、好按、切换不丢局；回“放行”即 Release。
- 当前 Task（正干到哪）（累计打回 n/2）：V1.5宽屏热修（Change A）supervisor终检打回1/2→四项落盘补齐（spec入库＋CODE_REVIEW宽屏节＋两账本各一行＋本同步）→待重送终检→发布。
- 宽屏热修证据：lint0/typecheck0/unit497；桌面1280x800 E2E 4项过（座位最小间隙21.2px/长昵称5.8px/无巨型元素/无溢出；/、/packs居中390）。
- 执行链：本窗口 TM 直驱 + codebuddy builder + 本窗口 reviewer/qa/recorder待派 + opencode supervisor。
- 未闭环评审意见：无。
- docs 落盘清单：
  - 基线：`docs/2026-09-21 - MAC - ChatGPT - Party Night玩法扩展与主局整合-计划 - V1.1/`（4 份，用户提供）
  - 评审：`docs/review/CODE_REVIEW-V1.1.md`、`docs/review/CONVERGE-V1.1.md`
  - QA：`docs/qa/BUGS-V1.1.md`、`docs/qa/V1.1-放行证据.md`
  - 事实备份：`docs/handoff/HANDOFF.md.旧版-2026-09-13`（V1.2 真源）；`docs/pm/V1.3-讨论稿.md`（挂起：7 待定+酒罚默认含决策）
  - 账本：`docs/model/TASK-MODEL-LOG.jsonl`（示例行已清）；`docs/model/DISPATCH-LOG.jsonl`（空，首个真实派工前由 TM 写）
- 下一步（Next Single Action）：V1.5 主链全过 → commit+push+生产验证 → 用户真机验收（GAP-04）回“放行”即收工。
- 执行链：本窗口 TM 直驱 + codebuddy builder + 本窗口reviewer + codex Luna qa(+TM接管E2E) + opencode supervisor（打回1/2→返工→打回2/2停线→TM删账本重复1行自验27行无dup→按停线结论放行）。
- supervisor 终检：除账本dup外全PASS；dup已删（27行/dups{} /JSON合法，TM自验）；其余无需重跑；sha记P2不阻塞。
- 人要拍什么板：
  - 真机验收（GAP-04）后放行;GAP-03 规则收藏不实现（已知限制），异议请下 `变更请求：规则收藏`。
- permission_request：无。
- 收尾记一笔（neat-freak 2026-09-22）：docs 与代码已对齐（8 包/规则 8 条/工具 2 个/Session v2；V1.3 讨论稿 2 处已校准）；test-results 空、:3000 无残留进程；README 中英 8 玩法为 TM 后续补齐（校验 DOCUMENTATION_READY）。

## 一、当前工作进展

- V1.2 已封版上线（https://party-night-v1-2.vercel.app，GitHub wanghoufan/party-night-v1-2，About 三格已写）。
- V1.1 玩法扩展与主局整合开发完成：新玩法 4（二选一/指人/默契/转瓶子）、规则库 8 条、工具 2 个、主局切换、Session v2+幂等迁移+隔离、断网 seed 补位、packState 按包分键。
- 质量门：lint 0、typecheck 0、unit 452 全过、E2E 67pass+4skip（production 门控，production 下 4/4 补过）、build 11 页、production smoke 过；reviewer PASS（含 GAP 补丁复核）；qa 11/12；supervisor 再检 PASS 附条件（仅 GAP-04）。
- 酒罚顶层决策：`noAlcoholPenalty=true` 硬默认已删，默认含、雷区可避可关（Constitution/SPEC 旧表述待 PLAN 成版时修订）。
- 基线材料与旧交接：见上 docs 清单；V1.3 方向讨论与本轮无关，继续挂起。

## 二、下一步任务

1. 用户真机验收（唯一 P0，见剩 P0）。
2. 回“放行”后：派 experience-recorder 补 `经验一句话.md` → 告诉用户 Release 完成 → 收工（commit+push 已做：`git log` 尾为 neat 收尾+README 同步）。
3. 若验收出 bug：按 ORCA 主链 builder→reviewer→qa→supervisor 修（分工表见 USER_MODEL_OVERRIDE.md 母版 T3）。
4. V1.3 方向（7 待定+AI 即兴去留）另起 Phase1，不与本轮混。

## 三、注意事项及相关规矩

- 四 Tab 不动（首页/组局/游戏包/设置）；单设备单桌 local-first；整局预生成后离线可玩；Engine 与 Pack 解耦；无账号/联机/云库。
- 强度 1–5 沿用现有尺度 UI，不重做；酒罚默认含、雷区可关；跳过机制保留。
- 手机是 Party 主持人：不做逐人手机录入；默契测试单机口头+Host 点选。
- E2E 已知坑（修过，勿回退）：换题后读数必须等 header 轮次推进；Toggle 不用 label 包裹；check/uncheck 改 click+断言；seedSession 不删库、版本与 App 对齐（当前 v2）；pack-switch 会把旧未完成轮记 skipped（轮次号从第 2 起）。
- 不擅自 commit/push（本轮已推到 5a4d744 后续 commits，见 git log）；不碰 secrets；`docs/sop/` 为规范位。
- E2E 全量约 1 分钟；production smoke 需先 `pnpm build` + `pnpm start` 再带 `PARTY_NIGHT_PRODUCTION_SMOKE=true` 跑。
- 仓库：origin main 已同步；Vercel 生产自动部署 main。

## 恢复读盘（全体系唯一顺序，别乱）

1. AGENTS；2. 角色卡；3. 根 `USER_MODEL_OVERRIDE.md`（软链指母版 T3）；4. 本 HANDOFF；5. 根 `经验一句话.md`；6. 任务目标放最后。
冲突才扩大读。
