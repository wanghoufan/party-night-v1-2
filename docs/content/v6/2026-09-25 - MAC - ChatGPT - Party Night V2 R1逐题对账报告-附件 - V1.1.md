# Party Night V2｜R1 350张逐题对账报告

- 执行日期：2026-09-25
- 对账基线：Party Night V1.3 冻结基线
- R1 范围：`01–07` 七套主线 Markdown 共 350 张 ↔ `10-卡片元数据.json` 350 条
- 方法：逐题机器对账 + V1.3 冻结规则静态校验
- 结论：**R1 PASS，350/350，无异常项。**

## 1. 核心结果

| 校验项 | 结果 |
|---|---:|
| Markdown 主线题 | 350 |
| JSON cards | 350 |
| cardId 唯一 | 350/350 |
| MD ↔ JSON cardId 对应 | 350/350 |
| MD ↔ JSON 题面逐字一致 | 350/350 |
| MD ↔ JSON 档位一致 | 350/350 |
| gameType / number 一致 | 350/350 |
| 18 个逐卡必填字段完整 | 350/350 |
| schemaVersion=2.3 | 350/350 |
| heatMin/heatMax 硬边界 | 350/350 |
| 5档解锁条件 | 40/40 |
| 非5档误用 matchRequired | 0 |
| Shared / Crowd / Mutual 等信号位置异常 | 0 |
| 二选一 #41/#42/#50 错误沉淀 Compatibility | 0 |
| 默契 #41–49 错误继续沉淀 Compatibility | 0 |
| 身体/距离/拍照边界未要求双向同意 | 0 |
| 精确重复题面 | 0 |
| 冻结 SHA256 清单复核 | 18/18 PASS |

## 2. 七套题库档位分布实算

| 游戏 | 1档 | 2档 | 3档 | 4档 | 5档 | 合计 |
|---|---:|---:|---:|---:|---:|---:|
| 真心话 | 10 | 10 | 10 | 10 | 10 | 50 |
| 大冒险 | 8 | 10 | 12 | 10 | 10 | 50 |
| 谁最可能 | 8 | 10 | 16 | 16 | 0 | 50 |
| 我从来没有 | 8 | 10 | 12 | 19 | 1 | 50 |
| 二选一 | 8 | 10 | 12 | 12 | 8 | 50 |
| 指人游戏 | 8 | 10 | 16 | 15 | 1 | 50 |
| 默契测试 | 8 | 10 | 12 | 10 | 10 | 50 |
| **总计** | **58** | **70** | **90** | **92** | **40** | **350** |

与 V1.3 `00-总览.md` 声明分布一致。

## 3. 本次逐题检查了什么

每张卡均对照/检查：

`cardId / gameType / number / text / intensity / heatMin / heatMax / relationStage / targetMode / responseMode / interactionType / consentMode / matchRequired / boundaryTags / fallbackPolicy / signalEffects / postAction / schemaVersion`

并额外检查：

- 1档 `(H1,H2)`、2档 `(H2,H3)`、3档 `(H3,H4)`、4/5档 `(H4,H4)`；
- 5档必须为既有 MATCH pair，或该卡本身属于 `private-mutual-only` 双向确认入口；
- 非5档不得误用 `matchRequired=true`；
- Shared 只允许来自「我从来没有」1–3档；
- Crowd 只允许来自「谁最可能」4档 Pair Vote；
- `mutual-match` 只允许来自终局私密互选入口；
- `one-off-mutual` 不得创建持久 MATCH；
- 二选一 #41/#42/#50 不累积 Compatibility；
- 默契测试 #41–49 不再累积 Compatibility；
- 身体接触、靠近、可选拍照均必须有当前双向同意或私密双向交集机制；
- 真心话不得混入身体接触任务。

## 4. 异常清单

**0 项。**

因此无需生成返工卡，也无需再让 Planner 用模型逐行重跑 350 张。

## 5. R1 的边界

R1 证明的是：

> **题面与逐卡元数据已经一一对齐，而且冻结规则在静态数据层没有发现冲突。**

R1 **不替代**后续 R2–R5 对以下内容的审查：

- Relationship Engine 状态机是否会死锁；
- Heat / Pair Router 的运行时顺序是否正确；
- 私密传手机流程是否泄露单向选择；
- MATCH / 5档解锁 / Consent 是否在真实 UI 中正确落地；
- V1.6 legacy routing 删除与 migration 是否完整。

这些属于引擎设计/运行时审查，不是逐卡对账。

## 6. 给 Planner / Research Reviewer 的可直接引用结论

> **R1 = PASS。已对 V1.3 冻结基线执行 350/350 逐题机器对账：cardId、题面、档位、gameType、number、18项元数据字段、schema 2.3、Heat硬边界、5档解锁、Signal 与 Consent 关键约束全部通过；异常项 0。冻结清单 SHA256 18/18 通过。R1 无需再次派模型重跑，可直接进入 R2–R5。**

详细逐题证据见同批 CSV：
`2026-09-25 - MAC - ChatGPT - Party Night V2 R1逐题对账矩阵-附件 - V1.1.csv`
