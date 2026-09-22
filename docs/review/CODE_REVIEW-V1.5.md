
# CODE REVIEW

- Task: V1.5（双页视觉＋spin链＋segment重计＋顶栏＋题库脚本＋返工3项）
- Commit: 工作区未提交改动（HEAD `8b6809c` 之上，V1.5实现＋返工）
- Reviewer: code-reviewer（本窗口，`opencode/muse-spark-1.3-contributor-free`）
- Result: 有条件过 —— P0 无阻塞，2 项 P1 必须修（均小改，修完直进 QA）

## P0 / P1 Findings

### 1. 双页视觉 —— PASS（附 1 条 P2，已在 P1 收尾补映射）
- bottle 新图标：`Icon` 新增 `bottle` 路径、`pack-icon.ts` 映射（含后补的 `point`）、`SpinBottleView` 引用一致。
- 指人倒计时 5.4rem→2.9rem 小徽章＋stage 固定高度＋paused 冻结 tick。
- 座位 `seatRing()` 对称（≤8人同径／9–12／>12 dense）＋舞台高度跟 `--seat-radius`＋`aria-current` 光环替代旧 ▲。
- 按钮：各玩法 controls 4.4rem→3rem，spin choices 3.4rem＋再转一次全宽。

### 2. spin 链 —— PASS
- `enter/replace/resolve/returnToBottle` 命令分离；`PackTransitionCause` 四态透传；participant 快照离场不换人；完成自动回瓶子；仅 completed 递增（swap 复用、skipped 不递增）；非法跃迁抛错＋幂等。单测覆盖。

### 3. segment 重计 —— PASS（P1-①已闭）
- 仅 manual-switch 开新段；rounds 审计不清零＋迁移补字段；usedCard 逻辑隔离（truth 耗尽切 dare、双耗尽回瓶子 `exhausted`）。
- P1-①：生产侧 `switchPack` 直接调用仅 `pack-switcher.ts:79`＋`spin-chain.ts:133`，均显式 cause；`page.tsx:59` 已显式补 `manual-switch`（supervisor 打回返工，语义不变）。

### 4. 顶栏 —— PASS
- 左暂停/继续（`aria-pressed`＋48px）、中段内轮次＋齿轮、右结束＋Modal 二次确认；禁用矩阵＋`paused-banner role=status`；暂停时改强度/人属配置仍可用，结束不受暂停限制，均合理。

### 5. 题库脚本 —— PASS（P1-②已闭）
- `scripts/export-builtin-question-bank.ts` 单真源＋`EXPECTED_CARD_TOTAL=180`；`export:questions` 已跑，7 文件 180 卡幂等（两次 sha256 一致，见 QA 证据）。

### 6. 返工 3 项 —— PASS
- 单尺度断言改 SCALE_WORDS；spin-chain 去默认值消告警；`export:questions` 落盘。

## P2 / P3 Backlog Findings

- P2：`SpinBottleView` 初态 `restored` 取自首次 render 闭包（`recoverSpinChain`＋key 兜底，当前可用）。
- P3：`replaceInSpinChain(session, _customPacks, …)` 参数仅为同形保留，已注释。
