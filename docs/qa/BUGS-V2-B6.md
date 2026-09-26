
# BUGS

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| （无） | — | — | — | — | V2-B6 | 全量验证零缺陷，无返工项 |

## V2-B6 放行证据（2026-09-25）

- 任务：V2-B6 调用方集成（Session 级编排器）QA 全量验证（只读，不改业务代码）。
- 范围：`lib/v2-relationship/v2-session.ts`（reducer→routing→guarantee→exhaustion→widen 主链＋Host 决策幂等账本）＋`tests/unit/v2-session.test.ts`（14 例）。
- 环境：macOS arm64／Node v24.19.0／pnpm 11.21.0／vitest 3.2.7；工作区 HEAD b08ceb8（脏区含 B6 新增文件，验证对象即该脏区现状）。
- 命令与结果：
  - `pnpm lint`：exit 0，**0 error**／6 warning（全部为存量 `scripts/decision/*.mjs` unused-vars，与 B3/B4/B5 记录同源，非本任务文件）。
  - `pnpm typecheck`（`tsc --noEmit`）：exit 0，**0 错**。
  - `pnpm test`（vitest 全量）：exit 0，**84 files / 641 tests 全过**（0 fail 0 skip）。
  - 定向复跑 `npx vitest run tests/unit/v2-session.test.ts`：14/14 过，逐例点名全绿。
- 增量核对：627（B5，83 files）→ **641（B6，84 files）＝+14**，恰为 v2-session.test.ts 新增 14 例，文件数 +1 吻合，零破坏。
- 14 例覆盖核验（与 D8=A+／D2 单 Router 口径对照）：正常出卡 BUCKET_OK（入参不就地改）＋widen 救回 5→4→3 首个非空窗口＋PACK_EXHAUSTED／RELATIONSHIP_GLOBAL_EXHAUSTED 引导文案＋三层皆空 AWAITING（暂停抽卡零 Router 调用、不自动洗牌/结束）＋Host finish（used/cycle 不变）＋Host reshuffle（只清 used＋cycle+1，recent/Heat/MATCH/5 档保障全保留）＋幂等重放（reshuffle 3 次稳定 cycle=1、finish 同键重放）＋reducer 步（R3 计数/used/Heat＋match_created 建 D7 pending seen=0）＋guarantee 步（seen=1 强制 5 档 present→offered；Intensity<5 pause 不耗机会）＋routing 步（信号排序选首位 pair 传 Router）＋禁回退 V1.6（grep 断言 import 白名单仅五个 V2 模块）＋初始编排态取 SOFT_DEDUP_WINDOW 真源——与任务声明范围逐条吻合。
- 结论：**QA_RESULT=PASS**，放行进入下一环节。

### P0–P3 缺陷清单

- P0：无。
- P1：无。
- P2：无。
- P3：无。
- P1 以上清单：空。

## 真机QA会话能力预检结果（本轮无真机 session，纯 CLI 静态验证）

- 最终结论：`NOT_VERIFIED`
- 是否允许进入正式QA：NO（本任务不含真机项，不影响上述 CLI 验证放行）

## Fix Attempt Fingerprint

- Task ID: V2-B6
- Root Cause Hypothesis: —（零缺陷，无 fix）
- Approach: —
- Files Changed: 无（只读 QA，仅产出本文档）
- Verification: pnpm lint / typecheck / test 全量＋v2-session 定向 14/14
- Failure Reason: —
- Difference From Previous Attempt: —
