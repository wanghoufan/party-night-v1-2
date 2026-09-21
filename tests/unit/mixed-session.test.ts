import { describe, expect, it } from "vitest";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import { completeRound, createSession, startRound } from "@/lib/engine/session-engine";

const config = { players: ["a", "b", "c", "d"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" })), relationship: "friends", vibes: ["funny"], intensity: 3 as const, boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ["truth-dare", "most-likely", "never-have", "ai-improv"], mode: "mixed" as const };

describe("20-round mixed session", () => {
  it("mixes packs, persists rounds and never repeats", () => {
    let session = createSession(config, BUILTIN_SEED_CARDS);
    for (let index = 0; index < 20; index += 1) session = completeRound(startRound(session, () => 0));
    expect(session.rounds).toHaveLength(20);
    expect(new Set(session.rounds.map((round) => round.cardId)).size).toBe(20);
    expect(new Set(session.rounds.map((round) => round.packId)).size).toBeGreaterThan(1);
  });
});
