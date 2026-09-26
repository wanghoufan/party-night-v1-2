/**
 * B7 / D2｜生产 V2 Router（relationship-aware 主线的唯一出卡实现）。
 *
 * 本模块实现 `V2RouterPort`（v2-session.ts 的编排契约），内容一律来自 V1.3 Frozen SSOT
 * （350 主线；扩圈 40 不进本路由）。它取代 V1.6 的固定 40 张 future deck、
 * `16:8:4:2:1` 指数权重与 `lib/engine/card-selector`：
 * 本文件不 import、也不调用任何旧 selector；耗尽、放宽软去重窗口、洗牌后兜底
 * 全部回到本端口的 bucket/pack/global —— 旧 Router 在 V2 主线不可达。
 *
 * 三层计数口径（与 v2-session.ts 顶部注释、PRODUCT_PLAN_V2.0 §H 一致）：
 * - 硬合法（hardEligible）：强度上限、合法 5 档强制、参与者人数下限、pair 目标 gating、
 *   `usedCardIds` 全部通过。
 * - `bucket`：**当前玩法内** ∩ 硬合法 ∩ 当前 Heat 档 ∩ 不在最近 `softDedupWindow` 张软去重窗口内。
 *   （桶必须限定在当前玩法：跨玩法填桶会让 pack 耗尽永不可见，主链也会抽到 currentPackId 之外的卡。）
 * - `pack`：当前玩法的硬合法集（不套软去重、不套 Heat 档：本玩法还有材料，只是当前桶出不了）。
 * - `global`：全部 relationship-aware 玩法的硬合法集（同上，不套软去重与 Heat 档）。
 *
 * Pair 目标 gating（R4 / D4）：
 * - `targetPairKey === null`（中性 / 无合法男女 pair 的普通玩法降级）：只出 `all-players` 卡，
 *   pair/MATCH/私密互选类卡一律不可出 —— 降级局不跑 Pair Routing、MATCH 与 5 档专属。
 * - `requireNonTargetedOpportunity === true`（R-CB6 Single-Anchor Guard 的非定向轮）：同样只出
 *   `all-players` 卡（与上一行的判断同一 targetMode 口径，不新增卡类型体系）。
 * - `targetPairKey !== null`：额外开放定向 pair 卡；`match-pair`（matchRequired）卡
 *   只在 relationship.matches 里已有该 pair 的 MATCH 时才可出。
 */

import {
  HEAT_ORDER,
  type Heat,
  type RelationshipState,
} from "./v2-state";
import { getGamePack } from "@/lib/game-packs/registry";
import { getV2ContentAdapter } from "@/lib/v2-content/v2-content-adapter";
import { V2_MAINLINE_PACK_BY_GAME_TYPE } from "@/lib/v2-content/v2-card-bridge";
import type { V13MainlineCard } from "@/lib/v2-content/v2-types";
import type { V2RouterCard, V2RouterInput, V2RouterPort } from "./v2-session";

/** 只认「全桌」目标模式的卡：无合法 pair 的降级局只能出这类卡。 */
const ALL_PLAYERS_TARGET_MODE = "all-players";
/** 需要先有 MATCH 才能出的目标模式（R4：MatchRequired 卡不得在未 MATCH 的 pair 上出）。 */
const MATCH_TARGET_MODE = "match-pair";

const heatRank = (heat: Heat): number => HEAT_ORDER.indexOf(heat) + 1;

/** SSOT 卡 → 它所属的主线玩法 id（不在主线映射里的卡不属于本路由）。只读视图也可传入。 */
export function packIdForMainlineCard(card: { gameType: V13MainlineCard["gameType"] }): string | undefined {
  return V2_MAINLINE_PACK_BY_GAME_TYPE[card.gameType]?.packId;
}

/** 软去重窗口：最近 `window` 张已展示卡不再出。 */
function recentWindow(relationship: RelationshipState, window: number): Set<string> {
  if (window <= 0) return new Set();
  return new Set(relationship.recentCardIds.slice(-window));
}

