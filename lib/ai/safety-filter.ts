import { BOUNDARIES } from "@/lib/domain/constants";
import type { BoundaryProfile, GameCard, Intensity } from "@/lib/domain/schemas";
import { dedupeCards, normalizeText } from "./normalize";

const HARD_BLOCK_PATTERNS = [
  /强迫.*(喝|接触|亲吻)/,
  /(驾车|开车).*(喝酒|饮酒)/,
  /(伤害自己|自残|违法|偷窃)/,
  /(未经同意|不许拒绝|不能拒绝)/,
];

export interface SafetyContext {
  boundaries: BoundaryProfile;
  intensity: Intensity;
  playerCount: number;
}

export function filterCards(cards: GameCard[], context: SafetyContext): GameCard[] {
  const blockedTags = new Set(
    BOUNDARIES.filter(({ key }) => context.boundaries[key]).map(({ tag }) => tag),
  );
  const customTerms = context.boundaries.customText
    .split(/[，,、\n]/)
    .map(normalizeText)
    .filter((term) => term.length >= 2);

  return dedupeCards(cards.filter((card) => {
    const text = normalizeText(`${card.content} ${card.instruction ?? ""}`);
    if (card.intensity > context.intensity || card.minPlayers > context.playerCount) return false;
    if (card.maxPlayers && card.maxPlayers < context.playerCount) return false;
    if (card.boundaryTags.some((tag) => blockedTags.has(tag))) return false;
    if (HARD_BLOCK_PATTERNS.some((pattern) => pattern.test(text))) return false;
    return !customTerms.some((term) => text.includes(term));
  }));
}
