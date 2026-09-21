import type { GameCard } from "@/lib/domain/schemas";
import { getGamePack } from "@/lib/game-packs/registry";

export function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function normalizedCardFingerprint(card: Pick<GameCard, "content" | "packId">): string {
  return `${card.packId}:${normalizeText(card.content).toLocaleLowerCase("zh-CN").replace(/[，。！？、,.!?\s]/g, "")}`;
}

export function dedupeCards(cards: GameCard[]): GameCard[] {
  const seenIds = new Set<string>();
  const seenContent = new Set<string>();
  return cards.filter((card) => {
    const fingerprint = normalizedCardFingerprint(card);
    if (seenIds.has(card.id) || seenContent.has(fingerprint)) return false;
    seenIds.add(card.id);
    seenContent.add(fingerprint);
    return true;
  });
}

/**
 * 新玩法结构化卡的落库规则（V1.0 四包不用这套，行为保持不变）。
 * 二选一合成 "A VS B" 题面 —— 与本地 seed 文本格式一致，renderer 只认 content。
 * participantMode / minPlayers 以 pack 契约为准，不信任模型自报。
 */
const STRUCTURED_CARD_RULES = {
  "would-you-rather": { participantMode: "all", instruction: "一起倒数三秒，说出你的选择", packId: "would-you-rather" },
  pointing: { participantMode: "all", instruction: "倒数三秒，一起指向那个人", packId: "pointing-game" },
  compatibility: { participantMode: "pair", instruction: "两人同时回答，看是否一样", packId: "compatibility-test" },
} as const satisfies Record<string, { participantMode: GameCard["participantMode"]; instruction: string; packId: string }>;

export function isStructuredCardType(type: string): type is keyof typeof STRUCTURED_CARD_RULES {
  return Object.prototype.hasOwnProperty.call(STRUCTURED_CARD_RULES, type);
}

/** 只有真的带了该玩法的专属字段，才按结构化卡处理；否则当 V1.0 content 卡原样返回。 */
function hasStructuredFields(type: keyof typeof STRUCTURED_CARD_RULES, card: Record<string, unknown>): boolean {
  if (type === "would-you-rather") return typeof card.optionA === "string" && typeof card.optionB === "string";
  return typeof card.prompt === "string";
}

function structuredContent(type: keyof typeof STRUCTURED_CARD_RULES, card: Record<string, unknown>): string {
  if (type === "would-you-rather") return `${String(card.optionA)} VS ${String(card.optionB)}`;
  return String(card.prompt);
}

/**
 * 把一张已通过 schema 校验的 AI 卡归一化成可入库的 GameCard：
 * V1.0 content 卡原样返回；新玩法结构化卡补齐 content/instruction/participantMode/minPlayers。
 */
export function normalizeAICard(card: Record<string, unknown>): GameCard {
  const type = String(card.type);
  if (!isStructuredCardType(type) || !hasStructuredFields(type, card)) return card as unknown as GameCard;
  const rule = STRUCTURED_CARD_RULES[type];
  const packId = String(card.packId ?? rule.packId);
  return {
    id: String(card.id),
    packId,
    type,
    content: structuredContent(type, card),
    instruction: typeof card.instruction === "string" && card.instruction ? card.instruction : rule.instruction,
    intensity: card.intensity as GameCard["intensity"],
    tags: (card.tags as string[] | undefined) ?? [],
    boundaryTags: (card.boundaryTags as GameCard["boundaryTags"] | undefined) ?? [],
    minPlayers: getGamePack(packId)?.minPlayers ?? 2,
    participantMode: rule.participantMode,
    source: "ai",
  };
}
