# Party Night V2｜P0-01 生产旧350 ↔ V1.3 Frozen 350 双向审查报告

- 审计日期：2026-09-25
- 仓库：`wanghoufan/party-night-v1-2`
- 唯一代码/文档快照：`main@b08ceb84ff3ced97d6c694106f6be6f32cb0dfe1`
- 当前阶段：`PLAN`
- 本次业务代码修改：**0**
- P0-01 正式定义：**生产旧 `seed-*` 350 ↔ V1.3 Frozen `PN-*` 350 的逐卡双向差异矩阵、ID migration 结论与 conflict 处置**

## 结论

**P0-01 = PASS。**

这次不再把 R1“冻结 Markdown ↔ 冻结 JSON 350/350 一致”误当成生产迁移矩阵。本审计直接读取当前 commit 的生产 `lib/game-packs/built-in-seeds/index.ts`，并从冻结 ZIP 的精确 member 解压读取 schema 2.3 的 350 条 V1.3 元数据，完成真正的生产350↔V1.3双向覆盖。

机器结果：

- 生产旧卡：350
- V1.3 Frozen：350
- 7 类 × 50，两边计数完整，双向审计坐标 orphan = 0
- **同序号题面 normalized exact：0/350**
- **同玩法任意位置 exact：0/350**
- 字符 bigram Jaccard ≥0.55：**0/350**
- 全部 350 的最佳词面候选均 <0.55；最大仅 0.2857
- 同序号档位相同：96/350
- 同序号档位改变：254/350

因此：

> **不能把旧 `seed-*` 与新 `PN-*` 当成同一张卡换 ID。**

`gameType + ordinal` 在矩阵中只是为了保证 350↔350 都被审计到的“坐标”，**不是内容等价关系，也不是 migration map**。

## migration map 最终口径

1. 自动内容等价 ID 映射：**NONE**。
2. 旧 `seed-*` ID / 旧题面：只为历史 RoundHistory 展示保留。
3. 旧 `usedCardIds`：**不得按相同类别/序号翻译成 PN ID**。
4. 旧 active Session 已展示 current card：最多中性 complete/skip 一次，不生成 V2 Heat/Signal/Coverage/MATCH/5档计数。
5. 旧 future deck：升级后丢弃，不再驱动 relationship-aware 下一题。
6. 新回合：只从 V1.3 `PN-*` SSOT + V2 Router 产生。

这与当前 Product Plan / R5 的迁移方向一致。

## 关键 conflicts

- **C01｜内容全量重写**：350/350 无 exact/near≥0.55 等价，禁止自动内容映射。
- **C02｜ID namespace 全换**：`seed-* → PN-*`，不能靠 ordinal 当迁移关系。
- **C03｜档位重新分层**：254/350 同序号 intensity 已改变。
- **C04｜元数据模型升级**：旧生产 GameCard 不具备 V1.3 schema2.3 的关系路由元数据，不能承载 V2 语义。
- **C05｜active legacy current**：只能一次性 neutral 收尾。
- **C06｜旧 selector/future deck**：与 V2 动态 Router 互斥，Phase2 必须做不可达门禁。

完整 350×2 方向矩阵见 Excel。

## 同时发现的 Phase1 文档一致性问题

这些不是 P0-01 卡片矩阵本身的失败，但在 Human Gate 前建议一起收敛：

1. `PRODUCT_PLAN_V2.0-DRAFT.md` 目前把 P0-01 勾成“R1 Frozen 内部对账 PASS”；D2 却正确指出真正 P0-01 缺生产350↔V1.3矩阵。现在有了本审计，Planner 应把 P0-01 证据改指向本包，R1继续作为独立前置证据。
2. Product Plan 仍多处写 `D7/D8=TBD`，但 `HANDOFF` 与 `V2-R5-ssot-gate.md` 已记 Human `D7=A`、`D8=A+`。
3. R2 定义“任意 completed 玩法增加 `sessionCompletedRounds`”，而 R3/当前 Product Plan 又写 neutral/expansion 不消耗 20/25；D3 双计数器需统一。
4. R2 final mutual 有 recent-check suppression；R3/当前 Product Plan 又写 final 独立、总执行、不去重；scheduler 需统一。
5. Product Plan 仍显示 Readiness 71、blocking P1-01~04 open；R4/R5 复审已有契约层 PASS/关闭，需要重新收敛“Phase1 契约关闭”和“Phase2 实现验证”的状态。
6. 你截图里编排者说“只剩 D5 TBD”，但仓库文档仍写 `D1/D2/D5/D6` TBD。Human Gate 前必须把 D1/D2/D6 的真实拍板状态落盘，否则不能同时成立。

## 给编排者的下一步

> P0-01 外部机器审计已完成并 PASS。不要重跑 R1。让 Planner 读取本审查包：将真正的“生产350↔V1.3双向矩阵 + NONE 自动ID映射 + history-only迁移策略”并入 Product Plan，更新 P0-01 证据；同时先收敛 PlanConsistency 页的冲突，再做 Human Gate 汇报。当前仍是 PLAN，不启动 Builder。
