import { describe, expect, it } from "vitest";
import { selectEligiblePlayer } from "@/lib/engine/player-selector";
import type { Player } from "@/lib/domain/schemas";

const roster = (spec: Array<[string, string, boolean]>): Player[] =>
  spec.map(([id, displayName, active]) => ({ id, displayName, active, createdAt: "x", lastUsedAt: "x" }));

/** 固定种子的伪随机：1000 次跑的既是“随机化”测试，也永远可复现（SC-004）。 */
function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROSTERS: Player[][] = [
  roster([["alex", "Alex", true], ["emma", "Emma", true], ["kai", "Kai", true]]),
  roster([["alex", "Alex", true], ["emma", "Emma", false], ["kai", "Kai", true], ["mia", "Mia", false]]),
  roster([["alex", "Alex", true], ["emma", "Emma", true]]),
  roster([["alex", "Alex", false], ["emma", "Emma", true], ["kai", "Kai", true], ["mia", "Mia", true], ["leo", "Leo", true]]),
  roster([["alex", "Alex", true]]),
];

describe("selectEligiblePlayer (T150/T153 · SC-004)", () => {
  it("never selects an inactive player and keeps the index inside the pool across 1000 draws", () => {
    const random = mulberry32(20260921);
    let draws = 0;
    for (let index = 0; index < 1000; index += 1) {
      const players = ROSTERS[index % ROSTERS.length]!;
      const avoid = index % 3 === 0 ? players[index % players.length]!.id : undefined;
      const picked = selectEligiblePlayer(players, { avoidPlayerId: avoid, random });
      const active = players.filter((player) => player.active);
      expect(active.length).toBeGreaterThan(0);
      expect(picked).toBeDefined();
      expect(picked!.active).toBe(true);
      expect(players.map((player) => player.id)).toContain(picked!.id);
      // avoid 只在“还有别人可选”时才生效；只有一名 active 玩家时放宽，绝不空转
      if (active.length > 1 && avoid) expect(picked!.id).not.toBe(avoid);
      draws += 1;
    }
    expect(draws).toBe(1000);
  });

  it("never repeats the avoided player while a second active player exists (1000 draws)", () => {
    const random = mulberry32(7);
    const players = roster([["alex", "Alex", true], ["emma", "Emma", false], ["kai", "Kai", true], ["mia", "Mia", true]]);
    const seen = new Set<string>();
    for (let index = 0; index < 1000; index += 1) {
      const picked = selectEligiblePlayer(players, { avoidPlayerId: "mia", random });
      expect(["alex", "kai"]).toContain(picked!.id);
      seen.add(picked!.id);
    }
    expect(seen).toEqual(new Set(["alex", "kai"]));
  });

  it("returns undefined when nobody is active, instead of guessing a player", () => {
    expect(selectEligiblePlayer([], { random: () => 0 })).toBeUndefined();
    expect(selectEligiblePlayer(roster([["alex", "Alex", false], ["emma", "Emma", false]]), { random: () => 0 })).toBeUndefined();
  });

  it("keeps the single-active-player special case: the only player may repeat", () => {
    const alone = roster([["alex", "Alex", true], ["emma", "Emma", false]]);
    expect(selectEligiblePlayer(alone, { avoidPlayerId: "alex", random: () => 0 })?.id).toBe("alex");
    expect(selectEligiblePlayer(alone, { avoidPlayerId: "alex", random: () => 0.99 })?.id).toBe("alex");
  });

  it("survives degenerate rolls from an injected random source", () => {
    const players = roster([["alex", "Alex", true], ["emma", "Emma", true], ["kai", "Kai", true]]);
    const rolls = [0, 0.999999, 1, 1.5, -0.2, Number.NaN, Number.POSITIVE_INFINITY];
    for (const roll of rolls) {
      const picked = selectEligiblePlayer(players, { random: () => roll });
      expect(picked).toBeDefined();
      expect(picked!.active).toBe(true);
      expect(players.map((player) => player.id)).toContain(picked!.id);
    }
    // 合法边界：0 取第一个、接近 1 取最后一个，不越界
    expect(selectEligiblePlayer(players, { random: () => 0 })?.id).toBe("alex");
    expect(selectEligiblePlayer(players, { random: () => 0.999999 })?.id).toBe("kai");
    expect(selectEligiblePlayer(players, { random: () => 1 })?.id).toBe("kai");
  });

  it("is deterministic for a fixed roll: same roll, same player", () => {
    const players = roster([["alex", "Alex", true], ["emma", "Emma", true], ["kai", "Kai", true]]);
    const first = selectEligiblePlayer(players, { random: () => 0.4 });
    const second = selectEligiblePlayer(players, { random: () => 0.4 });
    expect(first?.id).toBe("emma");
    expect(second?.id).toBe(first?.id);
  });
});
