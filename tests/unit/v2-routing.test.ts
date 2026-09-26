import { describe, expect, it } from "vitest";
import {
  COVERAGE_MAX_PENALTY,
  coveragePenalty,
  rankPairs,
  scorePair,
} from "@/lib/v2-relationship/v2-routing";
import { eligiblePairKeys } from "@/lib/v2-relationship/v2-participants";
import type { PlayerCoverage, SessionParticipant } from "@/lib/v2-relationship/v2-state";

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

/* ------------------------------------------------------------------ */
/* B2a：Coverage 软排序（R-CB5 / R-CB8）                                  */
/* ------------------------------------------------------------------ */

const cov = (o: Partial<PlayerCoverage> = {}): PlayerCoverage => ({
  offeredTargeted: 0,
  completedTargeted: 0,
  consecutiveTargetedSkips: 0,
  lowParticipation: false,
  ...o,
});

/** 改动前（无 Coverage）写死的冻结顺序：pool3x3 + 两个 personal=1 pair。 */
const FROZEN_SIGNALS = { "f1::m1": sig({ personal: 1 }), "f2::m2": sig({ personal: 1 }) };
const FROZEN_ORDER_3x3 = [
  "f1::m1",
  "f2::m2",
  "f1::m2",
  "f1::m3",
  "f2::m1",
  "f2::m3",
  "f3::m1",
  "f3::m2",
  "f3::m3",
];

