# CODE REVIEW

- Task: V2-B7 对外生效复核（D1 内容切换 + D4 性别录入 + D2 单 Router）
- Commit: 工作区未提交（app/setup、app/boundaries、PlayerPicker、session-draft（新建）、session-engine、session-migration、schemas、generate-deck + tests/unit/v2-b7-*×3）
- Reviewer: code-reviewer
- Result: **过（PASS）**——P0=0、P1=0；2 条 P2 入 backlog（不阻塞本批），1 条 D2 收口提醒转后续 UI 集成批次

> 复核证据：三份 B7 单测 32/32 过；全量 unit 673/673 过（87 文件）；`tsc --noEmit` 0 错；lint 0 错（22 条既有 warning 不在本批改动面）；版本三处同值 1.5.0。

## 逐项对照（TM 指定审查问题）

| 审查问题 | 结论 | 证据 |
|---|---|---|
| 旧种子是否仅 history-only 保留 | ✅ 是 | `BUILTIN_SEED_CARDS` 生产代码引用仅剩 `lib/game-packs/built-in-seeds/index.ts:458` 定义本身＋`scripts/export-builtin-question-bank.ts`（导出工具，属 history/工具用途）；`generate-deck.ts` 牌堆/补位全走 `mainlineSsotCards`（lib/ai/generate-deck.ts:14,92），deck/refill 全 `PN-*` 零 `seed-*`（v2-b7-content-switch.test.ts:107-133 断言）；ID 全 `PN-` 唯一、`migrationIdPolicy=NONE` 无翻译表（:57-74） |
| V2 主线是否只走 V2RouterPort | ✅ 是（V2 主线模块内） | v2-session/v2-router/v2-mainline 可执行代码不 import `card-selector`/`INTENSITY_WEIGHT`/`16:8:4:2:1`/`BUILTIN_SEED_CARDS`，源码断言＋import 白名单双锁（v2-b7-router-single.test.ts:205-220）；出卡唯一入口 `drawV2SessionCard(..., createV2MainlineRouter(...))`；耗尽返回 AWAITING_HOST 不回退旧 Router 硬塞卡（:189-203）。⚠️ 收口提醒见下 P2-② |
| 旧档无性别字段是否兼容 null 降级 | ✅ 是 | `migrateSessionRecord` → `normalizeSession` → `withSessionParticipants` 幂等补齐 `pairGender=null`（session-migration.ts:74-78）；V1 旧档（schemaVersion=1）升级路径同补（v2-b7-pair-gender.test.ts:221-232）；迁移幂等不新建 pair（:218）；恢复不阻止 |
| 无合法 pair 是否降级普通玩法不暴露字段 | ✅ 是 | `pairModeFor` 空 pair 池 → `NO_ELIGIBLE_PAIR`（v2-participants.ts:81-83）；提示 `本局将使用普通玩法`，测试断言不含「男/女」（v2-b7-pair-gender.test.ts:98-99）；全员未填时全桌玩法连抽全为 `all-players` 卡、定向玩法不出卡不猜人直接耗尽指引（:115-140）；单目标性别/中途退出均完整降级不造边（:142-156） |

## P0 / P1 Findings

- 无。D4=A 口径三条红线全部落实：① `pairGender` 只存当局 Session `participants`，Player 档案 schema 无该字段、RelationshipState 无性别字段（test :239-245 JSON 断言）；② 非法/缺失/悬空/重复一律 null 或丢弃，绝不猜（`normalizePairGender`/`normalizeParticipants`，test :158-175）；③ 性别不跨局沿用（setup 沿用上一局时 `setGenders({})`、quickStart 恒 null，app/setup/page.tsx:52,81），不进偏好设置。

## P2 / P3 Backlog Findings

- **P2-①｜落库 Session 的 `pairGender` 非法值会被整体隔离而非降级**：`gameSessionSchema` 读到 `pairGender:"x"` 时 `safeParse` 失败，而 schemaVersion=2 不在 `MIGRATABLE_SESSION_SCHEMA_VERSIONS`（session-migration.ts:173）→ 整局返回 undefined 进 quarantine。与 R4 §2.3「非法枚举一律 null、不阻止恢复」口径存在偏差。触发条件罕见（写入端全经 schema 校验，仅外部手改/损坏可触），不阻塞；建议后续在 `migrateSessionRecord` 失败分支对 participants 先做一次宽容规范化再重试解析，或把该偏差向 Plan 对一次口径。
- **P2-②｜D2「旧 selector 生产不可达」尚未在 App 层收口（scope 边界，非本批缺陷）**：`/game` 主局当前仍走 legacy `startRound`→`card-selector`（出的是 PN-* 内容），V2 relationship-aware 主线（v2-session 编排器）未接 UI；v2-b7-router-single.test.ts:219 显式断言该引用保留。B7 范围按派工口径为「D1 内容切换＋D4 录入＋D2 Router 契约」，本条不判缺陷，但要求：后续接线批次必须删除断言中保留的 legacy 引用或限死可达性，并随 UI 集成一并处理 B6 转来的两条 P2（耗尽残留窗口语义、`applyV2HostDecision` 状态门禁）——收口前 D2 的 DoD 不能宣称完成。
- **P3｜草稿 `participants`（含性别三态）驻留 sessionStorage 至会话结束**：属当局轻度敏感字段，D4 红线只限「不进长期存储/analytics/AI/导出」，sessionStorage 合规；提示语已向用户说明「不保存到玩家档案」。无需改动，记录在案。

## 附：门禁与回归

- 新建 `lib/engine/session-draft.ts` 契约清晰：新形态 `{config, participants}` 与旧形态（纯 config）双兼容，坏草稿返回 undefined 回 /setup 不激活不可玩的局；`SESSION_DRAFT_KEY` 沿用原 key，旧草稿无缝升级。
- `createSession` 增加可选 `participants` 参数，不传时行为不变（全 null），旧调用方（summary 重开等）零影响。
- PlayerPicker 删玩家时同步清理 genders 条目（PlayerPicker.tsx:34），无悬空 playerId 进草稿。
