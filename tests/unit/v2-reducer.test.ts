import { describe, expect, it } from "vitest";
import { createInitialRelationshipState } from "@/lib/v2-relationship/v2-state";
import type { RelationshipState } from "@/lib/v2-relationship/v2-state";
import { reduceRelationshipEvent } from "@/lib/v2-relationship/v2-reducer";
import type { RelationshipEvent } from "@/lib/v2-relationship/v2-reducer";

const init = () => createInitialRelationshipState();

const stateWith = (overrides: Partial<RelationshipState>): RelationshipState => ({
  ...createInitialRelationshipState(),
  ...overrides,
});

const ev = (partial: Omit<RelationshipEvent, "eventId"> & { eventId?: string }, n: number): RelationshipEvent => ({
  eventId: `ev-${n}`,
  ...partial,
});

describe("reduceRelationshipEvent｜REL / NEUTRAL / EXPANSION / LEGACY / SYSTEM / 重放", () => {
  it("REL_CARD_COMPLETED：推进 effective 计数＋轮次＋Heat＋终态", () => {
    let s = init();
    const four: RelationshipEvent[] = [1, 2, 3, 4].map((n) =>
      ev({ ref: `rel-${n}`, cardId: `c${n}`, type: "REL_CARD_COMPLETED" }, n),
    );
    for (const e of four) ({ state: s } = reduceRelationshipEvent(s, e));
    expect(s.relationshipEffectiveCardCount).toBe(4);
    expect(s.sessionCompletedRounds).toBe(4);
    expect(s.heat).toBe("H2");
    expect(s.usedCardIds).toEqual(["c1", "c2", "c3", "c4"]);
    expect(s.terminalExclusivity["rel-1"]).toBe("completed");
    expect(s.terminalExclusivity["rel-4"]).toBe("completed");
  });

  it("REL_CARD_SKIPPED：只记终态，不计数，cardId 进 used", () => {
    const s = reduceRelationshipEvent(
      init(),
      ev({ ref: "rel-x", cardId: "cx", type: "REL_CARD_SKIPPED" }, 1),
    ).state;
    expect(s.relationshipEffectiveCardCount).toBe(0);
    expect(s.sessionCompletedRounds).toBe(0);
    expect(s.terminalExclusivity["rel-x"]).toBe("skipped");
    expect(s.usedCardIds).toEqual(["cx"]);
  });

  it("REL_CARD_SWAPPED：只记终态，不计数，cardId 进 used", () => {
    const s = reduceRelationshipEvent(
      init(),
      ev({ ref: "rel-y", cardId: "cy", type: "REL_CARD_SWAPPED" }, 1),
    ).state;
    expect(s.terminalExclusivity["rel-y"]).toBe("swapped");
    expect(s.relationshipEffectiveCardCount).toBe(0);
    expect(s.usedCardIds).toEqual(["cy"]);
  });

  it("NEUTRAL_CARD_COMPLETED：消耗轮次不推进 effective", () => {
    let s = init();
    ({ state: s } = reduceRelationshipEvent(s, ev({ ref: "n1", type: "NEUTRAL_CARD_COMPLETED" }, 1)));
    expect(s.sessionCompletedRounds).toBe(1);
    expect(s.relationshipEffectiveCardCount).toBe(0);
    expect(s.heat).toBe("H1");
  });

  it("NEUTRAL_CARD_SKIPPED_OR_SWAPPED：组合事件按 terminal 字段落终态", () => {
    const a = reduceRelationshipEvent(
      init(),
      ev({ ref: "n-a", type: "NEUTRAL_CARD_SKIPPED_OR_SWAPPED", terminal: "swapped" }, 1),
    ).state;
    const b = reduceRelationshipEvent(
      init(),
      ev({ ref: "n-b", type: "NEUTRAL_CARD_SKIPPED_OR_SWAPPED", terminal: "skipped" }, 2),
    ).state;
    expect(a.terminalExclusivity["n-a"]).toBe("swapped");
    expect(b.terminalExclusivity["n-b"]).toBe("skipped");
  });

  it("EXPANSION_CARD_COMPLETED：只消耗轮次，不激活 extension", () => {
    const { state: out, delta } = reduceRelationshipEvent(
      init(),
      ev({ ref: "e1", type: "EXPANSION_CARD_COMPLETED" }, 1),
    );
    expect(out.extensionActivated).toBe(false);
    expect(out.sessionCompletedRounds).toBe(1);
    expect(out.relationshipEffectiveCardCount).toBe(0);
    expect(delta.reasons).not.toContain("extension_activated");
  });

  it("EXPANSION_CARD_SKIPPED_OR_SWAPPED：只落终态", () => {
    const s = reduceRelationshipEvent(
      init(),
      ev({ ref: "e-x", type: "EXPANSION_CARD_SKIPPED_OR_SWAPPED", terminal: "skipped" }, 1),
    ).state;
    expect(s.terminalExclusivity["e-x"]).toBe("skipped");
    expect(s.sessionCompletedRounds).toBe(0);
  });

  it("EXTENSION_ACTIVATED_BY_HOST：Host 结算触发且最多一次", () => {
    let s = init();
    ({ state: s } = reduceRelationshipEvent(s, ev({ type: "EXTENSION_ACTIVATED_BY_HOST" }, 1)));
    expect(s.extensionActivated).toBe(true);
    const { state: out, delta } = reduceRelationshipEvent(
      s,
      ev({ type: "EXTENSION_ACTIVATED_BY_HOST" }, 2),
    );
    expect(out.extensionActivated).toBe(true);
    expect(delta.reasons).not.toContain("extension_activated");
    expect(out.sessionCompletedRounds).toBe(0);
  });

  it("LEGACY_CURRENT_COMPLETED：消耗轮次＋终态，不推进 effective", () => {
    let s = init();
    ({ state: s } = reduceRelationshipEvent(s, ev({ ref: "l1", type: "LEGACY_CURRENT_COMPLETED" }, 1)));
    expect(s.sessionCompletedRounds).toBe(1);
    expect(s.relationshipEffectiveCardCount).toBe(0);
    expect(s.terminalExclusivity["l1"]).toBe("completed");
  });

  it("LEGACY_CURRENT_SKIPPED：只落终态", () => {
    const s = reduceRelationshipEvent(init(), ev({ ref: "l-x", type: "LEGACY_CURRENT_SKIPPED" }, 1)).state;
    expect(s.terminalExclusivity["l-x"]).toBe("skipped");
    expect(s.sessionCompletedRounds).toBe(0);
  });

  it("未加玩：completed 封顶 20，第 21 轮被拒", () => {
    let s = init();
    for (let n = 1; n <= 20; n++)
      s = reduceRelationshipEvent(s, ev({ ref: `r${n}`, cardId: `c${n}`, type: "REL_CARD_COMPLETED" }, 1000 + n)).state;
    const before = s.sessionCompletedRounds;
    const { state: out, delta } = reduceRelationshipEvent(
      s,
      ev({ ref: "r21", cardId: "c21", type: "REL_CARD_COMPLETED" }, 2000),
    );
    expect(before).toBe(20);
    expect(out.sessionCompletedRounds).toBe(20);
    expect(delta.reasons).toContain("session_limit_reached");
  });

  it("Host 加玩后：放行至 25，第 26 轮被拒", () => {
    let s = init();
    for (let n = 1; n <= 20; n++)
      s = reduceRelationshipEvent(s, ev({ ref: `r${n}`, cardId: `c${n}`, type: "REL_CARD_COMPLETED" }, 1000 + n)).state;
    ({ state: s } = reduceRelationshipEvent(s, ev({ type: "EXTENSION_ACTIVATED_BY_HOST" }, 3000)));
    expect(s.extensionActivated).toBe(true);
    for (let n = 21; n <= 25; n++)
      s = reduceRelationshipEvent(s, ev({ ref: `r${n}`, cardId: `c${n}`, type: "REL_CARD_COMPLETED" }, 1000 + n)).state;
    expect(s.sessionCompletedRounds).toBe(25);
    const { state: out, delta } = reduceRelationshipEvent(
      s,
      ev({ ref: "r26", cardId: "c26", type: "REL_CARD_COMPLETED" }, 4000),
    );
    expect(out.sessionCompletedRounds).toBe(25);
    expect(delta.reasons).toContain("session_limit_reached");
  });

  it("eventId 幂等：重放不重复计数", () => {
    let s = init();
    const e = ev({ ref: "r1", cardId: "c1", type: "REL_CARD_COMPLETED" }, 1);
    const { state: nextState, delta: d } = reduceRelationshipEvent(s, e);
    s = nextState;
    const snapshot = s;
    s = reduceRelationshipEvent(s, e).state;
    expect(s.relationshipEffectiveCardCount).toBe(1);
    expect(s).toBe(snapshot);
    expect(d.replayed).toBe(false);
  });

  it("eventId 幂等：原样返回并标 replayed", () => {
    let s = init();
    ({ state: s } = reduceRelationshipEvent(s, ev({ ref: "r1", cardId: "c1", type: "REL_CARD_COMPLETED" }, 5)));
    const { state: out, delta } = reduceRelationshipEvent(
      s,
      ev({ ref: "r1", cardId: "c1", type: "REL_CARD_COMPLETED" }, 5),
    );
    expect(delta.replayed).toBe(true);
    expect(delta.reasons).toEqual(["replay_ignored"]);
    expect(out.relationshipEffectiveCardCount).toBe(1);
  });

  it("终态互斥：同 ref 二写视为重复，不计数", () => {
    let s = init();
    ({ state: s } = reduceRelationshipEvent(s, ev({ ref: "r9", cardId: "c9", type: "REL_CARD_COMPLETED" }, 1)));
    const { state: out, delta } = reduceRelationshipEvent(
      s,
      ev({ ref: "r9", cardId: "c9", type: "REL_CARD_COMPLETED" }, 2),
    );
    expect(out.relationshipEffectiveCardCount).toBe(1);
    expect(delta.reasons).toContain("terminal_conflict");
  });

  it("SYSTEM_MUTUAL_CHECK_DUE：9/14/19 各标记一轮（19 档须加玩把 target 提到 25）", () => {
    let s = init();
    // 19 档在未加玩（target=20）时剩余仅 1 轮 <2 会被忽略；先加玩使 target=25。
    ({ state: s } = reduceRelationshipEvent(s, ev({ type: "EXTENSION_ACTIVATED_BY_HOST" }, 1)));
    const set: [number, number][] = [
      [9, 1],
      [14, 2],
      [19, 3],
    ];
    for (let n = 1; n <= 19; n++) {
      ({ state: s } = reduceRelationshipEvent(s, ev({ ref: `r${n}`, cardId: `c${n}`, type: "REL_CARD_COMPLETED" }, 1000 + n)));
    }
    for (const [count, run] of set) {
      const { state: out, delta } = reduceRelationshipEvent(
        s,
        ev({ type: "SYSTEM_MUTUAL_CHECK_DUE", dueCount: count }, 2000 + count),
      );
      expect(out.lastMutualCheckAtEffectiveCount).toBe(count);
      expect(out.regularMutualCheckRuns).toBe(run);
      expect(delta.reasons).toContain("mutual_due");
      s = out;
    }
  });

  it("SYSTEM_MUTUAL_CHECK_DUE 门①：dueCount 不在 9/14/19 → 忽略", () => {
    const { state: out, delta } = reduceRelationshipEvent(
      stateWith({ sessionCompletedRounds: 10 }),
      ev({ type: "SYSTEM_MUTUAL_CHECK_DUE", dueCount: 10 }, 1),
    );
    expect(out.lastMutualCheckAtEffectiveCount).toBeNull();
    expect(out.regularMutualCheckRuns).toBe(0);
    expect(delta.reasons).not.toContain("mutual_due");
  });

  it("SYSTEM_MUTUAL_CHECK_DUE 门②：剩余轮次 <2（未加玩 sessionCompletedRounds=19）→ 忽略", () => {
    const { state: out, delta } = reduceRelationshipEvent(
      stateWith({ sessionCompletedRounds: 19 }),
      ev({ type: "SYSTEM_MUTUAL_CHECK_DUE", dueCount: 9 }, 1),
    );
    expect(out.lastMutualCheckAtEffectiveCount).toBeNull();
    expect(out.regularMutualCheckRuns).toBe(0);
    expect(delta.reasons).not.toContain("mutual_due");
  });

  it("SYSTEM_MUTUAL_CHECK_DUE 门③：第 4 次 due（runs 已 3）→ 忽略", () => {
    const { state: out, delta } = reduceRelationshipEvent(
      stateWith({ sessionCompletedRounds: 5, regularMutualCheckRuns: 3 }),
      ev({ type: "SYSTEM_MUTUAL_CHECK_DUE", dueCount: 9 }, 1),
    );
    expect(out.regularMutualCheckRuns).toBe(3);
    expect(out.lastMutualCheckAtEffectiveCount).toBeNull();
    expect(delta.reasons).not.toContain("mutual_due");
  });

  it("SYSTEM_MUTUAL_CHECK_DUE 门④：间隔不足 5（last=7, due=9）→ 忽略", () => {
    const { state: out, delta } = reduceRelationshipEvent(
      stateWith({ sessionCompletedRounds: 9, regularMutualCheckRuns: 1, lastMutualCheckAtEffectiveCount: 7 }),
      ev({ type: "SYSTEM_MUTUAL_CHECK_DUE", dueCount: 9 }, 1),
    );
    expect(out.lastMutualCheckAtEffectiveCount).toBe(7);
    expect(out.regularMutualCheckRuns).toBe(1);
    expect(delta.reasons).not.toContain("mutual_due");
  });

  it("SYSTEM_MUTUAL_CHECK_FINAL 双方同意 → MATCH＋cooldown", () => {
    const s = init();
    const { state: out, delta } = reduceRelationshipEvent(
      s,
      ev(
        {
          type: "SYSTEM_MUTUAL_CHECK_FINAL",
          pairKey: "a::b",
          playerIds: ["a", "b"],
          consented: true,
          timestamp: "2026-09-25T00:00:00.000Z",
        },
        1,
      ),
    );
    expect(out.matches["a::b"].playerIds).toEqual(["a", "b"]);
    expect(out.cooldowns["a::b"]).toBe(5);
    expect(delta.reasons).toContain("match_created");
    expect(delta.reasons).toContain("cooldown_set");
  });

  it("SYSTEM_MUTUAL_CHECK_FINAL 不双方同意 → 不建 MATCH", () => {
    const out = reduceRelationshipEvent(
      init(),
      ev(
        { type: "SYSTEM_MUTUAL_CHECK_FINAL", pairKey: "a::b", playerIds: ["a", "b"], consented: false },
        1,
      ),
    ).state;
    expect(out.matches["a::b"]).toBeUndefined();
  });

  it("D5 MATCH 上限 2：新建前双方 active 数须 <2，达上限中性 no-action", () => {
    let s = init();
    ({ state: s } = reduceRelationshipEvent(
      s,
      ev(
        {
          type: "SYSTEM_MUTUAL_CHECK_FINAL",
          pairKey: "a::b",
          playerIds: ["a", "b"],
          consented: true,
          timestamp: "2026-09-25T00:00:00.000Z",
        },
        1,
      ),
    ));
    ({ state: s } = reduceRelationshipEvent(
      s,
      ev(
        {
          type: "SYSTEM_MUTUAL_CHECK_FINAL",
          pairKey: "a::c",
          playerIds: ["a", "c"],
          consented: true,
          timestamp: "2026-09-25T00:00:00.000Z",
        },
        2,
      ),
    ));
    expect(Object.keys(s.matches)).toHaveLength(2);
    const { state: out, delta } = reduceRelationshipEvent(
      s,
      ev(
        {
          type: "SYSTEM_MUTUAL_CHECK_FINAL",
          pairKey: "a::d",
          playerIds: ["a", "d"],
          consented: true,
          timestamp: "2026-09-25T00:00:00.000Z",
        },
        3,
      ),
    );
    expect(out.matches["a::d"]).toBeUndefined();
    expect(out.matches["a::b"]).toBe(s.matches["a::b"]);
    expect(out.matches["a::c"]).toBe(s.matches["a::c"]);
    expect(out.cooldowns["a::d"]).toBeUndefined();
    expect(delta.reasons).not.toContain("match_created");
    expect(delta.reasons).not.toContain("cooldown_set");
  });

  it("D5 MATCH 上限 2：双方均未达上限则正常放行", () => {
    let s = init();
    ({ state: s } = reduceRelationshipEvent(
      s,
      ev(
        {
          type: "SYSTEM_MUTUAL_CHECK_FINAL",
          pairKey: "a::b",
          playerIds: ["a", "b"],
          consented: true,
          timestamp: "2026-09-25T00:00:00.000Z",
        },
        1,
      ),
    ));
    const { state: out, delta } = reduceRelationshipEvent(
      s,
      ev(
        {
          type: "SYSTEM_MUTUAL_CHECK_FINAL",
          pairKey: "c::d",
          playerIds: ["c", "d"],
          consented: true,
          timestamp: "2026-09-25T00:00:00.000Z",
        },
        2,
      ),
    );
    expect(out.matches["c::d"].playerIds).toEqual(["c", "d"]);
    expect(out.cooldowns["c::d"]).toBe(5);
    expect(delta.reasons).toContain("match_created");
  });

  it("Coverage：REL completed 带 playerId → offered+1/completed+1 且清连续跳过", () => {
    let s = init();
    ({ state: s } = reduceRelationshipEvent(
      s,
      ev({ ref: "r1", cardId: "c1", type: "REL_CARD_SKIPPED", playerId: "p1" }, 1),
    ));
    ({ state: s } = reduceRelationshipEvent(
      s,
      ev({ ref: "r2", cardId: "c2", type: "REL_CARD_SKIPPED", playerId: "p1" }, 2),
    ));
    expect(s.playerCoverage["p1"].consecutiveTargetedSkips).toBe(2);
    expect(s.playerCoverage["p1"].lowParticipation).toBe(true);

    ({ state: s } = reduceRelationshipEvent(
      s,
      ev({ ref: "r3", cardId: "c3", type: "REL_CARD_COMPLETED", playerId: "p1" }, 3),
    ));
    expect(s.playerCoverage["p1"]).toEqual({
      offeredTargeted: 3,
      completedTargeted: 1,
      consecutiveTargetedSkips: 0,
      lowParticipation: false,
    });
  });

  it("Coverage：连续 skip 阈值 2 才标低参与，单次 skip 不标", () => {
    let s = init();
    ({ state: s } = reduceRelationshipEvent(
      s,
      ev({ ref: "s1", cardId: "c1", type: "REL_CARD_SKIPPED", playerId: "p2" }, 1),
    ));
    expect(s.playerCoverage["p2"].lowParticipation).toBe(false);
    ({ state: s } = reduceRelationshipEvent(
      s,
      ev({ ref: "s2", cardId: "c2", type: "REL_CARD_SKIPPED", playerId: "p2" }, 2),
    ));
    expect(s.playerCoverage["p2"].offeredTargeted).toBe(2);
    expect(s.playerCoverage["p2"].completedTargeted).toBe(0);
    expect(s.playerCoverage["p2"].consecutiveTargetedSkips).toBe(2);
    expect(s.playerCoverage["p2"].lowParticipation).toBe(true);
  });

  it("Coverage：REL swap 仅写 used 不写 coverage（offered/completed 均 +0）", () => {
    let s = init();
    ({ state: s } = reduceRelationshipEvent(
      s,
      ev({ ref: "w1", cardId: "c1", type: "REL_CARD_SWAPPED", playerId: "p3" }, 1),
    ));
    expect(s.playerCoverage["p3"]).toBeUndefined();
    expect(s.usedCardIds).toEqual(["c1"]);
    ({ state: s } = reduceRelationshipEvent(
      s,
      ev({ ref: "r4", cardId: "c4", type: "REL_CARD_COMPLETED" }, 2),
    ));
    expect(s.playerCoverage["p3"]).toBeUndefined();
    expect(Object.keys(s.playerCoverage)).toEqual([]);
  });

  it("Cooldown：completed 事件逐次 -1 至 0，保留键不出现负值", () => {
    let s = init();
    ({ state: s } = reduceRelationshipEvent(
      s,
      ev(
        {
          type: "SYSTEM_MUTUAL_CHECK_FINAL",
          pairKey: "a::b",
          playerIds: ["a", "b"],
          consented: true,
          timestamp: "2026-09-25T00:00:00.000Z",
        },
        1,
      ),
    ));
    expect(s.cooldowns["a::b"]).toBe(5);
    for (let n = 1; n <= 6; n++) {
      ({ state: s } = reduceRelationshipEvent(
        s,
        ev({ ref: `r${n}`, cardId: `c${n}`, type: "REL_CARD_COMPLETED" }, 100 + n),
      ));
    }
    expect("a::b" in s.cooldowns).toBe(true);
    expect(s.cooldowns["a::b"]).toBe(0);
  });

  it("Cooldown：NEUTRAL completed 不递减（仅 REL completed 递减）", () => {
    let s = init();
    ({ state: s } = reduceRelationshipEvent(
      s,
      ev(
        {
          type: "SYSTEM_MUTUAL_CHECK_FINAL",
          pairKey: "a::b",
          playerIds: ["a", "b"],
          consented: true,
          timestamp: "2026-09-25T00:00:00.000Z",
        },
        1,
      ),
    ));
    expect(s.cooldowns["a::b"]).toBe(5);
    const { state: out, delta } = reduceRelationshipEvent(
      s,
      ev({ ref: "n1", type: "NEUTRAL_CARD_COMPLETED" }, 2),
    );
    expect(out.cooldowns["a::b"]).toBe(5);
    expect(out.sessionCompletedRounds).toBe(1);
    expect(delta.reasons).not.toContain("cooldown_ticked");
  });
});