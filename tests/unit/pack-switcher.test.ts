import { describe, expect, it } from "vitest";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { CustomGamePack, Player, SessionConfig } from "@/lib/domain/schemas";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import { BUILTIN_GAME_PACKS } from "@/lib/game-packs/registry";
import { createSession } from "@/lib/engine/session-engine";
import { enabledPackIds, listSwitchablePacks, switchPackAndDeal } from "@/lib/engine/pack-switcher";

const players = (total: number, active = total): Player[] =>
  ["a", "b", "c", "d"].slice(0, total).map((id, index) => ({ id, displayName: `玩家${id}`, active: index < active, createdAt: "x", lastUsedAt: "x" }));

const config = (overrides: Partial<SessionConfig> = {}): SessionConfig => ({
  players: players(4), relationship: "friends", vibes: ["funny"], intensity: 3,
  boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ["never-have"], mode: "single", ...overrides,
});

const customPack = (id: string, enabled: boolean, minPlayers = 2): CustomGamePack => ({
  schemaVersion: 1,
  definition: { id, name: `自定义${id}`, icon: "🎲", enabledByDefault: true, mixable: true, minPlayers, supportedCardTypes: ["custom"], weight: 1, source: "custom" },
  cards: [], enabled, updatedAt: "x",
});

const builtinIds = BUILTIN_GAME_PACKS.map((pack) => pack.id);

describe("main-session pack switcher candidates", () => {
  it("offers every enabled built-in pack the active players can support", () => {
    const session = createSession(config({ players: players(4) }), BUILTIN_SEED_CARDS);
    expect(listSwitchablePacks(session).map((pack) => pack.id)).toEqual(builtinIds);
  });

  it("drops packs whose minPlayers exceeds the active players", () => {
    const session = createSession(config({ players: players(2) }), BUILTIN_SEED_CARDS);
    const ids = listSwitchablePacks(session).map((pack) => pack.id);
    expect(ids).not.toContain("most-likely");
    expect(ids).not.toContain("pointing-game");
    expect(ids).toContain("spin-bottle");
  });

  it("counts active players only", () => {
    const session = createSession(config({ players: players(3, 2) }), BUILTIN_SEED_CARDS);
    expect(listSwitchablePacks(session).map((pack) => pack.id)).not.toContain("most-likely");
  });

  it("lists enabled custom packs but hides disabled ones", () => {
    const session = createSession(config(), BUILTIN_SEED_CARDS);
    const custom = [customPack("custom-on", true), customPack("custom-off", false)];
    const ids = listSwitchablePacks(session, custom).map((pack) => pack.id);
    expect(ids).toContain("custom-on");
    expect(ids).not.toContain("custom-off");
  });

  it("drops a custom pack the active players cannot support", () => {
    const session = createSession(config({ players: players(2) }), BUILTIN_SEED_CARDS);
    expect(listSwitchablePacks(session, [customPack("custom-big", true, 5)]).map((pack) => pack.id)).not.toContain("custom-big");
  });

  it("keeps marking the current pack even when the player count no longer fits", () => {
    const session = createSession(config({ players: players(2) }), BUILTIN_SEED_CARDS);
    const shrunk = { ...session, currentPackId: "most-likely" };
    const ids = listSwitchablePacks(shrunk).map((pack) => pack.id);
    expect(ids).toContain("most-likely");
    expect(ids.indexOf("most-likely")).toBe(0);
  });

  it("returns the enabled pack ids the switcher may switch into", () => {
    expect(enabledPackIds([])).toEqual(builtinIds);
    expect(enabledPackIds([customPack("custom-on", true), customPack("custom-off", false)])).toEqual([...builtinIds, "custom-on"]);
  });

  it("drops built-in packs the user disabled in the pack page (T199 / FR-044)", () => {
    expect(enabledPackIds([], ["truth-dare", "most-likely"])).toEqual(builtinIds.filter((id) => id !== "truth-dare" && id !== "most-likely"));

    const session = createSession(config({ players: players(4) }), BUILTIN_SEED_CARDS);
    expect(listSwitchablePacks(session, [], ["most-likely"]).map((pack) => pack.id)).not.toContain("most-likely");
    expect(switchPackAndDeal(session, "most-likely", [], () => 0, {}, ["most-likely"])).toBe(session);
  });
});

describe("switchPackAndDeal", () => {
  const singleNevrHave = () => createSession(config({ enabledPackIds: ["never-have"] }), BUILTIN_SEED_CARDS.filter((card) => card.packId === "never-have"));

  it("refills the target pack from local seeds and deals it inside the same session", () => {
    const session = singleNevrHave();
    const next = switchPackAndDeal(session, "would-you-rather", [], () => 0);

    expect(next.id).toBe(session.id);
    expect(next.currentPackId).toBe("would-you-rather");
    expect(next.currentRound?.packId).toBe("would-you-rather");
    expect(next.deckSnapshot.some((card) => card.packId === "would-you-rather")).toBe(true);
    expect(next.deckSnapshot.filter((card) => card.packId === "never-have")).toHaveLength(session.deckSnapshot.length);
    expect(next.config).toEqual(session.config);
  });

  it("leaves the session untouched when the pack is not switchable", () => {
    const session = createSession(config({ players: players(2), enabledPackIds: ["never-have"] }), BUILTIN_SEED_CARDS);
    expect(switchPackAndDeal(session, "most-likely")).toBe(session);
  });

  it("tolerates a pack with no local cards instead of throwing", () => {
    const session = singleNevrHave();
    const next = switchPackAndDeal(session, "spin-bottle", [], () => 0);

    expect(next.currentPackId).toBe("spin-bottle");
    expect(next.currentRound).toBeUndefined();
    expect(next.deckSnapshot).toEqual(session.deckSnapshot);
  });
});
