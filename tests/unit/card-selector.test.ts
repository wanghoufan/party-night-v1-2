import { describe, expect, it } from "vitest";
import { INTENSITY_WEIGHT, pickWeightedCard, selectCard } from "@/lib/engine/card-selector";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { GameCard, Intensity } from "@/lib/domain/schemas";

const card = (id: string, intensity = 1, boundaryTags: GameCard["boundaryTags"] = []): GameCard => ({ id, packId: "truth-dare", type: "truth", content: id, intensity: intensity as 1, tags: [], boundaryTags, minPlayers: 2, participantMode: "single", source: "builtin" });
const base = { usedCardIds: [] as string[], enabledPackIds: ["truth-dare"], playerCount: 4, intensity: 3 as const, boundaries: { ...DEFAULT_BOUNDARIES, noAlcoholPenalty: false }, random: () => 0 };

describe("card selector", () => {
  it("never selects a used card", () => expect(selectCard({ ...base, cards: [card("a"), card("b")], usedCardIds: ["a"] })?.id).toBe("b"));
  it("filters by intensity", () => expect(selectCard({ ...base, cards: [card("hot", 5)] })).toBeUndefined());
  it("filters blocked boundary tags", () => expect(selectCard({ ...base, cards: [card("drink", 1, ["alcohol"])], boundaries: { ...base.boundaries, noAlcoholPenalty: true } })).toBeUndefined());
});

/** 08 新题纲 §七：抽法只有一套——按 2^(i-1) 加权，超档照旧过滤，缺口由邻近档就近代补。 */
describe("指数陡坡抽法（08 §七）", () => {
  const weights: Record<string, Intensity> = { t1: 1, t2: 2, t3: 3, t4: 4, t5: 5 };
  const pool: GameCard[] = Object.entries(weights).map(([id, intensity]) => card(id, intensity));
  const pick = (intensity: Intensity, random: () => number) =>
    selectCard({ ...base, intensity, cards: pool, random })?.id;

  it("uses 2^(i-1) as the only weight table", () => {
    expect(INTENSITY_WEIGHT).toEqual({ 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 });
  });

  it("lets the high tiers dominate once they are allowed", () => {
    // 池顺序 t1..t5，权重 1/2/4/8/16（合计 31）：5 档独占 16/31 ≈ 52%，低档只剩零头
    expect(pick(5, () => 0)).toBe("t1");
    expect(pick(5, () => 0.05)).toBe("t2");
    expect(pick(5, () => 0.2)).toBe("t3");
    expect(pick(5, () => 0.3)).toBe("t4");
    expect(pick(5, () => 0.5)).toBe("t5");
    expect(INTENSITY_WEIGHT[5] / Object.values(INTENSITY_WEIGHT).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(16 / 31, 5);
  });

  it("renormalizes onto the nearby tiers when a tier is gone（就近代补配满）", () => {
    const withoutTop = pool.filter((item) => item.intensity !== 5); // t1..t4，权重 1/2/4/8（合计 15）
    expect(pickWeightedCard(withoutTop, () => 0.02).id).toBe("t1");
    expect(pickWeightedCard(withoutTop, () => 0.1).id).toBe("t2");
    expect(pickWeightedCard(withoutTop, () => 0.3).id).toBe("t3");
    expect(pickWeightedCard(withoutTop, () => 0.9).id).toBe("t4");
    // 只剩低档时也不会空转：权重在剩下的档上重新归一
    expect(pickWeightedCard([card("t2", 2), card("t1", 1)], () => 0.6).id).toBe("t2");
    expect(pickWeightedCard([card("t2", 2), card("t1", 1)], () => 0.7).id).toBe("t1");
  });
});
