import { describe, expect, it } from "vitest";
import { selectCard } from "@/lib/engine/card-selector";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { GameCard } from "@/lib/domain/schemas";

const card = (id: string, intensity = 1, boundaryTags: GameCard["boundaryTags"] = []): GameCard => ({ id, packId: "truth-dare", type: "truth", content: id, intensity: intensity as 1, tags: [], boundaryTags, minPlayers: 2, participantMode: "single", source: "builtin" });
const base = { usedCardIds: [] as string[], enabledPackIds: ["truth-dare"], playerCount: 4, intensity: 3 as const, boundaries: { ...DEFAULT_BOUNDARIES, noAlcoholPenalty: false }, random: () => 0 };

describe("card selector", () => {
  it("never selects a used card", () => expect(selectCard({ ...base, cards: [card("a"), card("b")], usedCardIds: ["a"] })?.id).toBe("b"));
  it("filters by intensity", () => expect(selectCard({ ...base, cards: [card("hot", 5)] })).toBeUndefined());
  it("filters blocked boundary tags", () => expect(selectCard({ ...base, cards: [card("drink", 1, ["alcohol"])], boundaries: { ...base.boundaries, noAlcoholPenalty: true } })).toBeUndefined());
});
