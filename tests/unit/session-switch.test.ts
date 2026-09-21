import { describe, expect, it } from "vitest";
import { BUILTIN_PACK_IDS, DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { Player, SessionConfig } from "@/lib/domain/schemas";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import { completeRound, createSession, pauseSession, startRound, switchPack } from "@/lib/engine/session-engine";
import { sessionRepository } from "@/lib/storage/session-repository";

const players = (count: number): Player[] =>
  ["a", "b", "c", "d"].slice(0, count).map((id) => ({ id, displayName: `玩家${id}`, active: true, createdAt: "x", lastUsedAt: "x" }));

const config = (overrides: Partial<SessionConfig> = {}): SessionConfig => ({
  players: players(3), relationship: "friends", vibes: ["funny"], intensity: 3,
  boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ["never-have"], mode: "single", ...overrides,
});

describe("switchPack", () => {
  it("is a no-op when the pack is already current", () => {
    const session = createSession(config(), BUILTIN_SEED_CARDS);
    expect(switchPack(session, "never-have")).toBe(session);
  });

  it("refuses to switch a session that is not active", () => {
    const paused = pauseSession(createSession(config(), BUILTIN_SEED_CARDS));
    expect(switchPack(paused, "truth-dare", { enabledPackIds: ["truth-dare"] })).toBe(paused);
  });

  it("refuses a pack that is disabled in pack settings", () => {
    const session = createSession(config(), BUILTIN_SEED_CARDS);
    expect(switchPack(session, "truth-dare", { enabledPackIds: ["never-have"] })).toBe(session);
  });

  it("refuses a pack the player count cannot support", () => {
    const session = createSession(config({ players: players(2), enabledPackIds: ["never-have", "most-likely"] }), BUILTIN_SEED_CARDS);
    expect(switchPack(session, "most-likely", { enabledPackIds: ["never-have", "most-likely"] })).toBe(session);
  });

  it("switches once the player count is supported", () => {
    const session = createSession(config(), BUILTIN_SEED_CARDS);
    const switched = switchPack(session, "most-likely", { enabledPackIds: ["never-have", "most-likely"] });
    expect(switched.currentPackId).toBe("most-likely");
  });

  it("keeps session id, config, used cards, deck and earlier history", () => {
    let session = completeRound(startRound(createSession(config(), BUILTIN_SEED_CARDS), () => 0));
    const before = {
      id: session.id,
      config: structuredClone(session.config),
      rounds: structuredClone(session.rounds),
      usedCardIds: [...session.usedCardIds],
      deckSnapshot: structuredClone(session.deckSnapshot),
    };

    session = startRound(session, () => 0);
    const switched = switchPack(session, "truth-dare", { enabledPackIds: ["never-have", "truth-dare"] });

    expect(switched.id).toBe(before.id);
    expect(switched.config).toEqual(before.config);
    expect(switched.mode).toBe(session.mode);
    expect(switched.usedCardIds).toEqual(session.usedCardIds);
    expect(switched.deckSnapshot).toEqual(before.deckSnapshot);
    expect(switched.rounds.slice(0, before.rounds.length)).toEqual(before.rounds);
  });

  it("closes the abandoned round as skipped and clears the open round", () => {
    const session = startRound(createSession(config(), BUILTIN_SEED_CARDS), () => 0);
    const abandoned = session.currentRound!;

    const switched = switchPack(session, "truth-dare", { enabledPackIds: ["never-have", "truth-dare"] });

    expect(switched.rounds).toHaveLength(1);
    expect(switched.rounds[0]).toMatchObject({ id: abandoned.id, cardId: abandoned.cardId, packId: "never-have", status: "skipped" });
    expect(switched.currentRound).toBeUndefined();
    expect(switched.currentPackId).toBe("truth-dare");
    expect(switched.currentPackState).toEqual({});
  });

  it("deals the next card from the switched pack inside the same session", () => {
    const session = createSession(config(), BUILTIN_SEED_CARDS);
    const switched = switchPack(session, "truth-dare", { enabledPackIds: ["truth-dare"] });
    const dealt = startRound(switched, () => 0);

    expect(dealt.id).toBe(session.id);
    expect(dealt.currentRound?.packId).toBe("truth-dare");
    expect(dealt.currentPackId).toBe("truth-dare");
  });

  it("keeps mixed sessions mixed while tracking the current pack", () => {
    let session = createSession(config({ enabledPackIds: [...BUILTIN_PACK_IDS], mode: "mixed" }), BUILTIN_SEED_CARDS);
    for (let index = 0; index < 20; index += 1) session = completeRound(startRound(session, () => 0));

    expect(new Set(session.rounds.map((round) => round.packId)).size).toBeGreaterThan(1);
    expect(session.currentPackId).toBe(session.rounds.at(-1)?.packId);
  });

  it("round-trips a switched session through the repository", async () => {
    const switched = switchPack(createSession(config(), BUILTIN_SEED_CARDS), "truth-dare", { enabledPackIds: ["truth-dare"] });
    await sessionRepository.save(switched);
    expect(await sessionRepository.get(switched.id)).toEqual(switched);
    await sessionRepository.delete(switched.id);
  });
});
