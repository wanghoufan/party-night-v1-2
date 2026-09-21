import { describe, expect, it } from "vitest";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import { createSession, startRound, updateIntensity } from "@/lib/engine/session-engine";
import type { GameCard } from "@/lib/domain/schemas";

const cards: GameCard[] = [1, 5].map((intensity) => ({ id: `i${intensity}`, packId: "truth-dare", type: "truth", content: `level ${intensity}`, intensity: intensity as 1 | 5, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "all", source: "builtin" }));
const config = { players: ["a", "b"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" })), relationship: "friends", vibes: ["funny"], intensity: 5 as const, boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ["truth-dare"], mode: "single" as const };

describe("intensity update", () => {
  it("filters future high-intensity cards without deleting the snapshot", () => {
    const lowered = updateIntensity(createSession(config, cards), 1);
    expect(lowered.deckSnapshot).toHaveLength(2);
    expect(startRound(lowered, () => .99).currentRound?.cardId).toBe("i1");
  });
});
