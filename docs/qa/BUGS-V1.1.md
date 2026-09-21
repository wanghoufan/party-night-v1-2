# BUGS-V1.1（普通QA回归校验，不碰真机，不改代码）

| Bug ID | Priority | Stage P0 Blocking? | Repro | Status | Current Task | 备注（截图/日志一句） |
|---|---|---:|---|---|---|---|
| 无新增 | — | — | — | PASS | V1.1 回归 | lint干净/typecheck干净/unit 70文件437用例全过；E2E抽查3文件11用例全过 |

## 验证结果（2026-09-21）

- pnpm lint：PASS（eslint 无报错）
- pnpm typecheck：PASS（tsc --noEmit 干净）
- pnpm test：PASS（70 文件 / 437 用例全过）
- E2E pack-switching（tests/e2e/pack-switching.spec.ts）：3/3 PASS
- E2E rules-library（tests/e2e/rules-library.spec.ts）：5/5 PASS
- E2E spin-bottle（tests/e2e/spin-bottle.spec.ts）：3/3 PASS
- 安全专项复核：safety-redteam.test.ts + safe-content-rendering.test.tsx，27/27 PASS
- CODE_REVIEW-V1.1 结论：过（无 P0/P1），与本轮 QA 一致

## V1.2 Human Gate 12项逐项结论

1. 首页/组局/游戏包/设置结构熟悉度：过（settings/setup-regression、custom-pack-regression 在 437 集合内；CODE REVIEW 七查确认）
2. 新玩法自然融入：过（pack-switching E2E 3/3；MoreGamesSheet/四Tab回归通过）
3. 一场局切换不重设：过（pack-switching E2E：Session ID/config/尺度不变）
4. 尺度/关系/氛围全玩法继承：过（setup-regression + engine switchPack 保留 config，CODE REVIEW 确认）
5. 转瓶子→真心话/大冒险串联：过（spin-bottle E2E 3/3，固定RNG链入 truth/dare）
6. 规则库30秒看懂、不复杂化：过（rules-library E2E 5/5：3次点击达小姐牌、8条可导航、无开始游戏CTA、空状态不调AI）
7. 断网/刷新/AI失败可继续：过（offline-pack-switch、v1-1-recovery、session-current-pack-recovery、generation-fallback 均在通过集合）
8. 真机弱光好读好按：挂（PENDING / NOT VERIFIED — 本轮为普通QA，不碰真机，未实测；需真机QA补测）
9. 密钥无泄漏：过（无 apiKey/Authorization 进 sw；redaction/clear-secret/ai-secret-crypto 测试通过；CODE REVIEW FR-041 确认）
10. 旧Session/PWA安全恢复：过（pwa-schema-upgrade、pwa-cache-regression、migration幂等测试通过）
11. 恶意HTML/超长文本不执行不破UI：过（safe-content-rendering 27项内通过；全库无 dangerouslySetInnerHTML）
12. 高尺度 safety red-team 全拦截：过（safety-redteam.test.ts 通过）

总体：11/12 过，1 项（第8项真机）PENDING 待真机QA补测；无 P0 阻塞。

## 真机QA会话能力预检结果（每真机session正式用例前必填，PASS才进正式QA，否则停）

> 判据：`ok=true/exit 0/工具调用成功`但无状态或像素变化一律记 `FAIL_UNVERIFIED_ACTION`；禁跨模型/跨Runtime/跨session拼PASS。

- 日期/任务名：2026-09-21 / V1.1 普通QA回归（不碰真机）
- session ID：不适用
- 模型精确ID：不适用
- Runtime：不适用
- 原生CUA是否实际注入（确认是否真实存在 `mcp__cua_repl.js`，无结果如实记“未注入”，禁伪称已存在）：未注入（本轮不做真机）
- 可用工具精确名称：无（本轮仅 pnpm/playwright 本窗口执行）
- CLI备用入口是否存在（Bash→orca computer CLI）：未验证
- Orca Runtime（`orca status --json` 实时结果，禁沿用旧报告）：未验证
- 能力（`orca computer capabilities --json` 实时结果）：未验证
- 权限（`orca computer permissions --json` 实时结果）：未验证
- 读屏结果（事先指定可见文字，禁拿date/静态文件/命令输出冒充）：未执行
- 截图结果（真实截图核对目标窗口＋像素尺寸）：未执行
- 点击并恢复结果（只点无副作用控件如切换侧边栏，读动作后状态确认变化，刷新元素索引后恢复，窗口变化后重取状态禁复用旧索引）：未执行
- 输入并清除结果（专用测试框写 `QA-CUA-CANARY`，AX值＋像素/真实UI双验，清除残留禁按Enter）：未执行
- 滚动及可见位移结果（明确可滚动区域，必须观察到内容或像素位移，像素差为零记 `FAIL_UNVERIFIED_ACTION`）：未执行
- 界面恢复确认（无残留）：未执行
- 最终结论（枚举只许 `PASS / BLOCKED_TOOL_NOT_INJECTED / BLOCKED_ORCA_APPROVAL / BLOCKED_RUNTIME / BLOCKED_OS_PERMISSION / FAIL_UNVERIFIED_ACTION / NOT_VERIFIED`，禁 `FAIL_MODEL_ACTION`）：NOT_VERIFIED
- 原始错误摘要：本轮任务明确不碰真机，真机能力未启用
- 是否允许进入正式QA（全PASS才YES，否则NO即停）：NO（真机正式QA需另起真机session先过预检）

## Fix Attempt Fingerprint

- Task ID: V1.1-普通QA回归-2026-09-21
- Root Cause Hypothesis: 无（未发现新 bug）
- Approach: lint/typecheck/unit/E2E抽查 + Human Gate 12项核对
- Files Changed: 无（QA 不改代码；仅新增本文件）
- Verification: 见上“验证结果”
- Failure Reason: 无；第8项真机弱光因任务范围限制未验证
- Difference From Previous Attempt: —

> Attempt ID / Dispatch ID / Model-Backend 系字段 2.0 已废弃，不填（模型轨迹记账本）。
