import { aiDeckResponseSchema } from "./card-schema";
import { filterCards } from "./safety-filter";
import { dedupeCards } from "./normalize";
import type { AIProviderProfile } from "./provider";
import type { GameCard, SessionConfig } from "@/lib/domain/schemas";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";

export function buildPlayableDeck(raw: unknown, config: SessionConfig, targetCount = 40, customCards: GameCard[] = []): GameCard[] {
  const parsed = aiDeckResponseSchema.safeParse(raw);
  const aiCards = parsed.success ? parsed.data.cards : [];
  const allowedAI = filterCards(aiCards.filter((card) => config.enabledPackIds.includes(card.packId)), { boundaries: config.boundaries, intensity: config.intensity, playerCount: config.players.filter((player) => player.active).length });
  const seeds = filterCards(BUILTIN_SEED_CARDS.filter((card) => config.enabledPackIds.includes(card.packId)), { boundaries: config.boundaries, intensity: config.intensity, playerCount: config.players.filter((player) => player.active).length });
  const allowedCustom = filterCards(customCards.filter((card) => config.enabledPackIds.includes(card.packId)), { boundaries: config.boundaries, intensity: config.intensity, playerCount: config.players.filter((player) => player.active).length });
  return dedupeCards([...allowedAI, ...allowedCustom, ...seeds]).slice(0, targetCount);
}

export async function requestGeneratedDeck(input: { profile: AIProviderProfile; apiKey: string; sessionConfig: SessionConfig; sessionId: string; targetCardCount?: number; customCards?: GameCard[] }): Promise<GameCard[]> {
  const targetCardCount = input.targetCardCount ?? 40;
  const response = await fetch("/api/generate-session", {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}` },
    body: JSON.stringify({ profile: input.profile, sessionConfig: input.sessionConfig, targetCardCount, sessionId: input.sessionId }),
  });
  if (!response.ok) throw new Error((await response.json() as { code?: string }).code ?? "GENERATION_FAILED");
  const deck = buildPlayableDeck(await response.json(), input.sessionConfig, targetCardCount, input.customCards);
  if (deck.length < 10) throw new Error("INSUFFICIENT_CARDS");
  return deck;
}

export function localSeedDeck(config: SessionConfig, customCards: GameCard[] = []): GameCard[] {
  return buildPlayableDeck({ cards: [] }, config, 40, customCards);
}
