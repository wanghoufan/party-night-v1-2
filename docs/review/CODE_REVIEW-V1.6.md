
# CODE REVIEW

- Task: V1.6全量（终稿350入库＋陡坡＋不断游L1L2＋开关＋1.5.0）
- Commit: 工作区未提交改动（HEAD `b9c0a28` 之上，27 文件）
- Reviewer: code-reviewer（本窗口，`opencode/muse-spark-1.3-contributor-free`）
- Result: 过（PASS，无必须修项）

## P0 / P1 Findings

- 无。六项逐项通过：
  - (1)种子350：`BUILTIN_SEED_CARDS=350`，7类×50，id=`seed-<pack>-<type>-N`连续到50全局唯一；每类互动35/了解15/看戏0、4–5档35；红线词仅注释口径说明，卡面零命中；boundaryTags仅`phone-privacy/physical-contact/stranger-contact`；接触题说明含同意＋`不愿意可无惩罚跳过`。
  - (2)指数陡坡：`INTENSITY_WEIGHT={1:1,2:2,3:4,4:8,5:16}`，`pickWeightedCard`唯一抽法，超档过滤不变、缺档就近归一。
  - (3)L1/L2：请求类优先洗回、同类被挡才换类、真缺口才exhausted；`recycled`进链账；L2每类单次＋全局单例、`<3`触发、读provider＋secret、无Key/离线/异常静默、dedupe并堆＋toast；旧换类型语义作废正确。
  - (4)Toggle：span+input无label包裹、aria不动；ON品牌粉＋滑块内✓、OFF灰底＋描边；深浅主题覆盖；`BoundaryList`行改div＋`已避开`态。
  - (5)版本：三处同值`1.5.0`。
  - (6)测试同步：计数350/EXPECTED、陡坡前缀、refill/recycled、E2E fixture均已同步。
- 技术拍板：L1“宁可重复、请求类优先洗回”与V1.5旧语义冲突处以V1.6不断游为准。

## P2 / P3 Backlog Findings

- `docs/content/题库审查/`删除、`题库把关/`新增：仅文档搬家；收尾由neat-freak记映射。
