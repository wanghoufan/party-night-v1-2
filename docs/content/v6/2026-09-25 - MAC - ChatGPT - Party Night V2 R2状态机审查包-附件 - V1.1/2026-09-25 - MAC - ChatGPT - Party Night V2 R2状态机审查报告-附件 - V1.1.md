# Party Night V2｜R2 状态机 / Heat / Mutual Scheduler 独立审查报告

- 日期：2026-09-25
- R2 定义：依据 R1 报告中“R1 不替代的下一项审查”，本轮专查 **Relationship Engine 状态机死锁、Heat/Coverage 计数、Pair/Card Router 顺序、SYSTEM_MUTUAL_CHECK 调度与 5 档保障之间的运行时一致性**。
- 输入：Party Night V1.3 冻结基线 + schema 2.3 `runtimeRules` + Phase1 Constitution/SPEC/PLAN/TASKS。
- 本轮按前面已经给出的推荐口径进行 R2：
  - **D3=A**：默认 20 个完成轮；到点选择“结束 / 再玩5轮”。
  - **D4=A**：Relationship Pair 仅异性；无合法异性 Pair 时 Relationship Engine 降级关闭，neutral 玩法仍可用。
- 自动状态/边界断言：**31 / 31 PASS**。
- 最终判定：**R2 = PASS AFTER PATCH**。

---

## 1. R2真正检查什么

R1 证明“350张题与350条元数据静态一致”。

R2 检查的是：

> 这些规则真的跑起来后，会不会因为计数、跳过、临近结束、多个MATCH、暂离、切玩法或私密流程而卡死/互相覆盖。

原 Phase1 V1.1 Draft 大方向正确，但存在 **6 个 blocking P1 + 3 个 P2** 的实现歧义。以下修法已经收敛。

---

## 2. blocking P1

### P1-01｜Heat有两种模式，但生产路径没选定

冻结 runtimeRules 同时保留 `fixedRoundProgress` 与 `openEndedEffectiveCards`。

按 D3=A，生产行为固定为：

- `sessionCompletedRounds`：所有 completed 玩法轮次，用于20轮结算；
- `relationshipEffectiveCardCount`：仅 completed relationship-aware 卡，用于 Heat 和 mutual interval；
- skip/swap 两者都不增加；
- neutral/expansion completed 会占整局轮数，但不推进关系 Heat；
- Heat 基准固定20轮：
  - 0–3 → H1
  - 4–7 → H2
  - 8–12 → H3
  - 13+ → H4
- “再玩5轮”只延长 Session，不允许 Heat 回退。

### P1-02｜Pair Scope没有成为状态机前置条件

按 D4=A：

- Player 仅新增 `gender = male | female`；
- Relationship Pair = 两名 active 且异性的玩家；
- unequal gender 正常；
- 0个合法异性pair → `relationshipEngineStatus = inactive_no_eligible_pair`；
- 不跑 Coverage / Pair / Signal / Mutual / MATCH / 5档；
- neutral pack 仍可运行；
- 后续加入异性玩家后可从空 Relationship State/H1 开始。

### P1-03｜Coverage opportunity 的记录时点不明确

新增事件：

`CARD_PRESENTED`

只有卡片真正显示给目标玩家时才记录 offered opportunity。

因此：

- completed：offered + completed；
- skip：offered，但不completed；
- swap：已经展示则算offered，但不completed；
- 还没真正展示的候选卡不能计Coverage。

### P1-04｜Router原顺序会“先选Pair、后发现无合法卡”

原顺序把 `target/pair` 放在 metadata legality 前。

修正为：

```text
capability
→ session/specialFlow gate
→ intensity ceiling
→ Heat + metadata hard legality
→ derive legal target/pair/card pool
→ Pair Routing
→ pending guarantee arbitration
→ drawBands
→ select card + pair
→ CARD_PRESENTED
```

必须先证明当前有合法卡，才能选具体pair。

### P1-05｜第19轮互选可能产生无法兑现的5档保障

20轮固定局里，普通互选按9/14/19会在第19轮产生新MATCH，但只剩1轮，可能无法满足“后续2次合格Pair机会内至少一次5档”。

修正：

> 普通 mutual check 还必须满足：剩余 completed-round slot 足够容纳当前5档保障窗口。

