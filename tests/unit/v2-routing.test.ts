import { describe, expect, it } from "vitest";
import { rankPairs, scorePair } from "@/lib/v2-relationship/v2-routing";
import type { SessionParticipant } from "@/lib/v2-relationship/v2-state";

const male = (playerId: string): SessionParticipant => ({
  playerId,
  active: true,
  pairGender: "male",
});

const female = (playerId: string): SessionParticipant => ({
  playerId,
  active: true,
  pairGender: "female",
});

type Signal = { shared: number; compat: number; crowd: number; personal: number };

const sig = (s: Partial<Signal> = {}): Signal => ({
  shared: 0,
  compat: 0,
  crowd: 0,
  personal: 0,
  ...s,
});

const pool3x3 = (): SessionParticipant[] => [
  male("m1"),
  male("m2"),
  male("m3"),
  female("f1"),
  female("f2"),
  female("f3"),
];

describe("v2 routing", () => {
  it("空输入返回空数组", () => {
    expect(rankPairs([], {}, new Set<string>(), {})).toEqual([]);
  });

  it("按分数降序排序且与入参顺序无关", () => {
    const parts = pool3x3();
    const signals = { "f1::m1": sig({ personal: 2 }), "f2::m2": sig({ personal: 1 }) };
    const out = rankPairs(parts, signals, new Set<string>(), {});
    expect(out).toHaveLength(9);
    expect(out[0]).toBe("f1::m1");
    expect(out[1]).toBe("f2::m2");

    const reversed = rankPairs([...parts].reverse(), signals, new Set<string>(), {});
    expect(reversed).toEqual(out);
  });

  it("同分时按 pairKey 升序", () => {
    const signals = { "f1::m1": sig({ personal: 1 }), "f2::m2": sig({ personal: 1 }) };
    const out = rankPairs(pool3x3(), signals, new Set<string>(), {});
    expect(out).toEqual([
      "f1::m1",
      "f2::m2",
      "f1::m2",
      "f1::m3",
      "f2::m1",
      "f2::m3",
      "f3::m1",
      "f3::m2",
      "f3::m3",
    ]);
  });

  it("小池权重切换导致名次翻转", () => {
    const signals = { "f1::m1": sig({ shared: 1, compat: 1 }), "f2::m2": sig({ crowd: 2 }) };

    const small = rankPairs([male("m1"), male("m2"), female("f1"), female("f2")], signals, new Set<string>(), {});
    expect(small).toHaveLength(4);
    expect(small[0]).toBe("f1::m1");

    const large = rankPairs(pool3x3(), signals, new Set<string>(), {});
    expect(large).toHaveLength(9);
    expect(large[0]).toBe("f2::m2");
  });

  it("常规池 personal 封顶 +2：personalEvidence=2 与 =1 同分且比 =0 多 2 分", () => {
    const base = { shared: 0, compat: 0, crowd: 0, personal: 0, matched: false };
    const zero = scorePair(base, 0, false);
    const one = scorePair({ ...base, personal: 1 }, 0, false);
    const two = scorePair({ ...base, personal: 2 }, 0, false);
    expect(one - zero).toBe(2);
    expect(two - zero).toBe(2);
    expect(two).toBe(one);
  });

  it("小池 6 对 vs 常规池 7 对边界：权重切换导致名次翻转", () => {
    const pool6 = [
      male("m1"),
      female("f1"),
      female("f2"),
      female("f3"),
      female("f4"),
      female("f5"),
      female("f6"),
    ];
    const pool7 = [...pool6, female("f7")];
    const signals = { "f1::m1": sig({ shared: 1, compat: 1 }), "f2::m1": sig({ crowd: 2 }) };

    const small = rankPairs(pool6, signals, new Set<string>(), {});
    expect(small).toHaveLength(6);
    expect(small[0]).toBe("f1::m1");

    const large = rankPairs(pool7, signals, new Set<string>(), {});
    expect(large).toHaveLength(7);
    expect(large[0]).toBe("f2::m1");
  });

  it("matched 在常规池加 5 分", () => {
    const base = { shared: 0, compat: 0, crowd: 0, personal: 0 };
    expect(
      scorePair({ ...base, matched: true }, 0, false) -
        scorePair({ ...base, matched: false }, 0, false),
    ).toBe(5);
  });

  it("cooldown 命中扣 4 分", () => {
    const p = { shared: 1, compat: 1, crowd: 1, personal: 1, matched: false };
    expect(scorePair(p, 0, false) - scorePair(p, 1, false)).toBe(4);
  });
});
