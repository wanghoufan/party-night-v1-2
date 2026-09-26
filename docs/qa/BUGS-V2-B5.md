
# BUGS

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| （无） | — | — | — | — | V2-B5 | 全量验证零缺陷，无返工项 |

## V2-B5 放行证据（2026-09-25）

- 任务：V2-B5 耗尽控制器 QA 全量验证（只读，不改业务代码）。
- 范围：`lib/v2-relationship/v2-exhaustion.ts`（assess/widen/applyHost 五层级＋软去重放宽＋reshuffle）＋`tests/unit/v2-exhaustion.test.ts`（9 例）。
- 环境：macOS arm64／Node v24.19.0／pnpm 11.21.0／vitest 3.2.7；工作区 HEAD b08ceb8（脏区仅 docs/账本与 V2 新增文件，业务代码为 B5 新增未提交，验证对象即该脏区现状）。
- 命令与结果：
  - `pnpm lint`：exit 0，**0 error**／6 warning（全部为存量 `scripts/decision/*.mjs` unused-vars，与 B3/B4 记录同源，非本任务文件）。
  - `pnpm typecheck`（`tsc --noEmit`）：exit 0，**0 错**。
  - `pnpm test`（vitest 全量）：exit 0，**83 files / 627 tests 全过**（0 fail 0 skip）。
  - 定向复跑 `npx vitest run tests/unit/v2-exhaustion.test.ts`：9/9 过，逐例点名全绿。
- 增量核对：618（B4，82 files）→ **627（B5，83 files）＝+9**，恰为 v2-exhaustion.test.ts 新增 9 例，文件数 +1 吻合，零破坏。
- 9 例覆盖核验（与 D8=A+ 口径对照）：五层级判定①–⑤（BUCKET_OK/BUCKET_EMPTY/PACK_EXHAUSTED/RELATIONSHIP_GLOBAL_EXHAUSTED/AWAITING_HOST_EXHAUSTION_DECISION）＋widenDedupWindow 5→4→3→2→1→0 阶梯及 0/负数/超上限边界＋applyHostDecision reshuffle（清 used、保 recent、cycle+1、不改入参）＋finish（原样返回）＋禁回退 V1.6（grep 断言 import 白名单仅 `./v2-state`）——与任务声明范围逐条吻合。
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
