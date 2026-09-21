import { BOUNDARIES } from "@/lib/domain/constants";
import type { BoundaryProfile, GameCard, Intensity, RandomSource } from "./types";

/** 最近“换一个”保留的指纹数量上限；只做短期避免重复，不做长期记忆。 */
export const MAX_RECENT_REJECTIONS = 20;
/** 近似判定阈值：字符 bigram 的 Jaccard 相似度。 */
const SIMILARITY_THRESHOLD = 0.8;
const FINGERPRINT_MAX_LENGTH = 160;

export interface CardSelectionInput {
  cards: GameCard[];
  usedCardIds: string[];
  enabledPackIds: string[];
  playerCount: number;
  intensity: Intensity;
  boundaries: BoundaryProfile;
  preferredPackIds?: string[];
  recentRejectedFingerprints?: string[];
  random?: RandomSource;
}

/** 归一化题面：全角转半角、小写、去掉空白与标点符号，得到可比较的稳定文本。 */
export function normalizeCardText(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function cardFingerprint(card: Pick<GameCard, "content">): string {
  return normalizeCardText(card.content).slice(0, FINGERPRINT_MAX_LENGTH);
}

function bigrams(text: string): Set<string> {
  const tokens = new Set<string>();
  for (let index = 0; index < text.length - 1; index += 1) tokens.add(text.slice(index, index + 2));
  return tokens;
}

function isSimilar(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.length < 2 || right.length < 2) return false;
  const a = bigrams(left);
  const b = bigrams(right);
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared) >= SIMILARITY_THRESHOLD;
}

/** 题面是否与最近换掉的题高度相似（相同或近似归一化文本）。 */
export function isRecentlyRejected(card: Pick<GameCard, "content">, fingerprints: string[] = []): boolean {
  const fingerprint = cardFingerprint(card);
  if (!fingerprint) return false;
  return fingerprints.some((rejected) => Boolean(rejected) && isSimilar(fingerprint, rejected));
}

/** 追加一次拒绝，返回新数组：同一指纹不重复入列，超出上限丢弃最旧的。 */
export function recordRejection(fingerprints: string[], card: Pick<GameCard, "content">, limit = MAX_RECENT_REJECTIONS): string[] {
  const fingerprint = cardFingerprint(card);
  if (!fingerprint) return fingerprints;
  const kept = fingerprints.filter((item) => item !== fingerprint);
  return [...kept, fingerprint].slice(-Math.max(1, limit));
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
  const rejected = input.recentRejectedFingerprints ?? [];
  const fresh = rejected.length ? pool.filter((card) => !isRecentlyRejected(card, rejected)) : pool;
  // 全部候选都被换过时不空转：宁可重复题面，也不能卡住现场。
  const candidates = fresh.length ? fresh : pool;
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
}
