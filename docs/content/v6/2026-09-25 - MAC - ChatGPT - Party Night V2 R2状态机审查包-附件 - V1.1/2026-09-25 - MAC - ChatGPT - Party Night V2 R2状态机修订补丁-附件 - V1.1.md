# Party Night V2｜R2 → Planner DRAFT.2 修订补丁

> Planner 可以直接合并，不需要再次派模型重新做 R2。  
> 本补丁只改 Phase1 规格，不修改生产代码，不改 350+40 题面。

## A. 决策输入

### D3 = A

- 默认20个 completed rounds；
- 到结算点先选“结束本局 / 再玩5轮”；
- +5只延长Session target，Heat不得回退；
- skip/swap不计completed round。

### D4 = A

- Player最小字段：`gender: male | female`；
- Relationship Pair只允许active opposite-sex pair；
- 不增加性取向/配对偏好；
- 0合法异性pair → `inactive_no_eligible_pair`，neutral仍可玩。

## B. SPEC修改

### B1 双计数器

```text
sessionCompletedRounds
relationshipEffectiveCardCount
```

- 任意completed玩法 → sessionCompletedRounds +1；
- completed relationship-aware → relationshipEffectiveCardCount +1；
- skip/swap → 两者都不加；
- neutral/expansion不推进relationshipEffectiveCardCount。

Heat：

```text
0–3  => H1
4–7  => H2
8–12 => H3
13+  => H4
```

Heat单调不下降。

### B2 增加 CARD_PRESENTED

Coverage offered 在卡真正显示时记录。

### B3 Router顺序

```text
capability
→ session/specialFlow gate
→ intensity ceiling
→ Heat + metadata hard legality
→ legal target/pair/card pool
→ Pair Routing
→ pending guarantee arbitration
→ drawBands
→ select
→ CARD_PRESENTED
```

### B4 Mutual Scheduler末段规则

普通mutual除SSOT条件外：

```text
remainingCompletedRoundSlots >= fiveGuaranteeWindow
```

20轮到点：

1. 先问结束 / +5；
2. +5 → 不final，target+=5，重新评估regular scheduler；
3. 结束 → final仅在H3+/Coverage/pair合法/距上次互选达到interval时执行；
4. final产生的新MATCH不建立本局5档guarantee。

### B5 5档Opportunity

```text
qualifyingPairOpportunity =
  pair selected
  AND both active
  AND cooldown allows
  AND maxIntensity=5
  AND legal intensity-5 card exists
```

只有它才扣remaining。

第一机会70/30；第一次没出5，第二机会仍合法时force-priority 5。

### B6 Multiple Guarantee

```text
matchedAt ASC
→ leastRecentlyUsedPair
→ cooldown
```

away期间冻结，不消耗。

### B7 specialFlow互斥

```text
none
mutual-check
final-mutual-check
one-off-mutual
consent-intersection
```

specialFlow active时禁PackSwitcher；pause/refresh/crash/end先清partial private。

## C. PLAN修改

统一运行顺序：

```text
ROUTE
→ CARD_PRESENTED
→ RESOLVE_CARD
→ APPLY_COUNTERS
→ APPLY_ALLOWED_SIGNALS
→ TICK_COOLDOWN
→ HEAT_REEVALUATE
→ SESSION_BOUNDARY
→ SPECIAL_SCHEDULER
→ ROUTE_NEXT
```

## D. TASKS补充

### T013

- 固定20轮Heat；
- neutral不推进relationship heat；
- +5不回退；
- skip/swap不涨completed。

### T014

- CARD_PRESENTED记offered；
- skip/swap只offered不completed；
- low participation不锁别人。

### T019

- binary gender opposite-sex pool；
- unequal gender；
- all-male/all-female降级；
- temp-away / return。

### T028

- 9/14 regular；
- 最后两轮不足兑现窗口时抑制regular；
- 20结束final；
- 20+5后重新评估第三次regular；
- final eligibility + recent-check suppression。

### T032

- qualifying opportunity定义；
- 第二次force-priority 5；
- multiple guarantee仲裁；
- away/cooldown/neutral不消耗；
- final-created MATCH不建本局guarantee。

### T050 E2E增加

- 2M2F 20轮；
- 3M2F；
- 4M1F；
- 全男/全女降级；
- 连续skip；
- neutral插入；
- mutual 9/14；
- end at20；
- +5；
- multiple MATCH；
- temp-away；
- refresh during private；
- end during private。

## E. Reviewer可直接引用

> R2 已完成。原Draft的状态机歧义已闭环：双计数器、固定20轮、异性Pair前置条件、CARD_PRESENTED、Router合法性顺序、末段mutual抑制、5档机会定义、multiple guarantee仲裁、specialFlow互斥。自动状态断言全部PASS，无需重新派模型执行R2。
