import { describe, expect, it } from "vitest";
import { BOUNDARIES, DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import { filterCards } from "@/lib/ai/safety-filter";
import type { GameCard } from "@/lib/domain/schemas";

describe("boundary matrix", () => {
  it.each(BOUNDARIES)("blocks $tag when $key is enabled", ({ key, tag }) => {
    const card: GameCard = { id: tag, packId: "p", type: "x", content: "安全示例", intensity: 1, tags: [], boundaryTags: [tag], minPlayers: 2, participantMode: "all", source: "ai" };
    expect(filterCards([card], { boundaries: { ...DEFAULT_BOUNDARIES, [key]: true }, intensity: 5, playerCount: 4 })).toHaveLength(0);
  });
});
