# BUGS｜AI 生成稳定性举证

- 日期：2026-09-26
- Task：AI 前端直连 + 分块 4×10 + OpenCode 优先 + `generationSource` 判定
- 范围：静态门禁、矩阵证据审查、判定器反向自检及 Mac OpenCode 分块对照诊断；未改业务代码，未触碰设备，未跑 E2E
- 基线：HEAD `741e2e9`；工作区改动未提交
- QA_RESULT：**PASS**（本轮 P0-CORE 放行证据已闭环；`AI-MATRIX-PLAN.md` §8 三层全量矩阵约 195 格列为后续 RG 放行前加强项，按编排者裁定转 backlog）

## 门禁结果

| 门禁 | 实际结果 | 判定 |
|---|---|---|
| `pnpm lint` | 0 error，8 warning（`orca-decide.mjs` 4、`run-shadow.mjs` 2、`ai-matrix-phone.ts` 1、`dump-state.ts` 1） | PASS |
| `pnpm typecheck` | 0 error，exit 0 | PASS |
| `pnpm test` | 95 files passed；818 tests passed，0 failed（新增 maxTokens 截断重试用例 +3，`tests/unit/direct-provider.test.ts`） | PASS |
| `pnpm build` | Next.js optimized production build 成功，21/21 static pages 生成 | PASS |

## 证据审查

### Mac OpenCode 扩展矩阵

- `docs/qa/AI-MATRIX-FULL.md` 记录 80/80 通过（100%），HTTP 200×80、每格 10 张卡、`generationSource=ai` 80/80、严格标红 0、疑似 2、总请求 81（1 次重试），provider 全为 `opencode-go`。
- 因此该矩阵自身的抽样结果为 P0=0、标红=0；表格第 1 格标注 `×2`，与 80 格中 1 格重跑的汇总相符。
- `docs/qa/AI-MATRIX-PLAN.md` §8 的正式放行条件还要求第一层 pairwise 零遗漏、第二层高风险全量与 2.6/2.7 对照、第三层定向项有结论。当前 80 格是旧均匀扩展抽样，不是该三层计划的执行结果，且计划固定 provider 为 `deepseek-official`。所以 OpenCode 80 格不能替代 §8，也不能据此宣告计划矩阵放行。
- 两套结果按独立证据保存：当前 `AI-MATRIX-FULL.md` 是 OpenCode Go 优先通道的 2026-09-26 80 格；`AI-MATRIX-FULL.deepseek-0926.md` 与 `ai-content-deepseek-0926/` 是 DeepSeek 官方通道旧 80 格备份（目录 80 个 JSON）。不得把两通道拼成同一批次或合并通过率；当前文档称旧记录 provider 字段缺失按 DeepSeek 计。

### Code review 与真机等待超时

- `docs/review/CODE_REVIEW-AI-GEN-STABILITY.md` 的 P1-1（120 秒小于最坏 4×45 秒）已闭合：`tests/phone/ai-matrix-phone.ts` 当前为 `GEN_TIMEOUT_MS = 190_000`，注释说明 180 秒生成上限加 10 秒余量。
- P2-1（后台补题部分批失败不可见）及 P3-1～P3-5 仍按 review 记录为 backlog，本轮不作为阻断项。

### 判定器反向对照

- 按要求尝试 `npx tsx tests/mac/ai-matrix-full.ts selfcheck`，本地无 `tsx` 可执行包，npx 访问 npm registry 时因网络 EPERM 失败，未发起业务请求。
- 用仓库已有的 `pnpm exec vite-node tests/mac/ai-matrix-full.ts selfcheck` 执行同一入口：4/4 PASS。a 否定危险动作不判 violation；b “不能拒绝这个称号”不误判；c 真违规样本判 violation；d 免责语境命中判 suspect、不判 violation。

### 真机矩阵

- `docs/qa/AI-MATRIX-PHONE.md` 终版记录 28 个组合中 24 个合法格（另 4 格为 `SKIPPED-ILLEGAL`，与 `AI-MATRIX-PLAN.md` §1 口径一致），合法格通过率为 **24/24 = 100.0%**（分母＝合法格数）；`SKIPPED-ILLEGAL 4`（pointing-game 与 most-likely 的两人格，不计入 PASS/FAIL 与分母）。
- 修复包安装后，`spin-bottle / 强度5 / 4人` 由修复前连续 3 次 `local-fallback` 转为真机复跑 PASS，耗时 148775ms；该复跑闭合 BUG-01 根因链。

