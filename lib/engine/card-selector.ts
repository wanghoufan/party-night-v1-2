/**
 * V1.6 旧出卡 selector（**D2 退役，生产不可达**）。
 *
 * B8 起 `/game` 主链的抽卡唯一入口是 V2 Router（`lib/engine/v2-deal.ts` → `drawV2SessionCard`），
 * 本模块只剩两种用途：
 * - 历史留档（`INTENSITY_WEIGHT` 指数陡坡、`pickWeightedCard`、`selectCard`），供 `card-selector.test.ts`
 *   等审计用；生产代码不得再 import 本模块。
 * - 兼容再导出：硬过滤与「换一个」去重已搬到 `lib/engine/card-eligibility.ts`，这里原样转发，
 *   旧引用（测试/外部）不受影响。
 *
 * 禁止把本模块接回任何 empty/error catch 或耗尽兜底（PRODUCT_PLAN_V2.0 §H.5）。
 */

import { isCardAllowed, isRecentlyRejected } from "./card-eligibility";
import type { CardSelectionInput } from "./card-eligibility";
import type { GameCard, Intensity, RandomSource } from "./types";

export {
  MAX_RECENT_REJECTIONS,
  cardFingerprint,
  isCardAllowed,
  isRecentlyRejected,
  normalizeCardText,
  recordRejection,
} from "./card-eligibility";
export type { CardSelectionInput } from "./card-eligibility";

/**
 * 指数陡坡权重（08 新题纲 §七）：第 i 档 = 2^(i-1)，即 1／2／4／8／16。
 * 滑到 N 档时只对「1..N 里真的还有牌的档」归一，高档指数级变重、低档指数级变轻。
 * D2 退役后仅为历史口径，生产不再使用。
 */
export const INTENSITY_WEIGHT: Record<Intensity, number> = { 1: 1, 2: 2, 3: 4, 4: 8, 5: 16 };

/**
 * 按强度陡坡加权抽一张（V1.6 唯一抽法，D2 退役后生产不可达）。
 * 权重之和只统计候选里真实存在的卡，所以某档出完、被尺度或雷区过滤掉时不需要额外兜底。
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
