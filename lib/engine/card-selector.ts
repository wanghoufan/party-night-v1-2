import { BOUNDARIES } from "@/lib/domain/constants";
import type { BoundaryProfile, GameCard, Intensity, RandomSource } from "./types";

export interface CardSelectionInput {
  cards: GameCard[];
  usedCardIds: string[];
  enabledPackIds: string[];
  playerCount: number;
  intensity: Intensity;
  boundaries: BoundaryProfile;
  preferredPackIds?: string[];
  random?: RandomSource;
}

export function isCardAllowed(
  card: GameCard,
  input: Pick<CardSelectionInput, "usedCardIds" | "enabledPackIds" | "playerCount" | "intensity" | "boundaries">,
): boolean {
  if (input.usedCardIds.includes(card.id) || !input.enabledPackIds.includes(card.packId)) return false;
  if (card.intensity > input.intensity || card.minPlayers > input.playerCount) return false;
  if (card.maxPlayers && card.maxPlayers < input.playerCount) return false;
  const blocked = new Set(
    BOUNDARIES.filter(({ key }) => input.boundaries[key]).map(({ tag }) => tag),
  );
  return !card.boundaryTags.some((tag) => blocked.has(tag));
}

export function selectCard(input: CardSelectionInput): GameCard | undefined {
  const random = input.random ?? Math.random;
  const allowed = input.cards.filter((card) => isCardAllowed(card, input));
  if (!allowed.length) return undefined;
  const preferred = input.preferredPackIds?.length
    ? allowed.filter((card) => input.preferredPackIds!.includes(card.packId))
    : allowed;
  const pool = preferred.length ? preferred : allowed;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
