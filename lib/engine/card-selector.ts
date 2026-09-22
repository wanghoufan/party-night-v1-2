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
  /** 只在指定题卡类型里抽（如转瓶子→真心话只出 truth 卡）；该类型没有可用卡时退回既有候选，不空转。 */
  preferredCardTypes?: string[];
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

/**
 * 指数陡坡权重（08 新题纲 §七）：第 i 档 = 2^(i-1)，即 1／2／4／8／16。
 * 滑到 N 档时只对「1..N 里真的还有牌的档」归一，高档指数级变重、低档指数级变轻。
 */
export const INTENSITY_WEIGHT: Record<Intensity, number> = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 };

/**
 * 按强度陡坡加权抽一张（唯一抽法，线性/等概率方案作废）。
 * 权重之和只统计候选里真实存在的卡，所以某档出完、被尺度或雷区过滤掉时不需要额外兜底：
 * 缺口由相邻档按同一套权重「就近补」，牌堆照样配得满、不会空转。
 */
export function pickWeightedCard(candidates: GameCard[], random: RandomSource): GameCard {
  const weights = candidates.map((card) => INTENSITY_WEIGHT[card.intensity]);
  let roll = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < candidates.length; index += 1) {
    roll -= weights[index]!;
    if (roll < 0) return candidates[index]!;
  }
  return candidates[candidates.length - 1]!;
}

export function selectCard(input: CardSelectionInput): GameCard | undefined {
  const random = input.random ?? Math.random;
  const allowed = input.cards.filter((card) => isCardAllowed(card, input));
  if (!allowed.length) return undefined;
  const preferred = input.preferredPackIds?.length
    ? allowed.filter((card) => input.preferredPackIds!.includes(card.packId))
    : allowed;
  const packPool = preferred.length ? preferred : allowed;
  const typed = input.preferredCardTypes?.length
    ? packPool.filter((card) => input.preferredCardTypes!.includes(card.type))
    : packPool;
  const pool = typed.length ? typed : packPool;
  const rejected = input.recentRejectedFingerprints ?? [];
  const fresh = rejected.length ? pool.filter((card) => !isRecentlyRejected(card, rejected)) : pool;
  // 全部候选都被换过时不空转：宁可重复题面，也不能卡住现场。
  const candidates = fresh.length ? fresh : pool;
  return pickWeightedCard(candidates, random);
}
