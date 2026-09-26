# CODE REVIEW

- Task: RC 清障三件复核（P2-01 名册三分接线 / P2-02 finalize 已存在 MATCH 过滤 / 安卓图标源核验）
- Commit: 工作区未提交 diff（builder 通道 codebuddy）
- Reviewer: code-reviewer（独立审查上下文）
- Result: **过（PASS）**——P0=0，无阻塞 P1；2 条 P3 记录在案，不影响收束。

## 审查范围与证据

- P2-01：`lib/v2-relationship/v2-participants.ts`（`diffPlayerRoster` 三分）、`lib/engine/v2-deal.ts:268-289`（`applyPlayerRosterChange` 唯一落盘入口）、`lib/v2-relationship/v2-reducer.ts:170-201`（`applyPlayerExit`/`applyPlayerTemporarilyAway`）、`app/game/page.tsx:130`（`changePlayers` 接线）。
- P2-02：`lib/v2-relationship/v2-mutual-check.ts:166-180`（`finalizeMutualCheckRun`）、`lib/v2-relationship/v2-reducer.ts:120-130`（`mayCreateMatch`）。
- 图标：`android/app/src/main/res/mipmap-*/ic_launcher{,_round,_foreground}.png`、`mipmap-anydpi-v26/*.xml`、`values/ic_launcher_background.xml`，对比 `public/icons/icon-{192,512}.png`。
- 测试实证：`vitest run tests/unit/v2-mutual-check.test.ts tests/unit/v2-b10-event-reduce.test.ts` → **43/43 PASS**（23+20，本地实测）；`tsc --noEmit` 零错误。

## 逐项结论

### 1）P2-01 名册三分接线 ✅

- **三分语义正确，无 `active=false` 一刀切**：`diffPlayerRoster`（v2-participants.ts:97-116）以「旧名册有、新名册无 → exited；两边都在且 active true→false → away；false→true → returned；新增不迁移」唯一口径分类；`applyPlayerRosterChange`（v2-deal.ts:268-289）按分类分派：exited 走 `applyPlayerExit`，away 走 `applyPlayerTemporarilyAway`，returned 无需归约（资格由参与者投影重算、保障沿 `advanceGuarantee(resume)` 从暂停点继续，v2-session.ts:312 出卡前自动 resume）。
- **EXIT 终止语义**：`applyPlayerExit` 原子删含该玩家的 `pairState`/`cooldowns`/`matches` 三边 → D5 名额立即释放（`countActiveMatches` 下降），相关保障进 `expired` + `terminalReason="expired-player-exit"`；无关边原样保留。
- **AWAY 暂停语义**：`applyPlayerTemporarilyAway` 不删任何边，MATCH/cooldown/signal 全保留（D5 名额不释放），仅 pending 保障转 `paused` + `pauseReason="player-away"`，已累计计数不清零；幂等（已 paused 不回写）。
- **生产接线生效**：`app/game/page.tsx:130` `changePlayers` 已从 `updatePlayers` 换为 `applyPlayerRosterChange`；`updatePlayers` 全仓 grep 0 引用，已彻底移除（旧 P2-01 的「生产无调用点」清障完成）。参与者投影同事务更新：离开者随名册消失退出 pair pool，暂离者保留边但 active=false 排除出调度 pool。
- **测试覆盖**：v2-b10-event-reduce.test.ts:505-600 新增 diff 用例——三分分类（含改名/新增不迁移）、EXIT 删边+expired+释放、AWAY 保留边+paused、RETURN 不删边+resume 继续计数，全过。

### 2）P2-02 finalize 公开层过滤 ✅

- `finalizeMutualCheckRun`（v2-mutual-check.ts:171-177）三道过滤顺序正确：双方互选（`mutualResult`）→ **已存在 MATCH 先过滤（`relationship.matches[key] !== undefined` continue，不再当新互选公布）** → `mayCreateMatch` D5 cap 校验。旧 P2-02 的「旧 MATCH 重复公布」清障完成。
- **`mayCreateMatch` 幂等语义 intact**：函数本身未改（v2-reducer.ts:125 已存在 pairKey 返回 true 的幂等分支保留）；finalize 的过滤只收窄「公开面」，不改变 reducer 语义——reducer 侧 `SYSTEM_MUTUAL_CHECK_COMPLETE` 归约仍走 `mayCreateMatch` + `alreadyMatched` 去重（v2-reducer.ts:375-386），已 MATCH pair 重放不重复建 MATCH、不动 `matchedAt`。测试「reducer 侧幂等语义不变」直接断言此点。
- **同 run 内 D5 快照无竞态**：单选语义（每人至多一个 MUTUAL_PICK）保证 run 内新 MATCH 点不相邻，finalize 循环用同一 `relationship` 快照不会漏拦；即便构造异常序列，reducer 落盘时还有第二次 cap 校验兜底。测试「旧 MATCH 重选与 D5 超限同 run」覆盖交叉场景。
- **测试覆盖**：v2-mutual-check.test.ts 新增 4 例（:294-390）——旧 MATCH 重选零公开零事件、一旧一新只公布新 pair、旧 MATCH+超限只公开真正可达 pair（且结果不含 cap 泄漏文案）、reducer 幂等直测，全过。

### 3）安卓图标源核验 ✅

- **确为紫色 PWA 源**：逐像素比对——mipmap legacy `ic_launcher.png` 四角纯白 (255,255,255)，与 `public/icons/icon-512.png`/`icon-192.png` 同为白底；中心色 (11,20,57) 与 PWA 源 (13,22,61)/(12,21,59) 同源（深紫夜空底 + 粉紫霓虹 disco ball + 皇冠 + PN），视觉比对一致。
- **adaptive-icon 同步**：`mipmap-anydpi-v26/ic_launcher{,_round}.xml` 均引用 `@mipmap/ic_launcher_foreground` + `@color/ic_launcher_background`；foreground PNG（432×432 @xxxhdpi）四角全透明（alpha=0）、主体居中留安全区，符合 108dp adaptive 规范；背景色 `#0C1025`（values/ic_launcher_background.xml）与图标深紫底协调。五档密度（mdpi→xxxhdpi）三件套齐全，时间戳 2026-09-26 同批生成。

## P0 / P1 Findings

- 无 P0。
- 无阻塞 P1。

## P3 Backlog Findings

- **P3｜`drawable/ic_launcher_background.xml` 为 Capacitor 默认遗留**（#26A69A 青色网格 vector）：未被 adaptive-icon 引用（adaptive 走 `@color`），仅死文件，无视觉影响；后续可清。
- **P3｜adaptive 背景色与图标卡片底色微差**：`#0C1025` vs 图标卡片底约 `#0E173F`，仅圆角外露出，肉眼几乎不可辨；如追求完全一致可调 `ic_launcher_background` 为 `#0E173F`。

## 回归影响与可回滚性

- `applyPlayerRosterChange` 只在名册变更路径生效，旧 Session（无 participants/relationshipState）按幂等规范化补齐，原样可玩；`updatePlayers` 移除无残留引用（tsc 零错误佐证）。
- finalize 过滤是纯收窄（公开面变小），reducer 幂等/cooldown 语义未动，跨 run 间隔 ≥5 门槛不受影响。
