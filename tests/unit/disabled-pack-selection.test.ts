import { describe, expect, it } from "vitest";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { Player, SessionConfig } from "@/lib/domain/schemas";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import { completeRound, createSession, startRound, switchPack } from "@/lib/engine/session-engine";

const players = (count: number): Player[] =>
  ["a", "b", "c", "d"].slice(0, count).map((id) => ({ id, displayName: `玩家${id}`, active: true, createdAt: "x", lastUsedAt: "x" }));

const config = (overrides: Partial<SessionConfig> = {}): SessionConfig => ({
  players: players(4), relationship: "friends", vibes: ["funny"], intensity: 3,
  boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ["truth-dare"], mode: "mixed", ...overrides,
});

/** 混合模式候选池＝enabledPackIds；禁用包无论是否已注册、是否有 seed 都不得被抽到。 */
describe("disabled packs stay out of the mixed candidate pool", () => {
  it("never deals a card from a pack that is not enabled", () => {
    const enabled = ["truth-dare", "would-you-rather"];
    let session = createSession(config({ enabledPackIds: enabled }), BUILTIN_SEED_CARDS);
    for (let index = 0; index < 40; index += 1) session = completeRound(startRound(session, () => 0));

    expect(session.rounds.length).toBeGreaterThan(0);
    expect(session.rounds.every((round) => enabled.includes(round.packId))).toBe(true);
    expect(session.rounds.some((round) => round.packId === "would-you-rather")).toBe(true);
  });

  it("drops the seed cards of a disabled new pack even though they sit in the deck", () => {
    let session = createSession(config({ enabledPackIds: ["truth-dare", "pointing-game"], players: players(3) }), BUILTIN_SEED_CARDS);
    const disabled = ["would-you-rather", "compatibility-test", "spin-bottle"];
    for (let index = 0; index < 40; index += 1) session = completeRound(startRound(session, () => 0));

    expect(session.rounds.length).toBeGreaterThan(0);
    expect(session.rounds.some((round) => disabled.includes(round.packId))).toBe(false);
  });
});

describe("the main-session switcher refuses disabled packs", () => {
  it("rejects disabled new packs while the current pack stays put", () => {
    const session = createSession(config({ enabledPackIds: ["truth-dare"] }), BUILTIN_SEED_CARDS);
    expect(switchPack(session, "compatibility-test", { enabledPackIds: ["truth-dare"] })).toBe(session);
    expect(switchPack(session, "spin-bottle", { enabledPackIds: ["truth-dare"] })).toBe(session);
  });

  it("switches into a new pack once it is enabled and the player count fits", () => {
    const enabled = ["truth-dare", "pointing-game"];
    const session = createSession(config({ enabledPackIds: enabled, players: players(3) }), BUILTIN_SEED_CARDS);
    expect(switchPack(session, "pointing-game", { enabledPackIds: enabled }).currentPackId).toBe("pointing-game");
  });
});
