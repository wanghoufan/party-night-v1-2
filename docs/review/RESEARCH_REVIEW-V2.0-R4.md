# RESEARCH_REVIEW-V2.0-R4｜Private Choice / Privacy 专项

- Plan Version（评的是哪版 PRODUCT_PLAN）：`PRODUCT_PLAN_V2.0-DRAFT.2`
- Review Round（第几轮）：`R4 Private Choice / Privacy 专项（第1轮）`
- Result：`FAIL＋单向秘密仅内存原则成立，但传递遮罩流程与清理生命周期无可执行契约，阻塞。`
- P0 / P1 / P2：
  - P0：无新增；本专项不关闭 P0-01～P0-04。
  - P1：`blocking P1-03（私密数据生命周期）仍为 OPEN，本专项确认阻塞`；P1-04（单 Router 与迁移原子性）不受本专项直接影响。
  - P2：无。
- Key Assumptions（逐条列＋是否成立）：
  - 单设备逐人传手机在 4～5 人酒吧场景可接受——`未成立（待真人节奏测试，Plan Key Assumptions §3 亦承认未验证）`。
  - Host 能完成当局 `pairGender` 录入——`成立（有条件，R4 契约 §2 已定义 null 降级，但与私密流程衔接未定义）`。
  - 仅内存即可保证不泄露——`不成立（内存原则必要但不充分，缺传递间清理、遮罩、防窥视口径）`。
- Verified Facts（已验证事实＋证据）：
  - `unilateral choice 不持久化`原则已写入 Plan：Scope E.3「单向答案不持久化、不日志、不上传」；Data/API「禁止持久化」含单向秘密选择、未提交答案、partial consent、被拒绝一侧选项、player→target 原始边；R3 补充冻结 `CONSENT_*` 不计且 partial 只留内存；Technical Approach §7 Private Flow Controller 仅内存——`证据：PRODUCT_PLAN_V2.0-DRAFT.md Scope E / Data 禁止持久化 / R3 补充冻结 / Technical Approach §7`。
  - `one-off mutual 不建 MATCH`已写入 Plan：Scope E.6 `PN-MOST-050` 只允许一次最高 4 档安全 pair 加赛，不创建 MATCH、不进 5 档；R3 `SYSTEM_MUTUAL_CHECK_*` 不计、不进 used、不直接推进 Heat——`证据：同上 E.6 / R3 §一 / §五`。
  - R4 退出/暂离对「未消费私密选择」有处置：退出清除未消费私密选择且不转移（R4 §4.3-4）；暂离期不产生该玩家 signal 或互选（R4 §4.4）——`证据：V2-R4-pair-contract.md §4.3 / §4.4`。
  - R4 契约范围明确只定义数据与异常态，不扩展手动加边或偏好配对——`证据：V2-R4-pair-contract.md §1 边界`。
- External Sources（Web Search / Web Fetch / 官方文档 / 官方 GitHub / 第三方 / 社区反馈，附链接）：
  - `无（本次按任务约束禁止联网与读指定外文件，未做外部验证）`。
- Competitor Findings（竞品现状＋对本 Plan 的启示）：
  - `未验证（同上约束；Plan Competitor §4 亦承认缺少本轮独立竞品桌面研究与真人局数据）`。
- Counter-evidence（反对证据＋成功的相反做法）：
  - 无外部反证；内部缺口即反证：内存原则若无「人手间清理＋遮罩＋身份确认」可执行定义，单设备传递仍可被肩窥/误触/回退键泄露。
- Unverified Items（未验证项＋验证方法）：
  - 传手机真人节奏/耗时/尴尬与泄露观察——真机弱光 4 人局＋5 人局各一轮（Phase 2 DoD §9）。
  - persistence denylist 落地（IndexedDB/log/export/cache/analytics/AI）——代码级 allowlist/denylist＋refresh/crash/log/export/cache 测试（blocking P1-03）。

## 逐条审查（PASS / FAIL）

