import { describe, expect, it } from "vitest";
import v10Fixture from "../fixtures/ai-deck-v1.0.json";
import newPacksFixture from "../fixtures/ai-deck-v1.1-new-packs.json";
import { aiDeckResponseSchema } from "@/lib/ai/card-schema";
import { buildPlayableDeck } from "@/lib/ai/generate-deck";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { SessionConfig } from "@/lib/domain/schemas";

const config = (enabledPackIds: string[], overrides: Partial<SessionConfig> = {}): SessionConfig => ({
  players: ["a", "b", "c", "d"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" })),
  relationship: "friends", vibes: ["funny"], intensity: 3,
  boundaries: { ...DEFAULT_BOUNDARIES, noPhysicalContact: true, noPublicPosting: true },
  enabledPackIds, mode: "mixed", ...overrides,
});

const V10_PACK_IDS = ["truth-dare", "most-likely", "never-have", "ai-improv"];

describe("V1.0 AI deck regression (four packs unchanged)", () => {
  it("parses the frozen V1.0 payload without touching a single card", () => {
    const parsed = aiDeckResponseSchema.parse(v10Fixture);
    expect(parsed.cards).toHaveLength(4);
    parsed.cards.forEach((card, index) => expect(card).toEqual(v10Fixture.cards[index]));
  });

  it("keeps the V1.0 payload first and in order when building a V1.0 deck", () => {
    const deck = buildPlayableDeck(v10Fixture, config(V10_PACK_IDS));
    expect(deck.slice(0, 4).map((card) => card.id)).toEqual(v10Fixture.cards.map((card) => card.id));
  });

  it("keeps V1.0 pack semantics: content, card type, participant mode and source", () => {
    const byId = new Map(aiDeckResponseSchema.parse(v10Fixture).cards.map((card) => [card.id, card]));
    expect(byId.get("ai-truth-1")).toMatchObject({ packId: "truth-dare", type: "truth", participantMode: "single", source: "ai" });
    expect(byId.get("ai-likely-1")).toMatchObject({ packId: "most-likely", type: "vote", participantMode: "all" });
    expect(byId.get("ai-never-1")).toMatchObject({ packId: "never-have", type: "statement", participantMode: "all" });
    expect(byId.get("ai-improv-1")).toMatchObject({ packId: "ai-improv", type: "improv", participantMode: "single" });
  });

  it("drops V1.0 AI cards of disabled packs as before", () => {
    const deck = buildPlayableDeck(v10Fixture, config(["truth-dare"]));
    expect(deck.some((card) => card.id === "ai-likely-1")).toBe(false);
    expect(deck.some((card) => card.id === "ai-truth-1")).toBe(true);
  });
});

describe("V1.1 new-pack AI deck regression", () => {
  const NEW_PACK_IDS = ["would-you-rather", "pointing-game", "compatibility-test"];

  it("normalizes every structured fixture card into a playable GameCard", () => {
    const parsed = aiDeckResponseSchema.parse(newPacksFixture);
    expect(parsed.cards).toEqual([
      expect.objectContaining({ id: "ai-wyr-1", content: "凌晨三点吃火锅 VS 清晨六点看日出", participantMode: "all", minPlayers: 2, source: "ai" }),
      expect.objectContaining({ id: "ai-point-1", content: "指一个你觉得今晚最有梗的人。", participantMode: "all", minPlayers: 3, source: "ai" }),
      expect.objectContaining({ id: "ai-compat-1", content: "对方最讨厌的食物是什么？", participantMode: "pair", minPlayers: 2, source: "ai" }),
    ]);
  });

  it("feeds the new packs into a playable deck alongside the V1.0 packs", () => {
    const deck = buildPlayableDeck(newPacksFixture, config([...V10_PACK_IDS, ...NEW_PACK_IDS], { players: ["a", "b", "c"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" })) }));
    for (const id of ["ai-wyr-1", "ai-point-1", "ai-compat-1"]) expect(deck.some((card) => card.id === id)).toBe(true);
  });

  it("stays stable when the normalized deck travels back through the schema (route → client)", () => {
    const once = aiDeckResponseSchema.parse(newPacksFixture);
    const twice = aiDeckResponseSchema.parse(once);
    expect(twice.cards).toEqual(once.cards);
  });
});
