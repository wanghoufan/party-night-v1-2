import { describe, expect, it } from "vitest";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import { buildPlayableDeck, localSeedDeck } from "@/lib/ai/generate-deck";

const config = { players: ["a", "b", "c"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" })), relationship: "friends", vibes: ["funny"], intensity: 3 as const, boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ["truth-dare", "most-likely", "never-have", "ai-improv"], mode: "mixed" as const };

describe("generation fallback", () => {
  it("returns a playable seed deck for invalid AI output", () => expect(buildPlayableDeck({ nope: true }, config).length).toBeGreaterThanOrEqual(20));
  it("provides enough offline rounds", () => expect(localSeedDeck(config).length).toBeGreaterThanOrEqual(20));
  it("drops AI cards from packs not enabled for the session", () => {
    const card = { id: "foreign", packId: "not-enabled", type: "x", content: "不应进入本局", intensity: 1 as const, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "all" as const, source: "ai" as const };
    expect(buildPlayableDeck({ cards: [card] }, config).some((item) => item.id === card.id)).toBe(false);
  });
});
