import { describe, expect, it } from "vitest";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import { calculateSessionSummary } from "@/lib/engine/session-summary";
import { completeRound, createSession, finishSession, startRound } from "@/lib/engine/session-engine";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";

const config = { players: ["a", "b", "c"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" })), relationship: "friends", vibes: ["funny"], intensity: 3 as const, boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ["truth-dare", "most-likely"], mode: "mixed" as const };

describe("session summary", () => {
  it("matches round history exactly", () => {
    let session = createSession(config, BUILTIN_SEED_CARDS);
    session = completeRound(startRound(session, () => 0));
    session = completeRound(startRound(session, () => 0));
    const summary = calculateSessionSummary(finishSession(session));
    expect(summary.totalRounds).toBe(2);
    expect(Object.values(summary.packDistribution).reduce((sum, count) => sum + count, 0)).toBe(2);
    expect(summary.playerCount).toBe(3);
  });
});