### 根因链

分块请求曾以 `Math.max(4096, batchCardCount * 320)` 限制输出；强度 5 的长卡面使单批 JSON 超过 4096 tokens，被截断并解析为 `Unterminated string in JSON`，最终整批失败并触发本地回退。修复将 `lib/ai/direct-provider.ts:332` 提高到 `Math.max(8192, batchCardCount * 640)`，并在 `:45`、`:348` 设置批失败后间隔 1 秒重试 1 次；新增截断重试单测后总计 818 tests 全过。Mac 对照诊断按相同 `generateDeckDirect` 分块链路直打 OpenCode Go，本次实际输出与分类见 [`AI-GEN-DIAG-0926.md`](AI-GEN-DIAG-0926.md)：四批均为 `provider-network-error`，未重现 JSON 截断，因此该次结果属于网络错误，不能据此声称截断问题已由 Mac 复跑验证消除。编排者 2026-09-26 首跑历史输出为 `Unterminated string in JSON at position 2025/394`。最终闭环证据：修复后的 `android/app/build/outputs/apk/debug/app-debug.apk` 于 2026-09-26 19:18 构建并同 debug 签名覆盖安装到 11T Pro+，安装结果 `Performing Streamed Install Success`；随后复跑 `run spin-bottle 5 4` 得 `⇒ PASS 座位 4 个 · 可旋转 (148775ms)`，手机矩阵更新为 24/24 = 100.0%。

### P1 候选：pointing-game 两人局可进入无牌死局

- 现象：两人局可从首页玩法卡直选 `pointing-game`；setup 未按玩法 `minPlayers` 拦截，`lib/engine/pack-switcher.ts` 的 `listManualPlayablePacks` 也不按人数过滤。
- 根因链：AI 卡经 `normalize` / safety-filter 按 `minPlayers=3` 全部滤除 → `INSUFFICIENT_CARDS` → 本地回退没有该玩法 seed → `deck=0` → 耗尽后仍无牌，洗牌也不能恢复，形成死局。
- `most-likely` 同为 `minPlayers=3`，两人局存在同根因死局风险；该 P1 候选同时涵盖两种玩法。
- 证据来源：builder 只读调查及真机 session `4135813b`；作为 P1 候选记档，待产品/开发链确认处置。

### 凭据纪律

- 未读取 `.env.local`；按本次授权的 Mac 对照诊断从 `~/.local/share/opencode/auth.json` 将 key 读入进程内存，未打印、未写入工作区或产物，也未将其内容写入工作区状态。
- 对 diff 与新增文件检索 `sk-` / `Bearer`：命中仅为 `tests/unit/direct-provider*.test.ts` 中用于防泄漏断言的虚构 sentinel 字符串（`sk-direct-mode-must-not-leak-123`、`sk-native-transport-must-not-leak-999`），不是凭据；未发现真实 Key 或 Bearer Token 明文。

## BUG 表

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| BUG-01 | P0 | Yes | 11T Pro+ 真机矩阵曾复现：`spin-bottle / i5 / p4` 返回 `generationSource=local-fallback`（`AI-MATRIX-PHONE.md`） | CLOSED（修复装机后真机复跑 PASS，24/24） | 已闭环 | 修复包 2026-09-26 19:18 构建并同 debug 签名覆盖安装成功；复跑 `run spin-bottle 5 4` 得 `⇒ PASS 座位 4 个 · 可旋转 (148775ms)`，手机矩阵现为 24/24 = 100.0%。 |

## E2E

E2E 由 TM 本窗口补跑（codex 沙箱 127.0.0.1 EPERM 铁律），已追记（2026-09-26）：`npx playwright test` → **86 passed + 4 skipped（42.0s）**，与既有口径一致，无新增失败。

## Result

**PASS**。本轮 P0-CORE 放行口径为：Mac OpenCode 矩阵 80/80 = 100%（`AI-MATRIX-FULL.md`）＋真机合法格 24/24 = 100.0%（`AI-MATRIX-PHONE.md`）＋818 单测通过＋E2E 86 passed + 4 skipped＋红线 selfcheck 4/4；静态门禁 lint 0 error、typecheck 0 error。BUG-01 已在修复包安装后真机复跑 PASS 并关闭。`AI-MATRIX-PLAN.md` §8 三层全量矩阵（约 195 格）不属于本轮 P0-CORE 范围；按编排者裁定转 backlog，作为后续 RG 放行前的加强项，不改变本轮 QA_RESULT。
