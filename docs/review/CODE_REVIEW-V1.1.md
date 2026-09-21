# CODE REVIEW

- Task: V1.1 玩法扩展与主局整合增量（582f23e..HEAD，Phase2–Phase18）
- Commit: 648e78f
- Reviewer: code-reviewer
- Result: 过（PASS，无 P0/P1；P2 回归锁已由测试覆盖）

## P0 / P1 Findings

- 无。七查结论：
  - Session 状态机：`lib/engine/session-engine.ts:114-131` switchPack 同 Session ID、保留 config/rounds/usedCardIds、未完成 round 记 skipped；`lib/engine/pack-switcher.ts:32-37` 切换后本地 seed 立即补位再出题，符合 FR-006/FR-045。
  - Migration 幂等非破坏：`lib/storage/session-migration.ts:55-66` 当前版本直接 safeParse 返回（幂等），旧版经 upgradeToCurrent 纯函数升级，未知版/坏记录返回 undefined 由调用方隔离不清库，符合 FR-043。
  - AI schema/fallback：`lib/ai/generate-deck.ts:28-35,51-58,75-81` schema 校验+安全过滤+去重，失败回退 localSeedDeck，阈值补位同步离线可用，符合 FR-026/FR-028。
  - 安全渲染：全库无 dangerouslySetInnerHTML/innerHTML；`lib/security/untrusted-text.ts` 去控制字符+钳长，React 默认转义，符合 FR-042。
  - Key 边界：`public/sw.js` 无 apiKey/Authorization 匹配；凭据仅经 `/api/generate-session` Authorization 头发送，符合 FR-041。
  - PWA 恢复/四 Tab/原 4 玩法：`session-current-pack-recovery`、`pwa-cache-regression`、`pwa-schema-upgrade`、`settings/setup-regression`、`disabled-core-pack` 等 E2E/unit 均在 437 通过集合内。

## P2 / P3 Backlog Findings

- P2：`switchPack` 清空 `currentPackState`（session-engine.ts:126）会丢弃其他玩法局部状态；当前仅 compatibility 使用该字段，影响可接受，后续若多玩法并存局部状态可考虑按 packId 分键保留。
- P3：HANDOFF.md 仍为迁移整理旧快照，未同步 V1.1 DEV_BASELINE 进度；建议 TM 收尾更新（非 blocking）。

- 验证：`npm test` 70 文件/437 用例全过；`npx tsc --noEmit` 干净。
