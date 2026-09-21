import { describe, expect, it } from "vitest";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import { RANDOM_LAUNCHER_PACK_ID } from "@/lib/game-packs/random-launcher";
import { completeRound, createSession, startRound } from "@/lib/engine/session-engine";
import { getSessionStage, getStagePackPreference } from "@/lib/engine/stage-controller";

const config = { players: ["a", "b", "c", "d"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" })), relationship: "friends", vibes: ["funny"], intensity: 3 as const, boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ["truth-dare", "most-likely", "never-have", "ai-improv"], mode: "mixed" as const };

describe("20-round mixed session", () => {
  it("mixes packs, persists rounds and never repeats", () => {
    let session = createSession(config, BUILTIN_SEED_CARDS);
    for (let index = 0; index < 20; index += 1) session = completeRound(startRound(session, () => 0));
    expect(session.rounds).toHaveLength(20);
    expect(new Set(session.rounds.map((round) => round.cardId)).size).toBe(20);
    expect(new Set(session.rounds.map((round) => round.packId)).size).toBeGreaterThan(1);
  });

  /** V1.4 R-047：“随机玩一个”不参加混合出题——阶段分布里没有它的槽位，牌堆也抽不到它的卡。 */
  it("keeps the retired launcher out of the mixed rotation entirely", () => {
    for (const stage of ["warm-up", "flow", "heat-up"] as const) {
      expect(getStagePackPreference(stage)).not.toContain(RANDOM_LAUNCHER_PACK_ID);
    }
    let session = createSession(config, BUILTIN_SEED_CARDS);
    expect(getSessionStage(session)).toBe("warm-up");
    for (let index = 0; index < 20; index += 1) session = completeRound(startRound(session, () => 0));

    expect(session.rounds.length).toBe(20);
    expect(session.rounds.every((round) => round.packId !== RANDOM_LAUNCHER_PACK_ID)).toBe(true);
    expect(session.deckSnapshot.some((card) => card.packId === RANDOM_LAUNCHER_PACK_ID)).toBe(false);
  });
});
