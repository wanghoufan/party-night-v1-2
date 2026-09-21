import { describe, expect, it } from "vitest";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import { localSeedDeck } from "@/lib/ai/generate-deck";
import { createSession } from "@/lib/engine/session-engine";
import type { GameCard } from "@/lib/domain/schemas";

describe("custom pack session snapshot", () => {
  it("已开始 Session 不会随后续自定义题卡编辑变化", () => {
    const customCard: GameCard = { id: "custom-card", packId: "custom-pack", type: "custom", content: "原始内容", intensity: 1, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "all", source: "custom" };
    const config = { players: ["a", "b"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" })), relationship: "friends", vibes: ["funny"], intensity: 3 as const, boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ["custom-pack"], mode: "mixed" as const };
    const session = createSession(config, localSeedDeck(config, [customCard]));
    customCard.content = "后续编辑内容";
    expect(session.deckSnapshot[0]?.content).toBe("原始内容");
  });
});
