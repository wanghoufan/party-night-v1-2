import { describe, expect, it } from "vitest";
import type { Player } from "@/lib/domain/schemas";
import { pickRandomPlayer, playerLabels } from "@/lib/tools/random-player";
import { randomGroups, shuffle } from "@/lib/tools/random-groups";

const NAMES = ["Alex", "Emma", "Kai", "Mia", "Leo", "Zoe", "Noah", "Ivy", "Ryan", "Nora", "Felix", "Luna"];

function roster(count: number, inactive: number[] = []): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    displayName: NAMES[index] ?? `玩家 ${index + 1}`,
    active: !inactive.includes(index + 1),
    createdAt: "x",
    lastUsedAt: "x",
  }));
}

/** 固定种子的伪随机：随机行为可复现，测试永不 flaky（与 player-selector 测试同口径）。 */
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

const ids = (players: Player[]) => players.map((player) => player.id).sort();
const sizes = (groups: Player[][]) => groups.map((group) => group.length);

describe("pickRandomPlayer（T155 / FR-022 随机点名）", () => {
  it("只从在场玩家里抽一个，注入 RNG 后结果可复现", () => {
    const players = roster(4, [2]);
    expect(pickRandomPlayer(players, { random: () => 0 })?.id).toBe("p1");
    expect(pickRandomPlayer(players, { random: () => 0.999999 })?.id).toBe("p4");
    // 同样的 roll 永远得到同一个人
    expect(pickRandomPlayer(players, { random: () => 0.4 })?.id).toBe(pickRandomPlayer(players, { random: () => 0.4 })?.id);
  });

  it("暂离的玩家永远不被点到（500 次）", () => {
    const players = roster(5, [2, 4]);
    const random = mulberry32(20260921);
    for (let index = 0; index < 500; index += 1) {
      const picked = pickRandomPlayer(players, { random });
      expect(picked).toBeDefined();
      expect(picked!.active).toBe(true);
      expect(["p1", "p3", "p5"]).toContain(picked!.id);
    }
  });

  it("avoid-immediate-repeat：还有第二个在场玩家可选时，绝不连续点同一人（300 次）", () => {
    const players = roster(4);
    const random = mulberry32(7);
    let previous = pickRandomPlayer(players, { random })!;
    for (let index = 0; index < 300; index += 1) {
      const next = pickRandomPlayer(players, { avoidPlayerId: previous.id, random })!;
      expect(next.id).not.toBe(previous.id);
      previous = next;
    }
  });

  it("只剩一名在场玩家时放宽避免重复，不空转", () => {
    const players = roster(3, [2, 3]);
    expect(pickRandomPlayer(players, { avoidPlayerId: "p1", random: () => 0.9 })?.id).toBe("p1");
  });

  it("没有在场玩家时返回 undefined，不猜人", () => {
    expect(pickRandomPlayer([], { random: () => 0 })).toBeUndefined();
    expect(pickRandomPlayer(roster(2, [1, 2]), { random: () => 0 })).toBeUndefined();
  });

  it("非法随机值也不越界、不空转", () => {
    const players = roster(3);
    for (const roll of [0, 1, 1.5, -0.2, Number.NaN, Number.POSITIVE_INFINITY]) {
      const picked = pickRandomPlayer(players, { random: () => roll });
      expect(players.map((player) => player.id)).toContain(picked!.id);
    }
  });
});

describe("playerLabels（T158 无昵称占位）", () => {
  it("没有昵称的在场玩家按在场顺序用“玩家 N”占位", () => {
    const players: Player[] = [
      { id: "p1", displayName: "  ", active: true, createdAt: "x", lastUsedAt: "x" },
      { id: "p2", displayName: "Emma", active: true, createdAt: "x", lastUsedAt: "x" },
      { id: "p3", displayName: "", active: true, createdAt: "x", lastUsedAt: "x" },
      { id: "p4", displayName: "暂离的人", active: false, createdAt: "x", lastUsedAt: "x" },
    ];
    const labels = playerLabels(players);
    expect(labels.get("p1")).toBe("玩家 1");
    expect(labels.get("p2")).toBe("Emma");
    expect(labels.get("p3")).toBe("玩家 3");
    expect(labels.has("p4")).toBe(false);
  });
});

