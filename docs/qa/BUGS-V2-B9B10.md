
# BUGS

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| （无） | — | — | — | — | V2-B9+B10 | 全量验证零缺陷（P0/P1/P2/P3 均无新增），无返工项 |

## V2-B9+B10 放行证据（2026-09-25）

- 任务：V2-B9 私密互选 UI + V2-B10 事件归约 QA 全量验证（只读，不改业务代码）。
- 范围：
  - B9：`components/game/MutualCheckSheet.tsx`＋`lib/v2-relationship/v2-mutual-check.ts`＋接线 `app/game/page.tsx:11,105-117,209`（checkpoint 9/14/19 触发、互选完成/取消回写）。
  - B10：`lib/engine/v2-deal.ts:329 reduceResolvedRound`（R3 归约层）＋`lib/v2-relationship/v2-reducer.ts:170 applyPlayerExit / :193 applyPlayerTemporarilyAway`（退出释放/暂离不释放）＋归约接线 `app/game/page.tsx:123 resolve()`（每轮终态先归约再走引擎链）。
  - 对应测试：`v2-mutual-check.test.ts`＋`mutual-check-sheet.test.tsx`＋`v2-b10-event-reduce.test.ts`。
- 环境：macOS arm64／Node v24／pnpm 11.21.0／vitest 3.2.7；工作区 HEAD b08ceb8（脏区含 B9/B10 新增文件，验证对象即该脏区现状）。
- 命令与结果：
  - `pnpm lint`：exit 0，**0 error**／22 warning（明细见下「lint warning 增量说明」，均非 B9/B10 业务代码，0 error 达标）。
  - `pnpm typecheck`（`tsc --noEmit`）：exit 0，**0 错**。
  - `pnpm test`（vitest 全量）：exit 0，**91 files / 728 tests 全过**（0 fail 0 skip）。
  - 定向复跑 `npx vitest run` 三个 B9/B10 测试文件：**44/44 过**（v2-mutual-check 19＋v2-b10-event-reduce 16＋mutual-check-sheet 9）。
- 增量核对（基线 B8＝88 files / 684 tests）：684（B8，88 files）→ **728（当前，91 files）＝＋3 files／＋44 tests**；恰为三个 B9/B10 新增测试文件 19+16+9＝44，文件数 +3 吻合；基线 88 文件 684 例全数保留通过，**零回归破坏**。
- 范围—测试映射核验：
  - B9：互选 due 四道门/D5 上限（reducer 单口径复用）、单向选择内存零持久化（Storage/IDB spy＋源码审计）、跳过无惩罚不进公开结果、finalize/cancel 清内存不留痕——`v2-mutual-check` 19 例＋`mutual-check-sheet` 9 例（含公开页无「跳过/未选」文案断言）。
  - B10：`REL_CARD_COMPLETED` 唯一 effective 推进源、skip/swap/neutral/expansion +0、eventId 幂等重放＋同轮冲突终态互斥、`currentRound` 归约后原样保留、页面接线源码断言（`reduceResolvedRound(session, …)` 出现在 `app/game/page.tsx`）——`v2-b10-event-reduce` 16 例。
  - 退出/暂离：退出删含该玩家的 pairState/cooldowns/matches 三边＋保障 `expired`→D5 名额可再建；暂离只 pause 保障、MATCH/cooldown/signal 全保留→名额不释放——两例专测通过。
- 结论：**QA_RESULT=PASS**，放行进入下一环节（supervisor 复检）。

### lint warning 增量说明（0 error 达标，记录不阻塞）

- B6 基线 6 warning → 当前 22 warning，**＋16 全部来自 `android/app/build/intermediates/assets/debug/mergeDebugAssets/native-bridge.js`**（Capacitor 构建产物，生成文件被 `eslint .` 扫到，非 B9/B10 源码）。
- 存量 6：`scripts/decision/orca-decide.mjs` 4＋`scripts/decision/run-shadow.mjs` 2（与 B3–B6 记录同源）。
- 建议（P3 级，记账不返工）：后续把 `android/**/build/` 构建产物加入 eslint ignore，避免生成物污染门禁统计。

### P0–P3 缺陷清单

- P0：无。
- P1：无。
- P2：无（QA 新增）；评审侧已记 2 条 P2 backlog（`applyPlayerExit/applyPlayerTemporarilyAway` 生产无调用点待 R4 落盘接线；已成 MATCH pair 再互选结果页重复公布）——见 `docs/review/CODE_REVIEW-V2-B9B10.md`，均判非本任务阻塞，QA 不重复开单，随 backlog 跟踪。
- P3：1（非缺陷）——上节 lint warning 增量说明（生成物被 lint 扫到）；评审另记 2 条 P3（session 上限触顶事件丢弃、取消互选检查点不重弹为有意行为）。
- P1 以上清单：空。

## 真机QA会话能力预检结果（本轮无真机 session，纯 CLI 静态验证）

- 最终结论：`NOT_VERIFIED`
- 是否允许进入正式QA：NO（本任务不含真机项，不影响上述 CLI 验证放行）

## Fix Attempt Fingerprint

- Task ID: V2-B9+B10
- Root Cause Hypothesis: —（零缺陷，无 fix）
- Approach: —
- Files Changed: 无（只读 QA，仅产出本文档）
- Verification: pnpm lint / typecheck / test 全量＋三个 B9/B10 测试文件定向 44/44＋基线增量核对 88/684→91/728
- Failure Reason: —
- Difference From Previous Attempt: —
