import { describe, expect, it } from "vitest";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { CustomGamePack, Player, SessionConfig } from "@/lib/domain/schemas";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import { BUILTIN_GAME_PACKS } from "@/lib/game-packs/registry";
import { createSession } from "@/lib/engine/session-engine";
import { listSwitchablePacks, mixedCandidatePackIds, packMinPlayersNotice, switchPackAndDeal } from "@/lib/engine/pack-switcher";

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
  it("offers every registered pack the active players can support", () => {
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

  it("returns the mixed candidates AI dealing may use (launcher itself excluded)", () => {
    expect(mixedCandidatePackIds([])).toEqual(builtinIds.filter((id) => id !== "ai-improv"));
    expect(mixedCandidatePackIds([customPack("custom-on", true), customPack("custom-off", false)])).toEqual([...builtinIds.filter((id) => id !== "ai-improv"), "custom-on"]);
  });

  it("开关只圈混合候选：主局 switcher 与主动切换照样能选到被关闭的玩法（R-057）", () => {
    const disabled = ["truth-dare", "most-likely"];
    expect(mixedCandidatePackIds([], disabled)).toEqual(builtinIds.filter((id) => !disabled.includes(id) && id !== "ai-improv"));

    const session = createSession(config({ players: players(4) }), BUILTIN_SEED_CARDS);
    expect(listSwitchablePacks(session, []).map((pack) => pack.id)).toContain("most-likely");
    expect(switchPackAndDeal(session, "most-likely", [], () => 0).currentPackId).toBe("most-likely");
  });

  it("single / mixed 两种 mode 的 switcher 候选一致，不受 mixable 限制（R-057）", () => {
    const single = createSession(config({ players: players(4), mode: "single" }), BUILTIN_SEED_CARDS);
    const mixed = createSession(config({ players: players(4), mode: "mixed" }), BUILTIN_SEED_CARDS);
    expect(listSwitchablePacks(single).map((pack) => pack.id)).toEqual(listSwitchablePacks(mixed).map((pack) => pack.id));
    expect(listSwitchablePacks(single).map((pack) => pack.id)).toContain("spin-bottle");
  });
});

/**
 * P1（RC 前必修）：玩法准入必须按 **在场人数** 收口（AI-MATRIX-PLAN §1，players < minPlayers 的玩法不生成）。
 * 否则 2 人局直选 pointing-game / most-likely 会走到「生成 0 张卡 → 耗尽死局」。
 */
describe("混合候选与直选拦截按在场人数过滤", () => {
  it("混合候选按 active 人数收口：2 人局不再包含 pointing-game / most-likely", () => {
    const three = mixedCandidatePackIds([], [], 3);
    expect(three).toContain("pointing-game");
    expect(three).toContain("most-likely");

    const two = mixedCandidatePackIds([], [], 2);
    expect(two).not.toContain("pointing-game");
    expect(two).not.toContain("most-likely");
    expect(two).toContain("truth-dare");
    expect(two).toContain("never-have");

    // 6 人局照旧全量（高于门槛的玩法一个不少）
    expect(mixedCandidatePackIds([], [], 6)).toEqual(three);
  });

  it("缺省 playerCount 维持全局开关口径（不按人数过滤）", () => {
    expect(mixedCandidatePackIds([])).toContain("pointing-game");
    expect(mixedCandidatePackIds([])).toContain("most-likely");
  });

  it("自定义玩法同样按人数收口，且仍受关闭名单影响", () => {
    const custom = [customPack("custom-big", true, 5), customPack("custom-small", true, 2)];
    const ids = mixedCandidatePackIds(custom, [], 2);
    expect(ids).not.toContain("custom-big");
    expect(ids).toContain("custom-small");
    expect(mixedCandidatePackIds(custom, ["custom-small"], 2)).not.toContain("custom-small");
  });

  it("packMinPlayersNotice：人数不够给一句「至少需要 N 人」拦截文案", () => {
    expect(packMinPlayersNotice("pointing-game", 2)).toMatch(/「指人游戏」至少需要 3 人/);
    expect(packMinPlayersNotice("most-likely", 2)).toMatch(/「谁最可能」至少需要 3 人/);
    expect(packMinPlayersNotice("custom-big", 2, [customPack("custom-big", true, 5)])).toMatch(/至少需要 5 人/);
  });

  it("packMinPlayersNotice：够玩或玩法未知一律返回 undefined（未知 id 交原回落逻辑）", () => {
    expect(packMinPlayersNotice("pointing-game", 3)).toBeUndefined();
    expect(packMinPlayersNotice("pointing-game", 6)).toBeUndefined();
    expect(packMinPlayersNotice("spin-bottle", 2)).toBeUndefined();
    expect(packMinPlayersNotice("not-a-pack", 2)).toBeUndefined();
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

  it("不碰 config.enabledPackIds：切玩法不重写本局的混合快照（R-056）", () => {
    const session = createSession(config({ enabledPackIds: ["never-have", "truth-dare"], mode: "mixed" }), BUILTIN_SEED_CARDS);
    const next = switchPackAndDeal(session, "spin-bottle", [], () => 0);

    expect(next.config).toEqual(session.config);
    expect(next.config.enabledPackIds).toEqual(["never-have", "truth-dare"]);
  });
});
