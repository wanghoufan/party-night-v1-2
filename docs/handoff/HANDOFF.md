# HANDOFF｜交接（暂停/恢复用，先读我）

> 旧版字段（governance-state / Evidence / Human Gate / Promotion / Dispatch ID）已废弃，不填。

- Captured at（YYYY-MM-DD HH:MM）：2026-09-21 09:45
- PROJECT_PHASE：（空：Party Night V1.2 已完成实现，未开新阶段；旧项目事实交接见备份 `docs/handoff/HANDOFF.md.旧版-2026-09-13`）
- PLAN_VERSION：（空）
- PLAN_READINESS_SCORE：（空；定义以 docs/pm/PRODUCT_PLAN.template.md 为准）
- PLAN_GATE：（IN_PROGRESS）
- DEV_BASELINE：（空）
- CHANGE_REQUEST：（NONE）
- Stage ID（本阶段叫什么）：迁移整理（2026-09-21）
- 剩 P0（没完的才列，多一条都不行）：
  - 清理后的最终 E2E 重跑未执行（旧交接下一步第 1 项；需确认端口空闲后跑 `PARTY_NIGHT_PRODUCTION_SMOKE=true pnpm test:e2e`，预期 21/21）。
  - Git 首次提交+推送未做（旧交接下一步第 2–6 项；以最新用户指令为准，旧授权已暂停）。
- 当前 Task（正干到哪）（累计打回 n/2，supervisor每次打回时TM同步更新）：迁移整理已完工，无在途 Task，打回 0/2。
- 执行链/Session（可选，仅真 resume 通道填，普通 subagent 可空；TM 只记录/引用，ID 由基础设施返回，不手造、不要求用户复制；返工确认是否原链；senior 升级开新链后更新）：本窗口单次整理，无链。
- 未闭环评审意见（code-reviewer/qa 留的还没改的）：无。
- docs 落盘清单（本轮新增/改了哪几个 docs 文件）：
  - 模板铺入：`docs/roles/`、`docs/pm/`、`docs/handoff/HANDOFF.template.md`、`docs/handoff/EXT-WORKLOG.template.md`、`docs/model/`（示例行已清空）、`docs/qa/`、`docs/review/`、`docs/sop/`、`docs/prompts/`、`docs/templates/归位表.template.md`、`scripts/orchestration/`
  - 新建：`docs/templates/归位表.md`、`docs/handoff/HANDOFF.md`（本文件；旧版已备份）
  - 备份：`AGENTS.md.旧版-2026-09-13`、`docs/handoff/HANDOFF.md.旧版-2026-09-13`
- 下一步（Next Single Action）：按《编排者提示词》开工；若恢复业务，先跑 E2E 再做 Git 首次提交（见剩 P0）。
- 人要拍什么板（列出来问，不问不许开工）：无（整理轮无事项需拍板）。
- permission_request（可选：原文/决策/回执一句，首版可先记自然语言一句）：无。
- 收尾记一笔（neat-freak：文档对齐了没、临时文件清了没、未决列完没；neat 派完后 TM 补记，若已落盘则追加修订行）：未派 neat；dev 进程（3111）与 /tmp/party-dev.log 为本轮验证残留。

## 恢复读盘（全体系唯一顺序，别乱）

1. AGENTS；2. 角色卡；3. 根 `USER_MODEL_OVERRIDE.md`；4. 本 HANDOFF；5. 根 `经验一句话.md`；6. 任务目标放最后。
冲突才扩大读。
另：本项目事实真源另见 `docs/handoff/HANDOFF.md.旧版-2026-09-13`（Party Night V1.2 交接）与 `Party Night SDD V1.2/`（SDD 基线）。
