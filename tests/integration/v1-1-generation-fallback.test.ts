import { afterEach, describe, expect, it, vi } from "vitest";
import newPacksFixture from "../fixtures/ai-deck-v1.1-new-packs.json";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { GameCard, SessionConfig } from "@/lib/domain/schemas";
import { buildPlayableDeck, countPlayablePackCards, ensurePackPlayable, localSeedDeck, requestDeckWithFallback } from "@/lib/ai/generate-deck";
import type { AIProviderProfile } from "@/lib/ai/provider";

const NEW_AI_PACK_IDS = ["would-you-rather", "pointing-game", "compatibility-test"];
const ALL_PACK_IDS = ["truth-dare", "most-likely", "never-have", "ai-improv", ...NEW_AI_PACK_IDS, "spin-bottle"];

const config: SessionConfig = {
  players: ["a", "b", "c", "d"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" })),
  relationship: "friends", vibes: ["wild"], intensity: 4, boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ALL_PACK_IDS, mode: "mixed",
};

const profile = { id: "p1", type: "deepseek-official", name: "DeepSeek", baseUrl: "https://api.deepseek.com", modelId: "deepseek-chat", protocol: "openai-chat-completions", isDefault: true, experimental: false, autoFallback: true, enabled: true, updatedAt: "x" } as AIProviderProfile;

const request = { profile, apiKey: "sk-integration-test", sessionConfig: config, sessionId: "session-1" };

afterEach(() => vi.unstubAllGlobals());

describe("V1.1 generation fallback", () => {
  it("keeps AI cards generated for the new packs in the playable deck", () => {
    const deck = buildPlayableDeck(newPacksFixture, config);
    for (const id of ["ai-wyr-1", "ai-point-1", "ai-compat-1"]) expect(deck.some((card) => card.id === id)).toBe(true);
  });

  it("is playable offline for every new AI pack without touching the network", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    let deck: GameCard[] = localSeedDeck(config);
    for (const packId of NEW_AI_PACK_IDS) {
      deck = ensurePackPlayable(deck, config, packId).deck;
      expect(countPlayablePackCards(deck, config, packId)).toBeGreaterThanOrEqual(1);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to local seeds when the provider request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("NETWORK_ERROR")));
    const deck = await requestDeckWithFallback(request);
    expect(deck.length).toBeGreaterThanOrEqual(20);
    expect(deck.every((card) => card.source === "builtin")).toBe(true);
    expect(deck.some((card) => card.packId === "would-you-rather")).toBe(true);
  });

  it("falls back to local seeds when the endpoint returns an error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ ok: false, code: "AUTH_FAILED" }) }));
    const deck = await requestDeckWithFallback(request);
    expect(deck.every((card) => card.source === "builtin")).toBe(true);
  });

  it("uses the generated deck when the provider succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => newPacksFixture }));
    const deck = await requestDeckWithFallback(request);
    expect(deck.some((card) => card.id === "ai-wyr-1")).toBe(true);
  });

  it("lets the host top up the target pack from seeds right after a fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("NETWORK_ERROR")));
    const fallback = await requestDeckWithFallback({ ...request, targetCardCount: 12 });
    const { deck, added } = ensurePackPlayable(fallback, config, "compatibility-test");
    expect(added).toBeGreaterThan(0);
    expect(countPlayablePackCards(deck, config, "compatibility-test")).toBeGreaterThanOrEqual(1);
  });
});
