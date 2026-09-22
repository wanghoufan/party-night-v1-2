import { describe, expect, it } from "vitest";
import { buildPlayableDeck } from "@/lib/ai/generate-deck";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { GameCard, SessionConfig } from "@/lib/domain/schemas";

/** 需要卡的内置玩法（转瓶子/随机玩一个不出卡），按 registry 固定顺序。 */
const CARD_PACK_IDS = ["truth-dare", "most-likely", "never-have", "would-you-rather", "pointing-game", "compatibility-test"];
const ALL_PACK_IDS = ["truth-dare", "most-likely", "never-have", "ai-improv", "would-you-rather", "pointing-game", "compatibility-test", "spin-bottle"];

const config = (overrides: Partial<SessionConfig> = {}): SessionConfig => ({
  players: ["a", "b", "c", "d"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" })),
  relationship: "friends", vibes: ["funny"], intensity: 5,
  boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ALL_PACK_IDS, mode: "mixed", ...overrides,
});

const aiCard = (index: number): GameCard => ({
  id: `ai-truth-${index}`, packId: "truth-dare", type: "truth", content: `AI 真心话第 ${index} 题`,
  intensity: 2, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "single", source: "ai",
});

describe("buildPlayableDeck round-robin across enabled packs", () => {
  it("keeps the deck at targetCount and gives every card-producing pack a slot", () => {
    const deck = buildPlayableDeck({ cards: [] }, config(), 40);

    expect(deck).toHaveLength(40);
    for (const packId of CARD_PACK_IDS) expect(deck.some((card) => card.packId === packId), packId).toBe(true);
  });

  it("does not let one pack (or a whole AI batch) starve the others", () => {
    // 反例：旧实现按 AI→custom→seeds 顺序拼接后 slice，60 张 truth-dare 的 AI 卡会把其余玩法全部挤掉。
    const raw = { cards: Array.from({ length: 60 }, (_, index) => aiCard(index + 1)) };
    const deck = buildPlayableDeck(raw, config(), 40);

    expect(deck).toHaveLength(40);
    for (const packId of CARD_PACK_IDS.filter((id) => id !== "truth-dare")) {
      expect(deck.some((card) => card.packId === packId), packId).toBe(true);
    }
  });

  it("respects a smaller targetCount and the enabled-pack order", () => {
    const deck = buildPlayableDeck({ cards: [] }, config(), CARD_PACK_IDS.length);

    expect(deck).toHaveLength(CARD_PACK_IDS.length);
    expect(deck.map((card) => card.packId)).toEqual(CARD_PACK_IDS);
  });

  it("only deals packs that are enabled", () => {
    const deck = buildPlayableDeck({ cards: [] }, config({ enabledPackIds: ["truth-dare", "would-you-rather"] }), 40);

    expect(deck.every((card) => ["truth-dare", "would-you-rather"].includes(card.packId))).toBe(true);
    expect(new Set(deck.map((card) => card.packId))).toEqual(new Set(["truth-dare", "would-you-rather"]));
  });
});
