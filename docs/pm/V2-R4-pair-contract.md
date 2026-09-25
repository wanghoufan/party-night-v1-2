# V2 R4｜Player 与 Pair 数据契约

## 1. 决策基线

- 决策：`D4=A`，V2.0 默认只生成男女 Pair。
- 范围：只为当局参与者增加最小性别字段；不收集取向、偏好、身份说明或跨局关系历史。
- 禁止推断：不得通过姓名、座位、加入顺序、行为或模型推测字段值。
- 降级：当前 active 参与者中没有合法 Pair 时，整局进入普通玩法；不运行 Pair Routing、pair signal、`SYSTEM_MUTUAL_CHECK`、MATCH、MATCH 专属 5 档及 5 档保障。
- 边界：本文定义 R4 数据、异常态与单设备私密互选流程；不扩展手动加边或偏好配对。
- 人类决策保留：`D5（是否允许多 MATCH）=TBD`；本契约不代拍、不用实现默认值绕过。

## 2. Player 数据契约

### 2.1 分层与字段

`Player` 全局档案保持现有字段，不新增性别字段：

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | `string` | 必填；在当局内唯一、稳定 |
| `displayName` | `string` | 必填；仅用于展示，不参与 Pair 判定 |
| `active` | `boolean` | 必填；只有 `true` 可进入候选池 |
| `createdAt` | 现有时间类型 | 不参与 Pair 判定 |
| `lastUsedAt` | 现有时间类型 | 不参与 Pair 判定 |

V2.0 仅在 Session 快照投影中新增：

```ts
type PairGender = "male" | "female";

type SessionParticipant = {
  playerId: string;
  active: boolean;
  pairGender: PairGender | null;
};
```

| 字段 | 必填 | 语义 | 存储边界 |
|---|---|---|---|
| `playerId` | 是 | 引用稳定 `Player.id` | 随 Session 快照保存 |
| `active` | 是 | 当局是否参与路由 | 随 Session 快照保存 |
| `pairGender` | 是 | Host 为本局选择的“男/女”；`null` 表示未选或旧数据缺失 | 仅限当局；不回写 Player 档案，不进 analytics、AI、日志或导出 |

Session 结束时，`pairGender` 与 Relationship Graph、signal、MATCH 及私密临时态一并清理。

### 2.2 输入与校验

1. Host 只能为当局参与者选择 `male` 或 `female`；未选统一存为 `null`。
2. 反序列化仅接受 `"male" | "female" | null`；字段缺失或其他值规范化为 `null`，不报错退局，不自动修正为男或女。
3. `playerId` 必须指向当前 Session 中已存在的唯一 Player；重复、空值或悬空引用不得进入 pair pool。
4. Pair 资格谓词固定为：

```ts
eligiblePair(a, b) =
  a.active === true &&
  b.active === true &&
  a.playerId !== b.playerId &&
  a.pairGender !== null &&
  b.pairGender !== null &&
  a.pairGender !== b.pairGender;

pairKey(a, b) = [a.playerId, b.playerId].sort().join("::");
```

5. pair pool 是 `eligiblePair` 对所有 active participants 计算得到的无向、去重边集；以 `pairKey` 作为唯一键。
6. 自环、重复边、非 active 参与者、`pairGender=null` 或同值性别边一律拒绝；不提供手动加边绕过谓词。
7. 所有 Pair/MATCH/5 档专属入口在执行前必须再校验当前 `pairKey` 仍合法，避免使用编辑、暂离或退出前的旧边。

### 2.3 迁移契约

| 来源 | 迁移动作 | 迁移后行为 |
|---|---|---|
| 旧 Player 档案 | 不改 schema，不回填性别 | 创建 Session 投影时 `pairGender=null`，等待 Host 当局选择 |
| 旧 Session 缺失 `pairGender` | 读取时补 `null` | 若无合法 Pair，安全降级普通玩法 |
| Session 含非法枚举值 | 将该值规范化为 `null` | 不猜测、不尝试文字映射；重算 pair pool |
| 旧 Session 含关系边或 MATCH，但边不符合新谓词 | 删除失效边，废弃其 signal/MATCH/保障 | 不传递或复用到其他 Pair |
| 旧 Session 无可验证的 V2 关系状态 | V2 signal/MATCH 从空开始 | 不从旧轮次或历史行为补算 signal |

迁移必须可重入：对已规范化快照重复执行不改变结果，不新建 Pair、signal 或 MATCH。迁移不得因无合法 Pair 而阻止 Session 恢复。

## 3. Pair 模式派生态

pair pool 每次在以下时机重算：Session 启动关系主线前、Host 修改 `pairGender`、玩家 active/暂离/返回/退出状态变化时。

