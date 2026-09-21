# RESEARCH_REVIEW（Phase1 专用；内部 role ID `product-reviewer` 不变）

- Plan Version（评的是哪版 PRODUCT_PLAN）：`PRODUCT_PLAN_V1.4`
- Review Round（第几轮）：V1.4 第 3 轮（仅复核第 2 轮 P1-01—P1-03 的补充契约是否闭合）
- Result：**PASS**。第 2 轮的 3 个 blocking P1 已定义为可唯一实现、可重复验收的契约；本轮仅复核这三项，不重审其他范围。
- P0 / P1 / P2：
  - P0：无。删除 `ai-improv`、不伪造历史、保留四 Tab 与 Local-first 的方向没有冲突。
  - P1：无 blocking P1。
    1. **P1-01 已闭合｜R-056 统一启用集合。** resolver 的输入、去重/退役剔除、稳定排序和按需人数/capability 过滤已锁定；无 active Session 读当前设置，active Session 的首页随机、switcher 与 mixed 自动候选统一读创建快照。设置只影响下一局，且同一 fixture 覆盖三条当前局路径与下一局生效断言。
    2. **P1-02 已闭合｜R-049 旧局回落。** resolver 输入明确为旧 Session、registry、preferences、custom packs；可用快照优先，坏损/缺失才按当前设置补齐并固化。回落顺序锁定为可玩 `truth-dare`、内置 registry 顺序、再 custom `createdAt`/`id` 升序；无候选或依赖不可读安全回首页，并有相同 fixture 的幂等/边界验收。
    3. **P1-03 已闭合｜R-060 `generationSource`。** 语义唯一为最终持久化 Deck 是否含任一 AI 卡：含则 `provider`，否则 `fallback`；custom 中性。完整/部分 Provider、阈值或请求失败、纯 seed/custom、零 AI 采用、background refill 及刷新恢复均已列入原子持久化与回归断言。
  - P2：
    1. Plan 声称 GAP-01—GAP-10 均已闭合，但指定材料中没有 GAP-01—GAP-10 的原始定义或上一轮评审件；只能按 V1.4 的十个主题簇复核，不能认证其与原缺口的一一映射。
    2. R-054/R-055 的“原子”建议落到明确的 IndexedDB read-modify-write transaction / 单一 repository command，并补充跨 Tab 用例；当前文字只描述“最新持久化状态”，实现边界仍可加强。
- Key Assumptions（逐条列＋是否成立）：
  - 首页删除的是三个快捷入口而非目标页/能力：**成立**；R-053、Out of Scope 与 DoD 一致，且保留四 Tab。
  - “随机玩一个”是动作入口而非伪造 Pack：**成立**；R-050、R-052 与 Technical Approach 一致。
  - `ai-improv` 的未完成数据删除、已完成历史保留：**成立**；Flow C、R-048/R-049 与 DoD 一致。
  - 最后一个玩法按内置与自定义合并集合校验：**成立**；R-054/R-055 使用当前设置集合，R-056 明确 active Session 使用创建快照，两种上下文不再混用。
  - `generationSource` 可由二值枚举准确表达最终 Deck：**成立**；其语义仅为最终 Deck 是否实际采用 AI 卡，混入 custom 或 seed 不产生第三种解释。