describe("v2 routing · Coverage 软排序", () => {
  it("回归钉子：空 Coverage 与省略第 5 参逐条一致，且等于改动前写死顺序", () => {
    const parts = pool3x3();
    const legacy = rankPairs(parts, FROZEN_SIGNALS, new Set<string>(), {});
    expect(legacy).toEqual(FROZEN_ORDER_3x3);
    // 显式传空表 == 省略 == 改动前
    expect(rankPairs(parts, FROZEN_SIGNALS, new Set<string>(), {}, {})).toEqual(legacy);
    // 全表覆盖度一致（含 skip / low 形态）→ 每 pair 扣同一常数，顺序仍逐条相同
    const uniform = Object.fromEntries(
      parts.map((p) => [
        p.playerId,
        cov({ offeredTargeted: 5, completedTargeted: 2, consecutiveTargetedSkips: 3, lowParticipation: true }),
      ]),
    );
    expect(rankPairs(parts, FROZEN_SIGNALS, new Set<string>(), {}, uniform)).toEqual(legacy);
  });

  it("Coverage 少者优先：p1 已 offered 5 次、p2 从未 offered，同信号下含 p2 的 pair 排前面", () => {
    const parts = pool3x3();
    const coverage = { m1: cov({ offeredTargeted: 5, completedTargeted: 5 }) };
    const out = rankPairs(parts, {}, new Set<string>(), {}, coverage);

    expect(out.indexOf("f1::m2")).toBeLessThan(out.indexOf("f1::m1"));
    expect(out.indexOf("f3::m2")).toBeLessThan(out.indexOf("f1::m1"));
    // 已多次 offered 的 m1 相关 pair 全部沉到末尾
    expect(out.slice(6)).toEqual(["f1::m1", "f2::m1", "f3::m1"]);
  });

  it("三档严格有序：两端都少 > 一端多一端少 > 两端都多", () => {
    const parts = [male("m1"), male("m2"), female("f1"), female("f2")];
    const coverage = { m1: cov({ offeredTargeted: 2 }), f1: cov({ offeredTargeted: 2 }) };
    const out = rankPairs(parts, {}, new Set<string>(), {}, coverage);

    // f2::m2=(0,0)；f1::m2 / f2::m1=(2,0) 一端多一端少；f1::m1=(2,2) 两端都多
    expect(out).toEqual(["f2::m2", "f1::m2", "f2::m1", "f1::m1"]);
  });

  it("consecutiveTargetedSkips / lowParticipation 参与偏向：冷落方优先", () => {
    const parts = [male("m1"), male("m2"), female("f1"), female("f2")];

    const skipped = {
      m1: cov({ offeredTargeted: 2, consecutiveTargetedSkips: 2, lowParticipation: true }),
    };
    const out = rankPairs(parts, {}, new Set<string>(), {}, skipped);
    expect(out.indexOf("f1::m2")).toBeLessThan(out.indexOf("f1::m1"));
    expect(out.indexOf("f2::m2")).toBeLessThan(out.indexOf("f2::m1"));

    // 仅单次连续跳过（low 尚 false）也要让位给从未获得机会的 m2
    const oneSkip = { m1: cov({ offeredTargeted: 1, consecutiveTargetedSkips: 1 }) };
    const out2 = rankPairs(parts, {}, new Set<string>(), {}, oneSkip);
    expect(out2.indexOf("f1::m2")).toBeLessThan(out2.indexOf("f1::m1"));

    // 对照：无 Coverage 时按 pairKey 升序，不偏向
    expect(rankPairs(parts, {}, new Set<string>(), {}, {})).toEqual([
      "f1::m1",
      "f1::m2",
      "f2::m1",
      "f2::m2",
    ]);
  });

  it("候选集合不变：Coverage 任意填充，返回的 pairKey 集合与空 Coverage 完全一致", () => {
    const parts = pool3x3();
    const baseline = [...rankPairs(parts, {}, new Set<string>(), {})].sort();

    const filled: Record<string, PlayerCoverage> = {};
    for (const p of parts) {
      filled[p.playerId] = cov({
        offeredTargeted: 9,
        completedTargeted: 4,
        consecutiveTargetedSkips: 5,
        lowParticipation: true,
      });
    }
    filled["ghost"] = cov({ offeredTargeted: 3 }); // 未知 id 不影响
    expect([...rankPairs(parts, {}, new Set<string>(), {}, filled)].sort()).toEqual(baseline);

    // inactive / pairGender=null 的非法边始终不进池，与 Coverage 无关
    const dirty: SessionParticipant[] = [
      ...parts,
      { playerId: "m9", active: false, pairGender: "male" },
      { playerId: "fx", active: true, pairGender: null },
    ];
    expect([...rankPairs(dirty, {}, new Set<string>(), {}, filled)].sort()).toEqual(baseline);
  });

  it("确定性：同分同 Coverage 按 pairKey 升序，输入乱序结果不变", () => {
    const parts = pool3x3();
    const uniform = Object.fromEntries(parts.map((p) => [p.playerId, cov({ offeredTargeted: 3 })]));
    const expected = [
      "f1::m1",
      "f1::m2",
      "f1::m3",
      "f2::m1",
      "f2::m2",
      "f2::m3",
      "f3::m1",
      "f3::m2",
      "f3::m3",
    ];
    expect(rankPairs(parts, {}, new Set<string>(), {}, uniform)).toEqual(expected);
    expect(rankPairs([...parts].reverse(), {}, new Set<string>(), {}, uniform)).toEqual(expected);
  });

  it("权重上界：Coverage 扣分 ≤0.4 且严格小于最小 Signal 步长 0.5，不掀翻 Signal", () => {
    expect(COVERAGE_MAX_PENALTY).toBeLessThan(0.5);
    const worst = cov({
      offeredTargeted: 9,
      completedTargeted: 0,
      consecutiveTargetedSkips: 4,
      lowParticipation: true,
    });
    expect(coveragePenalty(worst, worst)).toBeCloseTo(COVERAGE_MAX_PENALTY, 10);
    expect(coveragePenalty(cov(), cov())).toBe(0);
    // scorePair 默认第 4 参 = 0：老调用签名分值不变；显式传入即为纯扣分
    const base = { shared: 1, compat: 1, crowd: 1, personal: 1, matched: false };
    expect(scorePair(base, 0, false)).toBe(scorePair(base, 0, false, 0));
    expect(scorePair(base, 0, false, COVERAGE_MAX_PENALTY)).toBeCloseTo(
      scorePair(base, 0, false) - COVERAGE_MAX_PENALTY,
      10,
    );

    // B 的 Signal 仅高最小步长 0.5（smallPool shared=1 → +0.5）但 Coverage 最差；
    // A 无 Signal 但 Coverage 最优 → B 仍在前，证明不掀翻 Signal。
    const parts = [male("m1"), male("m2"), female("f1"), female("f2")];
    const signals = { "f1::m1": sig(), "f2::m2": sig({ shared: 1 }) };
    const coverage = { m1: cov(), f1: cov(), m2: worst, f2: worst };
    const out = rankPairs(parts, signals, new Set<string>(), {}, coverage);
    expect(out[0]).toBe("f2::m2");
    expect(out.indexOf("f2::m2")).toBeLessThan(out.indexOf("f1::m1"));
  });

  it("普通桌回归：2男2女/2男3女/3男2女 连续 20 次调度合法，且不比无 Coverage 时更集中", () => {
    const tables: Array<[string, SessionParticipant[]]> = [
      ["2男2女", [male("m1"), male("m2"), female("f1"), female("f2")]],
      ["2男3女", [male("m1"), male("m2"), female("f1"), female("f2"), female("f3")]],
      ["3男2女", [male("m1"), male("m2"), male("m3"), female("f1"), female("f2")]],
    ];

    for (const [label, parts] of tables) {
      const legal = new Set(eligiblePairKeys(parts));

      // 基线：不消费 Coverage（改动前行为）的 20 轮调度分布
      const baseCounts: Record<string, number> = Object.fromEntries(parts.map((p) => [p.playerId, 0]));
      for (let round = 0; round < 20; round++) {
        const pick = rankPairs(parts, {}, new Set<string>(), {})[0];
        for (const id of pick.split("::")) baseCounts[id] += 1;
      }

      // 消费 Coverage：每轮把选中 pair 两端记为已 offered，再进入下一轮
      const counts: Record<string, number> = Object.fromEntries(parts.map((p) => [p.playerId, 0]));
      let coverage: Record<string, PlayerCoverage> = {};
      for (let round = 0; round < 20; round++) {
        const pick = rankPairs(parts, {}, new Set<string>(), {}, coverage)[0];
        expect(legal.has(pick), `${label} 第${round + 1}轮选中非法 pair ${pick}`).toBe(true);
        const [a, b] = pick.split("::");
        counts[a] += 1;
        counts[b] += 1;
        const next: Record<string, PlayerCoverage> = { ...coverage };
        for (const id of [a, b]) {
          const prev = next[id] ?? cov();
          next[id] = {
            ...prev,
            offeredTargeted: prev.offeredTargeted + 1,
            completedTargeted: prev.completedTargeted + 1,
          };
        }
        coverage = next;
      }

      const minWith = Math.min(...Object.values(counts));
      const maxWith = Math.max(...Object.values(counts));
      const minBase = Math.min(...Object.values(baseCounts));
      const maxBase = Math.max(...Object.values(baseCounts));
      expect(minWith, `${label} 有玩家 20 轮零机会（比基线更集中）`).toBeGreaterThanOrEqual(minBase);
      expect(maxWith, `${label} 单玩家被过度集中`).toBeLessThanOrEqual(maxBase);
      // 接入 Coverage 后不得劣化：端到端不出现 20 轮死点同一人
      expect(maxWith, `${label} 连续集中点同一人`).toBeLessThan(20);
    }
  });
});