```ts
type PairMode = "ACTIVE" | "NO_ELIGIBLE_PAIR";

pairMode = eligiblePairCount > 0 ? "ACTIVE" : "NO_ELIGIBLE_PAIR";
```

- `ACTIVE`：只允许在当前 pair pool 的合法边内运行 Pair Routing、signal、mutual check、MATCH 与 MATCH 专属 5 档候选。
- `NO_ELIGIBLE_PAIR`：保留普通抽卡、全桌与中性玩法；关系主线的计时、候选、互选与保障不运行，不报错、不空转、不补边。
- 从 `NO_ELIGIBLE_PAIR` 恢复为 `ACTIVE` 时，新合法边的 signal、cooldown、MATCH 与 5 档保障均从空状态开始；不回放普通回合，不补算离席期机会。

## 4. Pair 异常态

### 4.1 无合法候选 `NO_ELIGIBLE_PAIR`

**进入条件**：`eligiblePairCount === 0`，包括人数不足、所有人未选、字段非法、合法边玩家均非 active，或仅存同性别 active 参与者。

**处理**：

- 立即设置 `pairMode=NO_ELIGIBLE_PAIR`，进入普通玩法。
- 停止 Pair Routing、pair signal、`SYSTEM_MUTUAL_CHECK`、MATCH、MATCH 专属 5 档及其保障的调度与消耗。
- 不发生无限重试，不为凑 Pair 修改字段或生成虚假边。
- 界面可使用中性提示“本局将使用普通玩法”，不公开任何人的字段值。

**退出条件**：Host 补齐/修正当局字段或参与者返回，重算后 `eligiblePairCount > 0`。

### 4.2 单目标性别 `SINGLE_TARGET_GENDER`

**定义**：当前 active 且 `pairGender != null` 的参与者只出现一种枚举值，即全为 `male` 或全为 `female`。这是 `NO_ELIGIBLE_PAIR` 的可解释原因，不是例外配对规则。

**处理**：

- 不创建同性别边，不把 `null` 猜成缺失性别，不要求系统代选。
- 按 `NO_ELIGIBLE_PAIR` 完整降级，因而不跑 MATCH 和 MATCH 专属 5 档。
- 若后续出现另一个目标性别的 active 参与者，重算 pool，合法新边从空关系态开始。

### 4.3 中途退出 `PLAYER_EXITED`

**进入条件**：玩家明确退出当局，而非暂时离席。

**原子处理顺序**：

1. 将该参与者设为非 active，使其立即不可被选中。
2. 删除所有含该 `playerId` 的 eligible 边并重算 pool。
3. 废弃这些边的 signal、cooldown 和 MATCH；相关 pending/paused 5 档保障进入终态 `expired`，`terminalReason="expired-player-exit"`。
4. 清除该玩家未消费的私密选择；不转移给其他玩家，不作为新 Pair 的 signal。
5. 如重算后无合法边，立即转入 `NO_ELIGIBLE_PAIR`；否则其余合法边按原状态继续。

退出是终止语义；同一人后续重新加入时，不恢复已废弃的边或 MATCH，按新参与者关系态处理。

### 4.4 暂离 `PLAYER_TEMPORARILY_AWAY`

**进入条件**：玩家保留本局席位与稳定 `playerId`，但暂时不参与路由。

**暂离时**：

- 从当前可调度 pool 排除所有含该玩家的边，但不删除边的已有 signal/MATCH。
- 暂停相关 cooldown 与 5 档保障；保障标记为 `paused`，`pauseReason="player-away"`，已累计的合格机会计数不清零。
- 离席期不视为合格 pair opportunity，不消耗保障窗口，不产生该玩家的 signal 或互选。
- 如排除后无其他合法边，调度层进入 `NO_ELIGIBLE_PAIR`，但被暂停边的关系态保留待恢复。

**返回时**：

- 根据稳定 `playerId` 和 `pairKey` 重算资格；仅恢复当前仍满足 `eligiblePair` 的边。
- cooldown 和 5 档保障从暂停点继续，不补算暂离期机会、不重置计数。
- 若暂离期间 `pairGender` 已被 Host 修改而使旧边失效，该边不恢复；其 MATCH/保障按 `expired-policy-change` 终止，新合法边从空状态开始。

## 5. Private Handoff 状态机

### 5.1 流程态与界面契约

每次 mutual run 使用唯一 `mutualRunId`；每位参与者只能按以下单向状态链前进：

```text
HANDOFF_TO_X → IDENTITY_CONFIRM → READY → PRIVATE_SELECT
             → SUBMIT → MASKED_CONFIRM → HANDOFF_NEXT
```