describe("shuffle（T156）", () => {
  it("只重排不增删：元素集合完全一致", () => {
    const players = roster(12);
    expect(ids(shuffle(players, mulberry32(1)))).toEqual(ids(players));
  });

  it("注入同一个种子，结果完全一致；换种子会打乱顺序", () => {
    const players = roster(12);
    expect(ids(shuffle(players, mulberry32(3)))).toEqual(ids(shuffle(players, mulberry32(3))));
    expect(shuffle(players, mulberry32(1)).map((player) => player.id)).not.toEqual(players.map((player) => player.id));
  });

  it("非法随机值也不丢元素、不越界", () => {
    const players = roster(6);
    for (const roll of [0, 1, 2.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(ids(shuffle(players, () => roll))).toEqual(ids(players));
    }
  });
});

describe("randomGroups（T156 / T157 随机分组）", () => {
  it("2–12 人分 2 组或 3 组：每组非空、人数差 ≤1、每个人恰好出现一次", () => {
    const random = mulberry32(99);
    for (let count = 2; count <= 12; count += 1) {
      const players = roster(count);
      for (const groups of [2, 3]) {
        const result = randomGroups(players, { groups, random });
        const expectedGroups = Math.min(groups, count);
        expect(result).toHaveLength(expectedGroups);
        expect(sizes(result).every((size) => size >= 1)).toBe(true);
        expect(Math.max(...sizes(result)) - Math.min(...sizes(result))).toBeLessThanOrEqual(1);
        expect(ids(result.flat())).toEqual(ids(players));
        expect(new Set(result.flat().map((player) => player.id)).size).toBe(count);
      }
    }
  });

  it("奇数余数：多出来的 1 人只落在前面一组，差不超过 1", () => {
    expect(sizes(randomGroups(roster(7), { groups: 2, random: () => 0 }))).toEqual([4, 3]);
    expect(sizes(randomGroups(roster(9), { groups: 2, random: () => 0 }))).toEqual([5, 4]);
    expect(sizes(randomGroups(roster(5), { groups: 3, random: () => 0 }))).toEqual([2, 2, 1]);
    expect(sizes(randomGroups(roster(12), { groups: 3, random: () => 0 }))).toEqual([4, 4, 4]);
  });

  it("两人一组：每组最多 2 人，奇数人数最后一组 1 人（余数），差 ≤1", () => {
    for (let count = 2; count <= 12; count += 1) {
      const result = randomGroups(roster(count), { groupSize: 2, random: mulberry32(count) });
      expect(result).toHaveLength(Math.ceil(count / 2));
      expect(sizes(result).every((size) => size <= 2)).toBe(true);
      expect(Math.max(...sizes(result)) - Math.min(...sizes(result))).toBeLessThanOrEqual(1);
      expect(ids(result.flat())).toEqual(ids(roster(count)));
    }
    expect(sizes(randomGroups(roster(5), { groupSize: 2, random: () => 0 }))).toEqual([2, 2, 1]);
  });

  it("暂离玩家不参与分组", () => {
    const result = randomGroups(roster(6, [2, 5]), { groups: 2, random: mulberry32(5) });
    expect(ids(result.flat())).toEqual(["p1", "p3", "p4", "p6"]);
  });

  it("组数超过人数时收敛为单人组，绝不产生空组", () => {
    expect(sizes(randomGroups(roster(3), { groups: 5, random: () => 0 }))).toEqual([1, 1, 1]);
    expect(sizes(randomGroups(roster(2), { groups: 3, random: () => 0 }))).toEqual([1, 1]);
  });

  it("0 人和 1 人边界不炸", () => {
    expect(randomGroups([], { groups: 2, random: () => 0 })).toEqual([]);
    expect(sizes(randomGroups(roster(1), { groups: 2, random: () => 0 }))).toEqual([1]);
    expect(sizes(randomGroups(roster(1), { groupSize: 2, random: () => 0 }))).toEqual([1]);
  });

  it("注入同一个种子结果可复现", () => {
    const players = roster(10);
    expect(randomGroups(players, { groups: 3, random: mulberry32(11) })).toEqual(randomGroups(players, { groups: 3, random: mulberry32(11) }));
  });
});