| # | 审查项 | 结论 | 依据与缺口 |
|---|---|---|---|
| R4-01 | 单手机依次传递不泄露上家答案 | `FAIL` | Plan User Flow §5 只写「逐人传手机、确认身份、私密选择、提交遮罩」，R4 契约无传递间隔离定义；缺：上家提交后内存/视图是否立即清除、下家接手前是否强制遮罩、回退/预览是否可看到上家答案。 |
| R4-02 | 交给 XX→准备→私密选择→提交→遮罩流程 | `FAIL` | 无可执行状态机：无「handoff 身份确认→准备→选择→提交→遮罩确认→交接」步骤定义、无超时/跳过/中断分支、无 UI 文案 Bliss；R4 §1 明确只定义数据与异常态，不含此流程。阻塞。 |
| R4-03 | unilateral choice 只驻内存 | `PASS（原则成立，落地待 P1-03）` | Scope E.3＋禁止持久化＋R3 补充冻结＋Tech §7 一致成立；但持久化 allowlist/denylist 与日志/export/cache/analytics 全覆盖仍是 blocking P1-03 OPEN，不可视为已可实现。 |
| R4-04 | 刷新/崩溃/暂停/结束清 partial secret | `FAIL` | 仅 Tech §7 一句「刷新即作废 partial」；缺崩溃恢复、切包暂停、Session 暂停/结束、mutual 中途取消/final 时的 partial 清理清单与幂等键；R4 §4.3/§4.4 只覆盖退出/暂离，不覆盖刷新/崩溃/暂停/结束全矩阵。阻塞。 |
| R4-05 | 暂无完整可用性的显式兜底（无合法互选条件时不强行跑流程） | `FAIL` | Plan 有 `NO_ELIGIBLE_PAIR` 降级（R4 §3/§4.1）但只管 Pair 合法性，不管互选可用性：缺「人数/资格变化导致 mutual 不可运行时是否 due、是否提示、是否静默跳过」的可用性判定；与 R4-02 中断分支缺口同源。阻塞。 |
| R4-06 | 不公开谁没选/谁没交/单向结果 | `FAIL` | Plan 只写「只公布 A↔B 共同结果；单向结果计算后立即清除」（User Flow §6），无「不公开未参与者、未提交者、单向落选者」的显式禁止；R4 §4.1 中性提示只覆盖 pairGender，不覆盖互选缺席。需补显式规则，否则 Host/旁观者可从缺席推断。阻塞。 |
| R4-07 | one-off mutual 与 MATCH 隔离 | `PASS（原则成立，隔离措辞待补）` | E.6＋R3 系统事件不计/不进 used 已隔离「一次加赛不建 MATCH」；但缺一句显式「one-off 结果不得写入 pair signal、不得计入 mutual interval、不得触发 5 档保障」的隔离句，需 Planner 补一行。非阻塞。 |

- Required Fixes（Planner 必须改项，打回依据）：
  - 1. 补 `Private Handoff 状态机`：`HANDOFF_TO_X → IDENTITY_CONFIRM → READY → PRIVATE_SELECT → SUBMIT → MASKED_CONFIRM → HANDOFF_NEXT`，含跳过/超时/中断/回退禁用；每步定义内存清理点与遮罩要求（对应 R4-01/R4-02）。
  - 2. 补 `partial secret 生命周期矩阵`：刷新/崩溃恢复/切包暂停/Session 暂停/结束/mutual cancel/final 六列 × 清理动作，明确幂等键与「重放不得恢复 secret」（对应 R4-04，关闭 blocking P1-03 的一部分）。
  - 3. 补 `非公开规则`显式句：除 A↔B 共同 MATCH 外，不公开未提交者、未参与者、单向选择存在性；中性提示文案冻结（对应 R4-06）。
  - 4. 补互选可用性判定：何时 due、何时静默跳过、何时提示 Host，不强行跑不可用互选（对应 R4-05）。
  - 5. 补 one-off 隔离一句：one-off 结果不进 signal、不推进 mutual interval、不触发 5 档保障（对应 R4-07）。
- Plan Readiness Score（分项打分＋合计，口径以 PRODUCT_PLAN.template.md 为准）：
  - 本专项不重打全计划分；仅注：Plan 自评 `71/100`，Gate 要求 `≥90＋P0=0＋blocking P1=0`；blocking P1-03 因本专项 FAIL 继续 OPEN，不满足进 Human Gate。
- Human-only Decisions（只需人类拍板项）：
  - D5（单设备传手机例外＋是否允许多 MATCH）仍 `TBD`，本专项 FAIL 不替代人类拍板；遮罩可用性与多 MATCH 公平需真人局后定。