| 状态 | 可见内容与固定 UI 文案 | 允许动作 | 私密数据约束 |
|---|---|---|---|
| `HANDOFF_TO_X` | 遮罩全屏：“请把手机交给 {displayName}” | `已交给 TA` | 不渲染选项、上一人身份或答案 |
| `IDENTITY_CONFIRM` | 遮罩全屏：“你是 {displayName} 吗？” | `是，继续` / `不是，交还主持人` | 确认前不创建 draft，不显示私密题面 |
| `READY` | “准备好后再点开，请不要让其他人看屏幕” | `我准备好了` / `跳过` | 题面和选项仍被遮罩 |
| `PRIVATE_SELECT` | 只显示当前人的题面与选项 | `选择` / `提交` / `跳过` | draft 只存当前视图内存；离开本状态必须清空 |
| `SUBMIT` | “已提交”（不回显答案） | 无，系统立即清理并转遮罩 | 将规范化结果写入仅本 run 可读的封闭计算缓冲区后，立即销毁 draft、选中态、视图节点与可回放快照；缓冲区不得被 UI 查询或回显 |
| `MASKED_CONFIRM` | 遮罩全屏：“答案已隐藏。请确认旁人看不到后再交接” | `已遮好` | 不得含答案、选项位置、目标人或是否选中的线索 |
| `HANDOFF_NEXT` | 遮罩全屏：“请把手机交给下一位”；若已无下一位：“请把手机交还主持人” | `继续` | 只可新建下一人的空白视图，不得复用上一人组件实例 |

`SUBMIT` 到 `MASKED_CONFIRM` 是不可观察的原子转换：提交按钮触发后先清除当前人的视图与 draft 内存，再允许任何后续交互。每一位下家必须从 `HANDOFF_TO_X`、`IDENTITY_CONFIRM` 和 `READY` 重新起步；不得直达选择页。

### 5.2 回退、超时、跳过与中断

- **回退**：状态链不提供上一步；浏览器/系统回退、手势回退和历史恢复均只能回到当前遮罩，不能重建任何已提交、已跳过或已中断的视图。
- **超时**：`HANDOFF_TO_X / IDENTITY_CONFIRM / READY` 超时时保持遮罩，显示“还没准备好，可继续等待或跳过本位”；`PRIVATE_SELECT` 超时时先清 draft，再显示“本次已隐藏，可重新开始或跳过本位”。超时本身不视为提交，不产生选择结果。
- **跳过本位**：在 `READY / PRIVATE_SELECT` 跳过时立即清除该人 draft，直达 `MASKED_CONFIRM → HANDOFF_NEXT`；对公只呈现与正常交接相同的遮罩，不公开跳过者。
- **身份不符**：“不是，交还主持人”会清理未创建或已存的当前 draft，回到通用遮罩；UI 只显示“请交还主持人”，不显示任何人是否参与或已提交。
- **中断整次 mutual**：Host 选择取消、暂停、切包、结束 Session，或资格变化使本 run 不再可运行时，转 `CANCELLED`，执行§6 清理；UI 统一为“本轮私密互动已结束，继续游戏”。

## 6. Partial secret 生命周期

### 6.1 存储边界与幂等清理

- secret 包括未提交 draft、已提交的单向选择、被拒绝/未配对的一侧选项及可推断其存在的视图快照。secret 只能存在当前 mutual controller 的内存，不进 Session 快照、IndexedDB/localStorage/sessionStorage、cache、URL/历史状态、日志、analytics、AI 上下文或导出。
- 每次清理使用非私密幂等键 `secretCleanupKey = sessionId + "::" + mutualRunId + "::" + terminalReason`。同一键可重复执行：清空当前 draft、封闭计算缓冲区、可回放视图/历史和计时器，最终状态保持不变；不得因重复清理重建 secret 或再次公布结果。
- 幂等键和终态原因可作为无答案的运行元数据；不得包含 `playerId`、`pairKey`、选择值、提交人数或跳过人数。若事件重放时找不到 secret，按已清理成功处理。

### 6.2 全生命周期清理矩阵

| 事件 | mutual run 终态 / `terminalReason` | 必须的原子清理 | 恢复与公开行为 |
|---|---|---|---|
| 页面刷新/重载 | `CANCELLED / refresh` | 销毁未提交 draft、已提交单向缓冲、视图快照和计时器 | 恢复后只显示通用遮罩；不恢复 mutual，不提示谁已提交 |
| 崩溃/进程被杀后恢复 | `CANCELLED / crash-recovery` | 新进程不读取任何 secret；对残留 run 元数据重放幂等清理 | 从无 secret 的 Session 快照恢复；不恢复、不补算、不公布该 run |
| 切包或 Session 暂停 | `CANCELLED / session-paused` | 清空该 run 全部 partial secret 与 UI 历史 | 返回后如再次 due，必须用新 `mutualRunId` 重开；不续接旧 run |
| Session 结束 | `CANCELLED / session-ended` | 清空所有 run 的 secret，并与§2.1 当局关系态一并清理 | 不得跨局恢复、导出或用于下局推断 |
| mutual 中途取消（Host 取消、超时终止、资格失效） | `CANCELLED / mutual-cancelled` | 清空未提交和已提交单向数据、选中态、缓冲与视图快照 | 只显示通用结束文案，不产生 MATCH、signal 或缺席名单 |
| mutual final（所有人完成或流程正常收束） | `FINALIZED / mutual-final` | 在内存中一次性计算“双向共同结果”；先生成允许公开的结果集，再清空所有原始单向数据、拒绝侧、draft、缓冲与视图快照 | 只可公布共同结果；若无共同结果，仅显示“本轮已完成，继续游戏”，不公开原因 |

