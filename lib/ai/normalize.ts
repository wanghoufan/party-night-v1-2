import type { GameCard } from "@/lib/domain/schemas";
import { getGamePack } from "@/lib/game-packs/registry";
import { sanitizeUntrustedText, UNTRUSTED_TEXT_LIMITS } from "@/lib/security/untrusted-text";

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
 * 人数下限唯一真源＝pack 契约（`getGamePack(packId).minPlayers`）。
 * 卡自报 minPlayers 只能更严格不能更宽松：实际下限 = max(卡自报, pack 契约下限)。
 * 未知/未注册 packId（自定义玩法等）按既有兜底 2，行为不变；不抛错。
 */
export function packMinPlayersFloor(packId: string): number {
  return getGamePack(packId)?.minPlayers ?? 2;
}

/** 一张卡的实际人数下限：`max(card.minPlayers, pack 契约下限)`（归一与 filterCards 共用同一真源）。 */
export function effectiveMinPlayers(card: Pick<GameCard, "minPlayers" | "packId">): number {
  return Math.max(card.minPlayers, packMinPlayersFloor(card.packId));
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
  const part = (value: unknown) => sanitizeUntrustedText(String(value), UNTRUSTED_TEXT_LIMITS.cardContent);
  if (type === "would-you-rather") return `${part(card.optionA)} VS ${part(card.optionB)}`;
  return part(card.prompt);
}

/** AI 文本一律按不可信处理：去控制字符 + 按契约钳制长度，渲染交给 React 默认转义（T196/T197）。 */
function cleanInstruction(value: unknown, fallback?: string): string {
  const text = typeof value === "string" && value ? value : fallback ?? "";
  return sanitizeUntrustedText(text, UNTRUSTED_TEXT_LIMITS.cardInstruction);
}

/**
 * 把一张已通过 schema 校验的 AI 卡归一化成可入库的 GameCard：
 * V1.0 content 卡文本语义原样返回（仅清洗不可信文本）；新玩法结构化卡补齐 content/instruction/participantMode/minPlayers。
 * 两类的 minPlayers 都以 pack 契约为下限收口：卡自报更宽松时抬到契约下限，更严格时保留（不写死）。
 */
export function normalizeAICard(card: Record<string, unknown>): GameCard {
  const type = String(card.type);
  if (!isStructuredCardType(type) || !hasStructuredFields(type, card)) {
    // V1.0 content 卡不再把模型自报 minPlayers 当真：按 pack 契约钳到不低于下限，文本清洗语义不变。
    const reported = typeof card.minPlayers === "number" ? card.minPlayers : 2;
    return {
      ...card,
      content: sanitizeUntrustedText(String(card.content ?? ""), UNTRUSTED_TEXT_LIMITS.cardContent),
      ...(typeof card.instruction === "string" ? { instruction: cleanInstruction(card.instruction) } : {}),
      minPlayers: Math.max(reported, packMinPlayersFloor(String(card.packId ?? ""))),
    } as unknown as GameCard;
  }
  const rule = STRUCTURED_CARD_RULES[type];
  const packId = String(card.packId ?? rule.packId);
  return {
    id: String(card.id),
    packId,
    type,
    content: structuredContent(type, card),
    instruction: cleanInstruction(card.instruction, rule.instruction),
    intensity: card.intensity as GameCard["intensity"],
    tags: (card.tags as string[] | undefined) ?? [],
    boundaryTags: (card.boundaryTags as GameCard["boundaryTags"] | undefined) ?? [],
    minPlayers: packMinPlayersFloor(packId),
    participantMode: rule.participantMode,
    source: "ai",
  };
}