/** 该卡在当前输入下是否「硬合法」（不含 Heat 档与软去重窗口）。 */
function isHardEligible(card: V13MainlineCard, input: V2RouterInput): boolean {
  if (card.intensity > input.intensityLimit) return false;
  if (input.requireFiveTierForPair !== null && card.intensity !== 5) return false;
  if (input.relationship.usedCardIds.includes(card.cardId)) return false;

  const activeCount = input.participants.filter((participant) => participant.active).length;
  if (activeCount < 2) return false;
  const minPlayers = minPlayersForCard(card);
  if (activeCount < minPlayers) return false;

  return isTargetEligible(card, input);
}

/** 玩法人数下限与 pack 定义同源（不建第二套 runtime 常量）。 */
function minPlayersForCard(card: V13MainlineCard): number {
  const packId = packIdForMainlineCard(card);
  if (!packId) return Number.POSITIVE_INFINITY;
  return getGamePack(packId)?.minPlayers ?? 2;
}

/** pair / 全桌目标 gating（D4 降级：无合法 pair 只出全桌卡）。 */
function isTargetEligible(card: V13MainlineCard, input: V2RouterInput): boolean {
  if (card.targetMode === ALL_PLAYERS_TARGET_MODE) return true;
  // R-CB6｜Single-Anchor Guard 的非定向轮：只许 all-players，定向 pair 卡一律不出（沿用同一 targetMode 口径，不另立类型）。
  if (input.requireNonTargetedOpportunity === true) return false;
  if (input.targetPairKey === null) return false;
  if (card.targetMode === MATCH_TARGET_MODE) {
    return input.relationship.matches[input.targetPairKey] !== undefined;
  }
  return true;
}

/** 确定性排序：强度降序、cardId 升序（Router 不用随机数；出哪张由编排器与窗口决定）。 */
function sortCards(cards: V13MainlineCard[]): V13MainlineCard[] {
  return [...cards].sort((a, b) => b.intensity - a.intensity || (a.cardId < b.cardId ? -1 : 1));
}

const toRouterCard = (card: V13MainlineCard): V2RouterCard => ({
  cardId: card.cardId,
  fiveTier: card.intensity === 5,
});

export interface V2MainlineRouterOptions {
  /** 当前 relationship-aware 玩法（pack）id；pack() 只在这个玩法内计数。 */
  packId: string;
}

export interface V2MainlineRouter extends V2RouterPort {
  /** 当前玩法 id（只读，便于编排器/测试核对路由范围）。 */
  readonly packId: string;
}

/**
 * 生产 Router：SSOT 主线卡的唯一出卡实现。
 * 同一份输入永远得到同一份结果（无随机、无隐藏状态），便于逐轮复现与审计。
 */
export function createV2MainlineRouter(options: V2MainlineRouterOptions): V2MainlineRouter {
  const { packId } = options;

  const mainline = getV2ContentAdapter().mainlineCards as readonly V13MainlineCard[];

  const hardEligible = (input: V2RouterInput): V13MainlineCard[] =>
    mainline.filter((card) => isHardEligible(card, input));

  return {
    packId,
    bucket(input) {
      const currentHeat = heatRank(input.relationship.heat);
      const excluded = recentWindow(input.relationship, input.softDedupWindow);
      return sortCards(
        hardEligible(input).filter(
          (card) =>
            packIdForMainlineCard(card) === packId &&
            currentHeat >= card.heatMin &&
            currentHeat <= card.heatMax &&
            !excluded.has(card.cardId),
        ),
      ).map(toRouterCard);
    },
    pack(input) {
      return sortCards(hardEligible(input).filter((card) => packIdForMainlineCard(card) === packId)).map(
        toRouterCard,
      );
    },
    global(input) {
      return sortCards(hardEligible(input)).map(toRouterCard);
    },
  };
}