- Next Action：（回 Planner 修订 / 进 WAITING_HUMAN_APPROVAL 找人）：
  - `回 Planner 修订`：按 Required Fixes 1–5 补齐后重提 R4 复审；不进 WAITING_HUMAN_APPROVAL。

## R4 结论（一句）

- `R4＝FAIL（阻塞）：单向秘密仅内存与 one-off 隔离原则成立，但传递遮罩状态机、partial 清理矩阵与非公开规则缺失，blocking P1-03 继续 OPEN，打回 Planner。`

## R4 修订复审（2026-09-25，第二轮，对 V2-R4-pair-contract.md 现行版）

- 复审基线：`V2-R4-pair-contract.md` §5/§6/§7/§8（本轮新增）＋ PLAN V2.0-DRAFT.2 原有原则。
- 方法：仅对照三份只读材料，未联网、未读其他文件。

### 逐条开闭（上一轮 Required Fixes 1–5 对应 R4-01～R4-07）

| # | 审查项 | 上轮 | 本轮 | 关闭依据 |
|---|---|---|---|---|
| R4-01 | 单手机依次传递不泄露上家答案 | FAIL | `CLOSED（PASS）` | §5.1 SUBMIT→MASKED_CONFIRM 原子转换（先清视图与 draft 再允许交互）；HANDOFF_NEXT 只建新空白视图不复用实例；§5.2 回退只能回当前遮罩；§8.7 不变式兜底。 |
| R4-02 | 交给 XX→准备→私密选择→提交→遮罩流程 | FAIL | `CLOSED（PASS）` | §5.1 七态链＋每态固定 UI 文案/允许动作/私密约束齐备，下家必须重走 HANDOFF/IDENTITY/READY；§5.2 回退/超时/跳过/身份不符/中断整轮分支齐备，中断转 CANCELLED。§1 边界已扩展含单设备私密互选流程。 |
| R4-03 | unilateral choice 只驻内存 | PASS（原则） | `CLOSED（PASS）` | 原则维持；§6.1 存储边界显式封堵 Session 快照/IndexedDB/localStorage/sessionStorage/cache/URL/历史/日志/analytics/AI/导出。落地代码验证仍归 blocking P1-03 按测试执行，不在本契约层阻塞。 |
| R4-04 | 刷新/崩溃/暂停/结束清 partial secret | FAIL | `CLOSED（PASS）` | §6.1 secret 定义＋幂等键 `sessionId::mutualRunId::terminalReason`（可重放、不重建、无私密字段）；§6.2 六行全矩阵：refresh/crash-recovery/session-paused/session-ended/mutual-cancelled/mutual-final，原子清理＋恢复/公开行为；§8.8 不变式兜底。 |
| R4-05 | 无合法互选条件时不强行跑流程 | FAIL | `CLOSED（PASS）` | §7.1 Due 与 `mutualRunnable` 六条件原子判定；四行处置表（due=false 静默/结构性不可用静默/暂时不可用中性文案终止/可运行才建 run）；仅 FINALIZED 记完成，取消不伪装完成；§8.9 不变式兜底。 |
| R4-06 | 不公开谁没选/谁没交/单向结果 | FAIL | `CLOSED（PASS）` | §7.2 显式四条：仅双向共同结果可公开；禁公开/点名/间接暴露未参与/未提交/跳过/超时/取消/单向选择与落选；禁提交计数/完成率；中性文案冻结，无法从时序/按钮/后续卡牌推断；§8.10 不变式兜底。§4.1 中性提示仅普通玩法降级，不泄露互选缺席。 |
| R4-07 | one-off mutual 与 MATCH 隔离 | PASS（待补句） | `CLOSED（PASS）` | §7.1 末句已补：不写 signal、不推进 interval、不建 MATCH、不触发/消耗 5 档保障。§7.2.1 明确公开数量仍受 `D5=TBD` 约束，未绕过人类拍板。 |

### R4 总结论（一句）

- `R4＝PASS：遮罩状态机、清理矩阵、可用性判定、非公开规则与 one-off 隔离句已全部落入契约§5–§8及不变式，不绕 D5=TBD，可以关闭本专项。`
