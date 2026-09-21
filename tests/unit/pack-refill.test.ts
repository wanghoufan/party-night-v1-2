import { describe, expect, it, vi } from "vitest";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { GameCard, SessionConfig } from "@/lib/domain/schemas";
import {
  PACK_PLAYABLE_THRESHOLD, countPlayablePackCards, ensurePackPlayable, localSeedDeck, refillPackFromSeeds, refillPackInBackground,
} from "@/lib/ai/generate-deck";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";

const config = (overrides: Partial<SessionConfig> = {}): SessionConfig => ({
  players: ["a", "b", "c"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" })),
  relationship: "friends", vibes: ["funny"], intensity: 3, boundaries: DEFAULT_BOUNDARIES, mode: "mixed",
  enabledPackIds: ["truth-dare", "would-you-rather", "pointing-game", "compatibility-test"], ...overrides,
});

const aiCard = (id: string, packId: string, content: string, intensity: GameCard["intensity"] = 2): GameCard => ({
  id, packId, type: packId, content, intensity, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "all", source: "ai",
});

const seedsOf = (packId: string) => BUILTIN_SEED_CARDS.filter((card) => card.packId === packId);

describe("pack-specific refill", () => {
  it("counts only un-played, allowed cards of the target pack", () => {
    const deck = [aiCard("w1", "would-you-rather", "A VS B"), aiCard("w2", "would-you-rather", "C VS D"), aiCard("p1", "pointing-game", "指一个人")];
    expect(countPlayablePackCards(deck, config(), "would-you-rather")).toBe(2);
    expect(countPlayablePackCards(deck, config(), "would-you-rather", ["w1", "w2"])).toBe(0);
  });

  it("keeps seed refill inside the target pack and never duplicates ids", () => {
    const refilled = refillPackFromSeeds([aiCard("w1", "would-you-rather", "A VS B")], config(), "compatibility-test");
    const added = refilled.slice(1);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((card) => card.packId === "compatibility-test")).toBe(true);
    expect(new Set(refilled.map((card) => card.id)).size).toBe(refilled.length);
  });

  it("tops a starved pack up from local seeds immediately, with no network", () => {
    // 八玩法全开时全局 deck 会被截断，默契测试一张 seed 都进不去 —— 正是需要 pack-specific 补位的场景。
    const allPacks = config({ enabledPackIds: ["truth-dare", "most-likely", "never-have", "ai-improv", "would-you-rather", "pointing-game", "compatibility-test", "spin-bottle"] });
    const deck = localSeedDeck(allPacks);
    const before = countPlayablePackCards(deck, allPacks, "compatibility-test");
    const { deck: refilled, added } = ensurePackPlayable(deck, allPacks, "compatibility-test");
    expect(before).toBeLessThan(PACK_PLAYABLE_THRESHOLD);
    expect(added).toBeGreaterThan(0);
    expect(countPlayablePackCards(refilled, allPacks, "compatibility-test")).toBeGreaterThanOrEqual(PACK_PLAYABLE_THRESHOLD);
  });

  it("leaves an already playable pack untouched", () => {
    const deck = seedsOf("would-you-rather");
    expect(ensurePackPlayable(deck, config(), "would-you-rather")).toEqual({ deck, added: 0 });
  });

  it("still respects boundaries when topping up from seeds", () => {
    const strict = config({ boundaries: { ...DEFAULT_BOUNDARIES, noMoneyIncome: true } });
    const refilled = refillPackFromSeeds([], strict, "compatibility-test");
    expect(refilled.length).toBeGreaterThan(0);
    expect(refilled.every((card) => !card.boundaryTags.includes("money"))).toBe(true);
  });
});

describe("background refill", () => {
  const request = vi.fn();

  it("merges only the target pack's provider cards", async () => {
    request.mockResolvedValueOnce([aiCard("new-w", "would-you-rather", "新题 A VS B"), aiCard("new-t", "truth-dare", "别家题")]);
    const deck = await refillPackInBackground({ deck: [aiCard("w1", "would-you-rather", "A VS B")], sessionConfig: config(), packId: "would-you-rather", profile: {} as never, apiKey: "sk-test", sessionId: "s1", request });
    expect(deck.map((card) => card.id)).toEqual(["w1", "new-w"]);
  });

  it("never throws when the provider fails and returns the deck unchanged", async () => {
    const original = [aiCard("w1", "would-you-rather", "A VS B")];
    request.mockRejectedValueOnce(new Error("NETWORK_ERROR"));
    await expect(refillPackInBackground({ deck: original, sessionConfig: config(), packId: "would-you-rather", profile: {} as never, apiKey: "sk-test", sessionId: "s1", request })).resolves.toEqual(original);
  });
});