## 7. Mutual 可用性与非公开规则

### 7.1 Due 与可运行判定

R4 不改写上游的 mutual interval；只有上游调度产生 `SYSTEM_MUTUAL_CHECK_DUE` 时才称为 `due=true`。未 due 时必须静默跳过，不创建 `mutualRunId`、不提示 Host，也不消耗或推进 interval。

due 后、开始 `HANDOFF_TO_X` 前必须在同一个原子读取中满足：

```ts
mutualRunnable =
  pairMode === "ACTIVE" &&
  eligiblePairCount > 0 &&
  mutualCandidateCount >= 2 &&
  everyCandidateIsActiveAndPresent === true &&
  noPrivateFlowIsRunning === true &&
  sessionStatus === "RUNNING";
```

`mutualCandidateCount` 只计入当下至少属于一条合法 eligible 边、active 且未暂离的参与者。资格在每次 `HANDOFF_TO_X` 前再校验；不满足时不得强行开始或继续。

| 判定 | 处理 | Host / 公屏文案 | interval 语义 |
|---|---|---|---|
| `due=false` | 静默跳过 | 无 | 不消耗、不推进 |
| `due=true` 且结构性不可用（`NO_ELIGIBLE_PAIR`、合法候选少于 2） | 不创建 run，静默跳过 | 无；仍按§4 的普通玩法中性提示 | 本次不是合格 mutual opportunity，不消耗、不推进 |
| `due=true` 且暂时不可用（Session 暂停、有其他私密流程、候选人刚暂离） | 不创建 run，本机会终止 | “本轮暂不进行私密互动，继续游戏” | 不补跑、不立即重试；是否再次 due 仍由上游 interval 决定 |
| `due=true` 且 `mutualRunnable=true` | 创建新 run，进入 `HANDOFF_TO_X` | 按§5 文案 | 只在 run 进入 `FINALIZED` 后记为本次 mutual 已完成；取消不伪装成完成 |

one-off mutual 的计算结果与 MATCH 主线隔离：不写入 pair signal，不推进 mutual interval，不创建 MATCH，不触发或消耗 MATCH 专属 5 档保障。

### 7.2 显式非公开规则

1. 唯一可公开的私密互选信息是 mutual final 计算出的“双向共同结果”；公开的结果数量与后续 MATCH 处理仍受 `D5=TBD` 约束，本文不决定单 MATCH 或多 MATCH。
2. 不得公开、点名、列表或通过人数/顺序/进度间接暴露：未参与者、未提交者、跳过者、超时者、取消者、单向选择及单向落选者。
3. 不得公开“有人没选”、“有人选了但没被选”、提交计数、完成率或缺席原因；Host 与旁观者看到的交接页不得显示个人完成标记。
4. 无共同结果、不可运行、中断或恢复时只使用本文冻结的中性文案；各人都必须无法从文案、时序、按钮状态或后续卡牌推断某人是否参与、提交或选了谁。

## 8. 必须满足的不变式

1. 任何可调度 Pair 在调度当下都满足 `eligiblePair`。
2. `eligiblePairCount=0` 时，Pair/MATCH/MATCH 专属 5 档的下一步候选数必须为 `0`。
3. `pairGender` 缺失或非法永远只能得到 `null`，不能得到推测值。
4. 退出使关系边终止；暂离使关系边暂停，两者不得共用恢复语义。
5. Host 修改 `pairGender` 后先重算资格，再允许任何新的 Pair/MATCH/5 档专属动作。
6. 普通玩法回合、暂离期和迁移过程都不得倒推、补算或伪造 pair signal。
7. 上一人离开 `PRIVATE_SELECT` 后，其 draft、选中态、视图和可回放快照必须为空；下一人身份确认前必须处于遮罩。
8. 刷新、崩溃恢复、暂停、结束、mutual 取消和 final 后均不存在可恢复的 partial secret；重复清理不产生新状态。
9. 不可运行的 mutual 不得强制开始，也不得通过提示暴露具体缺席者或失效资格。
10. 除双向共同结果外，任何人都不能从公开 UI、日志、导出或恢复流程得知未参与、未提交或单向落选信息。
