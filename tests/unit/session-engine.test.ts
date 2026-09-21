import { describe, expect, it } from "vitest";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import { completeRound, createSession, finishSession, skipRound, startRound, swapRound } from "@/lib/engine/session-engine";

const config = {
  players: ["a", "b", "c"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" })),
  relationship: "friends", vibes: ["funny"], intensity: 3 as const,
  boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ["truth-dare", "most-likely", "never-have", "ai-improv"], mode: "mixed" as const,
};

describe("session engine", () => {
  it.each([["completed", completeRound], ["swapped", swapRound], ["skipped", skipRound]] as const)("records %s transitions", (status, resolve) => {
    const started = startRound(createSession(config, BUILTIN_SEED_CARDS), () => 0);
    const ended = resolve(started);
    expect(ended.rounds[0]?.status).toBe(status);
    expect(ended.currentRound).toBeUndefined();
  });
  it("does not repeat cards", () => {
    let session = createSession(config, BUILTIN_SEED_CARDS);
    for (let i = 0; i < 10; i += 1) session = completeRound(startRound(session, () => 0));
    expect(new Set(session.rounds.map((round) => round.cardId)).size).toBe(10);
  });
  it("finishes cleanly", () => expect(finishSession(createSession(config, BUILTIN_SEED_CARDS)).status).toBe("finished"));
});