- Verified Facts（已验证事实＋证据）：
  - 当前代码仍注册并使用 `ai-improv`；`PRODUCT_PLAN_V1.4.md` 的退役范围与代码现状相符。证据：`lib/game-packs/registry.ts`、`lib/ai/generate-deck.ts`、`tests/unit/home-entries.test.ts`。
  - 当前 `buildPlayableDeck` 的成功路径会合并 AI、自定义和内置 seed 卡，故 P1-03 不是假设。证据：`lib/ai/generate-deck.ts` 中 `dedupeCards([...allowedAI, ...allowedCustom, ...seeds])`。
  - 当前 switcher 使用实时 `disabledPackIds`，而 Session 的自动出题依据 `config.enabledPackIds`；故 P1-01 是现存的双口径风险。证据：`lib/engine/pack-switcher.ts`、`lib/ai/generate-deck.ts`。
  - 当前迁移仅以 raw Session 及其 `config.enabledPackIds` 推导玩法，未接收 preferences/custom packs；故 P1-02 的输入契约必须在 Plan 固化。证据：`lib/storage/session-migration.ts`。
  - V1.1 封存基线明确要求四 Tab、单 Session 切换、Local-first、回退与安全迁移；V1.4 对这些不作反向改变。证据：V1.1 Constitution §§I–V、SPEC §§2–4、PLAN §§5–7、TASKS T187–T201。
- External Sources（Web Search / Web Fetch / 官方文档 / 官方 GitHub / 第三方 / 社区反馈，附链接）：无。本轮仅审查既有产品计划与仓库实现，不依赖外部可变事实。
- Competitor Findings（竞品现状＋对本 Plan 的启示）：无新增竞品结论；本轮变更是既有单设备、Local-first 产品的范围收敛，不应以未经验证的竞品判断扩大范围。
- Counter-evidence（反对证据＋成功的相反做法）：
  - 保留独立 AI 即兴包也可以扩大内容供给；但 V1.3 讨论稿已指出其与题卡玩法边界模糊，V1.4 以更低首页选择成本和安全迁移取舍，方向可接受。
  - 将所有结果简单标为 `provider` 也可实现最小埋点；但这会掩盖实际降级，无法满足 V1.4 的排障目标，因此不接受未定义混合路径的二值记录。
- Unverified Items（未验证项＋验证方法）：
  - GAP-01—GAP-10 的逐项原始口径：提供上一轮 `RESEARCH_REVIEW` 或缺口清单；以“原 GAP → R/DoD/测试”的映射表复核。
  - Redmi Note 11T Pro USB ADB 与 production 可达性：仅在 Release 阶段，以设备信息、production URL、截图/录屏与 build/commit 证据验证；不应提前宣称已验证。
- Required Fixes（Planner 必须改项，打回依据）：
  - 无。本轮限定复核的 P1-01—P1-03 均已闭合；GAP-01—GAP-10 原始口径的既有 P2 记录保留，不作为本轮阻塞项。
- Plan Readiness Score（分项打分＋合计，口径以 PRODUCT_PLAN.template.md 为准）：
  - 产品目标与用户需求（20）：20。范围收敛、目标用户及不变约束清楚。
  - 核心方案完整性（20）：20。三项关键跨流程契约均已锁定，并在流程、需求、技术方案、DoD 与追踪矩阵中一致。
  - 外部事实与竞品验证（20）：18。无新增外部依赖；但真机仅为未来验收项，不能计为既证事实。
  - 技术可行性（15）：15。resolver、迁移依赖和最终 Deck 来源纯判定均可沿用既有架构实现。
  - 风险与异常场景（10）：10。active Session 设置分叉、回落依赖缺失与 mixed/refill 来源均有明确处置和验收。
  - 开发范围与 DoD（10）：10。三项契约均有唯一规则与对应 fixture/断言。
  - 未决问题（5）：5。本轮范围内无 blocking P1；GAP 原始口径缺失仍为既有 P2，不影响本次 Human Gate。
  - 合计：**98 / 100**。
  - Gate（进 Human Review 条件）：**PASS**。Readiness 98 ≥ 90、P0=0、blocking P1=0；本轮限定复核的关键事实与核心假设已合理验证。
- Human-only Decisions（只需人类拍板项）：无新增产品方向决策。下一步仅需 Human Gate 确认本计划为开发基线。
- Next Action：（进 WAITING_HUMAN_APPROVAL 找人）TM 可将 `PLAN_GATE` 置为 `READY_FOR_HUMAN_REVIEW`，等待用户明确“第二阶段，开发”；在此之前不得修改业务代码。