maxIntensity=5、窗口=2时：

- 普通 mutual：9、14；
- 20轮到结算点；
- 若结束且满足条件 → final mutual；
- 若“再玩5轮” → target=25，再重新评估第三次 regular mutual。

### P1-06｜Final check 不能刚问完一轮又重复问

Final 不再无脑强弹，必须同时满足：

- Heat ≥ H3；
- Coverage Gate通过；
- 有合法异性pair；
- 距上次 mutual check ≥ `minimumEffectiveCardsBetweenRuns`。

刚做过普通互选则 final 视为已覆盖。

---

## 3. P2修订

### P2-01｜“2次合格Pair机会”精确定义

`qualifyingPairOpportunity`：

```text
pair被Router实际选为本轮target
AND 双方active
AND cooldown允许
AND maxIntensity=5
AND 至少存在一张合法5档卡
```

只有这种机会才减少 `eligiblePairOpportunitiesRemaining`。

第一机会可按70/30；第一机会未出5档，则第二个合格机会仍有合法5档时强制优先5档。

### P2-02｜多个Pending Guarantee的仲裁

顺序：

1. `matchedAt` 更早；
2. 同时则 least-recently-used pair；
3. cooldown始终有效；
4. temp-away pair冻结，不消耗窗口；
5. guarantee不能让同一pair连续霸屏。

### P2-03｜specialFlow必须互斥

```text
none
| mutual-check
| final-mutual-check
| one-off-mutual
| consent-intersection
```

一次只能一个。

优先级：

1. 当前卡自己的 consent/one-off；
2. card result / signals / cooldown / Heat；
3. session boundary；
4. SYSTEM_MUTUAL_CHECK；
5. 下一张普通卡。

specialFlow期间：

- PackSwitcher禁用；
- pause / refresh / crash → 清 partial private；
- end request → 先清 private，再决定 final 或结束；
- unilateral secret 永不持久化。

---

## 4. R2冻结后的每轮顺序

```text
NORMAL_ACTIVE
→ build hard-legal card pool
→ derive eligible target/pair pool
→ Pair Routing
→ drawBand
→ select card+pair
→ CARD_PRESENTED
→ record offered opportunity
→ COMPLETED / SKIPPED / SWAPPED
→ update counters
→ apply allowed signals
→ tick cooldown
→ HEAT_REEVALUATE
→ session boundary
→ special-flow scheduler
→ next round
```

---

## 5. 20轮节奏

纯 Relationship 局：

| 完成轮 | Heat | 行为 |
|---:|---|---|
| 1–4 | H1 | 破冰 |
| 5–8 | H2 | 了解 |
| 9 | H3 | 第一次 regular mutual eligible |
| 10–13 | H3 | signal / Pair收敛 |
| 14 | H4 | 第二次 regular mutual eligible |
| 15–19 | H4 | 暧昧 / MATCH推进 |
| 20 | H4 | 先问结束还是+5；结束时按条件final |

选择“再玩5轮”：

- 不做final；
- target变25；
- Heat保持H4；
- scheduler重新评估第三次regular mutual；
- 25轮再结算。

---

## 6. 自动验证

本轮共 **31 个**自动断言，全部 PASS，覆盖：

- Heat边界；
- 20轮9/14/final20；
- +5延长；
- neutral不误推进Heat；
- H2结束不硬弹互选；
- Coverage gate；
- 无异性Pair；
- Intensity<5；
- late mutual抑制；
- Heat不回退；
- CARD_PRESENTED；
- skip/swap计数；
- guarantee机会语义；
- multiple guarantee仲裁；
- temp-away；
- private cleanup；
- Router hard-legality顺序；
- 禁止旧selector fallback。

详细可重放结果：`2026-09-25 - MAC - ChatGPT - Party Night V2 R2状态机审查证据-附件 - V1.1.json`。

---

## 7. 最终判定

### 原 Phase1 V1.1 Draft

- P0：0
- blocking P1：6
- P2：3
- `REWORK_REQUIRED`

### 应用R2补丁后

- P0：0
- blocking P1：0
- 已知状态机死锁：0
- 自动断言：31/31 PASS
- **R2 = PASS**

R2不替代后续 Pair/Signal公平性、Private Flow隐私、MATCH/Consent UI与V1.6 Migration审查。
