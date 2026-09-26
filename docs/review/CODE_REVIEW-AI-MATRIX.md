# CODE REVIEW

- Task: 复核①saveSecret 第三态 persistent-failed + 设置页三态文案 + 单测新例；②AI-MATRIX-FULL.md 口径与 ai-content JSON 自洽性抽查
- Commit: 工作区未提交变更（HEAD 为基线，抽查以工作区文件为准）
- Reviewer: code-reviewer
- Result: **过（PASS）**。P0=0，P1=0，P2 共 3 条（均不阻塞）。

## 复核① saveSecret 第三态（lib/storage/ai-provider-repository.ts + app/settings/ai/page.tsx + tests/unit/ai-provider-repository.test.ts）

### 类型改动是否破坏旧调用方

- 全仓搜索 `saveSecret` 调用点：仅 3 处——
  - `app/settings/ai/page.tsx:69`（唯一业务调用方）
  - `tests/unit/ai-provider-repository.test.ts:16`、`:32`（单测）
- 返回类型由二态扩为 `"persistent" | "session-only" | "persistent-failed"`（ai-provider-repository.ts:38），调用方 page.tsx:71-75 已用嵌套三元覆盖全部三态分支，无遗漏、无 default 静默吞掉第三态。**无旧调用方被破坏。**
- 全仓另搜 `session-only` / `persistent-failed` 关键字确认无其他 switch/比较逻辑依赖旧二态枚举。

### 降级语义是否正确

- `saveSecret(…, true)` 持久化路径任一环节失败（getDb / persistentCryptoKey / encryptSecret / db.put）统一进 catch（ai-provider-repository.ts:49-54）：退化为会话内存 `sessionSecrets.set` 并回报 `persistent-failed`，**不静默伪装成正常 session-only**，语义符合注释意图与 SPEC FR-054「不得明文持久化」底线。
- `getSecret`（:56-58）优先读会话内存，降级后 Key 本次会话仍可用，`hasSecret` 为真——测试 `:28-41` 完整断言：mode=persistent-failed、hasSecret=true、getSecret 返回原文、`aiSecrets` 无记录（无明文落盘）、clearSecret 后 hasSecret=false。**语义正确，测试覆盖到位。**
- 边界确认：失败路径下旧的持久化密文记录不会被删除，但会话密钥在 getSecret 中优先遮蔽它，`clearSecret`（:67-71）内存+DB 双清可彻底移除，不构成泄露或脏读路径。

## 复核② AI-MATRIX-FULL.md 口径与 ai-content JSON 自洽性（脚本全量 80 组 + 人工抽验片段）

### 脚本校验（docs/qa/ai-content/ 全部 80 个 JSON）

- 卡数=10：80/80 ✅；`packId` 与组玩法一致：0 串包 ✅；`intensity ≤ 组强度`：0 超标 ✅；`screen.pass` 全 true、严格红线命中 0 条 → 与总览「标红 0」一致 ✅。
- 疑似分布：5 个文件，命中条数 1/1/1/4/1，与矩阵 ⚠️ 行逐一对应——#6 truth-dare 3/6（×1）、#24 never-have 3/6（×1）、#60 spin-bottle 3/6（×1）、#66 pointing-game 5/6（×4）、#68 most-likely 1/2（×1），合计 8 条 = 疑似清单 8 条 ✅。

### 片段抽验（3 组 + 交叉验证）

- truth-dare 3/6 `td-ice-009`：instruction「故事必须积极有趣，不得包含危险、违法或冒犯内容」——命中前有禁止语，判「疑似」符合 §七否定护栏口径 ✅。
- never-have 3/6 `nh-006`：「表态即可，不要求展示聊天记录」——否定语境 ✅。
- spin-bottle 3/6 `spin-04`：「猜错的人可以指定下一轮转瓶方向，但不得强迫饮酒」——否定语境（对应记忆中的小句切分护栏，非裸正则误判）✅。
- 交叉验证 most-likely 1/2 `ml-03`（「不必真的展示手机」）与 pointing-game 5/6 `pn-003/pn-007/pn-009`（4 条疑似均在 JSON `screen.issues` 中）✅。
- 矩阵标 ⚠️ 的 5 组文件内 `screen.pass` 均为 true（疑似不计标红），与「该组通过＝无严格命中」口径自洽 ✅。

## P0 / P1 Findings

- 无。

## P2 / P3 Backlog Findings

- **P2｜文案截断**：`app/settings/ai/page.tsx:74` persistent-failed 文案「…请重试或联系」语义未完（联系谁？）。建议补全对象或删去「或联系」。
- **P2｜疑似清单缺维度列**：AI-MATRIX-FULL.md §五疑似清单无「氛围/关系/雷区」列，如「most-likely 1 2」有两格同参（#10/#68），无法从表内唯一定位到 `most-likely_强度1_2人_搞笑_刚认识_全关.json`，只能靠片段反查。建议补 3 列。
- **P3｜片段截断**：§五 #4 中 pn-009 摘录止于「问题不得涉及隐私或露骨内」，建议补全句尾。
