import { describe, expect, it } from "vitest";
import { BUILTIN_PACK_IDS, DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { GameSession, Player, SessionConfig } from "@/lib/domain/schemas";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import { COMPATIBILITY_PACK_ID, readCompatibilityState } from "@/lib/game-packs/compatibility-test";
import { SPIN_BOTTLE_STATE_KEY, readSpinBottleState } from "@/lib/game-packs/spin-bottle";
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
    expect(switched.currentPackState).toEqual({ "truth-dare": {} });
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
    // 确定性但会铺开的随机源：固定 () => 0 只会在牌堆第一个玩法里打转，测不出“混着出题”。
    let state = 42;
    const random = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
    for (let index = 0; index < 20; index += 1) session = completeRound(startRound(session, random));

    expect(new Set(session.rounds.map((round) => round.packId)).size).toBeGreaterThan(1);
    expect(session.currentPackId).toBe(session.rounds.at(-1)?.packId);
  });

  it("round-trips a switched session through the repository", async () => {
    const switched = switchPack(createSession(config(), BUILTIN_SEED_CARDS), "truth-dare", { enabledPackIds: ["truth-dare"] });
    await sessionRepository.save(switched);
    expect(await sessionRepository.get(switched.id)).toEqual(switched);
    await sessionRepository.delete(switched.id);
  });

  it("deals the switched pack next when the caller pins it (home / in-game entry)", () => {
    const enabled = [...BUILTIN_PACK_IDS, "would-you-rather"];
    const switched = switchPack(createSession(config({ enabledPackIds: enabled, mode: "mixed" }), BUILTIN_SEED_CARDS), "would-you-rather", { enabledPackIds: enabled });
    const dealt = startRound(switched, () => 0, { preferPackIds: ["would-you-rather"] });

    expect(dealt.currentRound?.packId).toBe("would-you-rather");
    expect(dealt.currentPackId).toBe("would-you-rather");
  });

  it("keeps V1.0 mixed rotation when the caller passes no preference", () => {
    const session = createSession(config({ enabledPackIds: [...BUILTIN_PACK_IDS], mode: "mixed" }), BUILTIN_SEED_CARDS);
    const dealt = startRound(session, () => 0);

    expect(["most-likely", "never-have", "truth-dare"]).toContain(dealt.currentRound?.packId);
  });

  it("never lets a preference pull a single session off its current pack", () => {
    const session = createSession(config(), BUILTIN_SEED_CARDS);
    const dealt = startRound(session, () => 0, { preferPackIds: ["truth-dare"] });

    expect(dealt.currentRound?.packId).toBe("never-have");
  });
});

/** GAP-02：pack-local state 按 packId 分键，切玩法只动目标玩法那一格。 */
const COMPATIBILITY_STATE = { playerAId: "a", playerBId: "b", score: 3, rounds: 4 };
const SPIN_STATE = { lastSelectedPlayerId: "b" };

const sessionWithPackStates = (): GameSession => ({
  ...createSession(config({ enabledPackIds: ["never-have", "truth-dare", COMPATIBILITY_PACK_ID, "spin-bottle"] }), BUILTIN_SEED_CARDS),
  currentPackId: COMPATIBILITY_PACK_ID,
  currentPackState: { [COMPATIBILITY_PACK_ID]: COMPATIBILITY_STATE, [SPIN_BOTTLE_STATE_KEY]: SPIN_STATE },
});

describe("switchPack keeps pack-local state of the packs you leave (GAP-02)", () => {
  it("initializes the target pack's own slot without wiping the others", () => {
    const session = sessionWithPackStates();
    const switched = switchPack(session, "truth-dare", { enabledPackIds: ["never-have", "truth-dare", COMPATIBILITY_PACK_ID, "spin-bottle"] });

    expect(switched.currentPackState).toEqual({
      [COMPATIBILITY_PACK_ID]: COMPATIBILITY_STATE,
      [SPIN_BOTTLE_STATE_KEY]: SPIN_STATE,
      "truth-dare": {},
    });
    expect(switched.currentPackState).not.toBe(session.currentPackState);
  });

  it("keeps scoring and pairing of a pack you switched away from", () => {
    const switched = switchPack(sessionWithPackStates(), "never-have", { enabledPackIds: ["never-have", "truth-dare", COMPATIBILITY_PACK_ID, "spin-bottle"] });

    expect(readCompatibilityState(switched)).toEqual(COMPATIBILITY_STATE);
    expect(readSpinBottleState(switched)).toEqual(SPIN_STATE);
  });

  it("resets only the target pack's own slot when switching into it", () => {
    const switched = switchPack(sessionWithPackStates(), "spin-bottle", { enabledPackIds: ["never-have", "truth-dare", COMPATIBILITY_PACK_ID, "spin-bottle"] });

    expect(switched.currentPackState).toEqual({ [COMPATIBILITY_PACK_ID]: COMPATIBILITY_STATE, [SPIN_BOTTLE_STATE_KEY]: {} });
    // 重新进入转瓶子＝从干净的落点起（不会沿用上一次的“避开某人”）
    expect(readSpinBottleState(switched)?.lastSelectedPlayerId).toBeUndefined();
  });

  it("keeps scoring and pairing of the pack you left even after re-entering another pack", () => {
    const enabled = ["never-have", "truth-dare", COMPATIBILITY_PACK_ID, "spin-bottle"];
    const away = switchPack(sessionWithPackStates(), "truth-dare", { enabledPackIds: enabled });
    const back = switchPack(away, COMPATIBILITY_PACK_ID, { enabledPackIds: enabled });

    expect(back.currentPackId).toBe(COMPATIBILITY_PACK_ID);
    // 离开期间另一玩法的 state 一直在；重新进入默契测试则从干净的 state 起（由 UI 走默认配对重建）。
    expect(away.currentPackState?.[COMPATIBILITY_PACK_ID]).toEqual(COMPATIBILITY_STATE);
    expect(readCompatibilityState(back)).toBeUndefined();
  });

  it("round-trips the per-pack state through the repository", async () => {
    const switched = switchPack(sessionWithPackStates(), "truth-dare", { enabledPackIds: ["never-have", "truth-dare", COMPATIBILITY_PACK_ID, "spin-bottle"] });
    await sessionRepository.save(switched);

    const stored = await sessionRepository.get(switched.id);
    expect(stored?.currentPackState).toEqual(switched.currentPackState);
    expect(stored ? readCompatibilityState(stored) : undefined).toEqual(COMPATIBILITY_STATE);
    await sessionRepository.delete(switched.id);
  });
});
