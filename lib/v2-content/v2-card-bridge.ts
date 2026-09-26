/**
 * B7 / D1｜SSOT → 运行期 GameCard 桥（生产内容真源的唯一出口）。
 *
 * 真源：`lib/v2-content/generated/v2-ssot.generated.json`（V1.3 Frozen 350+40，schema 2.3），
 * 由 V2ContentAdapter 深冻结后只读访问。本模块只做「SSOT 字段 → GameCard 字段」的确定映射，
 * 不新增题面、不改强度/档位、不做任何 seed↔PN 等价换算（`migrationIdPolicy=NONE`）。
 *
 * 旧 `seed-*` 种子（lib/game-packs/built-in-seeds）只保留 history-only 兼容：
 * - 旧 Session 的 `deckSnapshot`/`rounds` 里已落库的 seed 卡照旧可读、可展示（历史事实不改写）；
 * - 运行期新牌堆（buildPlayableDeck / refillPackFromSeeds）不再从旧种子取卡，本模块也不产出 seed-* id。
 *
 * 映射口径（逐条可在 tests/unit/v2-b7-content-switch.test.ts 复核）：
 * - gameType → packId/cardType：接回既有 pack 与 renderer（pointing/binary-choice/compatibility）。
 * - targetMode → participantMode：谁是本题的参与者（全桌/单人/一对）。
 * - boundaryTags：SSOT 标签 → App 既有 BoundaryTag 枚举；口径是「宁可多过滤」，
 *   SSOT 的每个标签都必须映射到某条至少同等严格的 App 雷区，否则抛错（fail closed）。
 * - consentMode → instruction：把 SSOT 的同意口径渲染成卡面说明，不靠玩家脑补。
 */

import type { BoundaryTag, GameCard, Intensity } from "@/lib/domain/schemas";
import { getGamePack } from "@/lib/game-packs/registry";
import { getV2ContentAdapter } from "./v2-content-adapter";
import {
  V2_GAME_TYPES,
  type V13ExpansionCard,
  type V13MainlineCard,
} from "./v2-types";

/** 扩圈（10b）玩法 id：保留自身 deck，不参与 Pair Score / MATCH，也不接管 relationship-aware 路由。 */
export const EXPANSION_PACK_ID = "expansion" as const;
export const EXPANSION_CARD_TYPE = "expansion" as const;

/**
 * SSOT gameType → 现存 pack/cardType。
 * 7 类主线（truth/dare/most_likely/never_have_i/either_or/pointing/chemistry）落到 6 个玩法，
 * cardType 必须落在该 pack 的 supportedCardTypes 里，否则 renderer 会走错（测试断言）。
 */
export const V2_MAINLINE_PACK_BY_GAME_TYPE: Record<
  (typeof V2_GAME_TYPES)[number],
  { packId: string; cardType: string }
> = {
  truth: { packId: "truth-dare", cardType: "truth" },
  dare: { packId: "truth-dare", cardType: "dare" },
  most_likely: { packId: "most-likely", cardType: "vote" },
  never_have_i: { packId: "never-have", cardType: "statement" },
  either_or: { packId: "would-you-rather", cardType: "would-you-rather" },
  pointing: { packId: "pointing-game", cardType: "pointing" },
  chemistry: { packId: "compatibility-test", cardType: "compatibility" },
};

/** SSOT targetMode → 既有 participantMode（谁是本题参与者）。 */
export const PARTICIPANT_MODE_BY_TARGET_MODE: Record<
  V13MainlineCard["targetMode"],
  GameCard["participantMode"]
> = {
  "all-players": "all",
  "pair-vote": "all",
  "private-choice": "single",
  "system-opposite-sex": "single",
  "choose-opposite-sex": "single",
  "match-pair": "pair",
  "system-pair": "pair",
  "signal-pair": "pair",
};

/**
 * SSOT 边界标签 → App 既有雷区标签（reject-by-default：只许映射到「不比原标签更宽松」的 App 雷区）。
 * - proximity（贴近/对视/坐旁边）→ physical-contact：勾了「身体接触」的人连贴近题也一起避开。
 * - relationship-sensitive（好感/暧昧向关系话题）→ ex-partner：勾了「前任相关」的人一起避开，
 *   宁可多过滤；App 侧暂无更贴合的雷区枚举，未来若新增另走变更。
 * - photo-optional → photo-video；external-participant（邀请邻桌）→ stranger-contact。
 * 未登记的新标签一律抛错（fail closed），防止真源漂移后静默放行。
 */
export const SSOT_BOUNDARY_TAG_MAP: Record<string, BoundaryTag> = {
  "physical-contact": "physical-contact",
  proximity: "physical-contact",
  "relationship-sensitive": "ex-partner",
  "photo-optional": "photo-video",
  "external-participant": "stranger-contact",
};

/** SSOT consentMode → 卡面说明（同意口径的确定渲染；不含任何新题面内容）。 */
export const CONSENT_INSTRUCTION: Record<V13MainlineCard["consentMode"], string> = {
  "skip-anytime": "不愿意可无惩罚跳过",
  "mutual-current-consent": "先问出口，双方当场都同意才做；不愿意可无惩罚跳过",
  "private-mutual-only": "仅两人私密互选成功后展示结果，单向不成局、无任何后续；不愿意可无惩罚跳过",
};

/** SSOT 边界标签 → App 雷区标签数组（未登记标签抛错，不去重不猜）。 */
export function mapSsotBoundaryTags(tags: readonly string[]): BoundaryTag[] {
  const mapped: BoundaryTag[] = [];
  for (const tag of tags) {
    const boundary = SSOT_BOUNDARY_TAG_MAP[tag];
    if (!boundary) throw new Error(`V2 SSOT 边界标签无映射（fail closed）：${tag}`);
    if (!mapped.includes(boundary)) mapped.push(boundary);
  }
  return mapped;
}

const mainlineMinPlayers = (packId: string): number => {
  const pack = getGamePack(packId);
  if (!pack) throw new Error(`V2 主线 pack 未注册：${packId}`);
  return pack.minPlayers;
};

function toMainlineGameCard(card: V13MainlineCard): GameCard {
  const mapping = V2_MAINLINE_PACK_BY_GAME_TYPE[card.gameType];
  if (!mapping) throw new Error(`V2 SSOT gameType 无映射：${card.gameType}`);
  return {
    // ID 命名空间唯一：PN-*（迁移 policy NONE —— 旧 seed-* 不做等价翻译）。
    id: card.cardId,
    packId: mapping.packId,
    type: mapping.cardType,
    content: card.text,
    instruction: CONSENT_INSTRUCTION[card.consentMode],
    intensity: card.intensity as Intensity,
    tags: [],
    boundaryTags: mapSsotBoundaryTags(card.boundaryTags),
    minPlayers: mainlineMinPlayers(mapping.packId),
    participantMode: PARTICIPANT_MODE_BY_TARGET_MODE[card.targetMode],
    source: "builtin",
  };
}

function toExpansionGameCard(card: V13ExpansionCard): GameCard {
  return {
    id: card.cardId,
    packId: EXPANSION_PACK_ID,
    type: EXPANSION_CARD_TYPE,
    content: card.text,
    instruction: CONSENT_INSTRUCTION[card.consentMode],
    intensity: card.minIntensity as Intensity,
    tags: [],
    boundaryTags: mapSsotBoundaryTags(card.boundaryTags),
    minPlayers: 2,
    participantMode: "all",
    source: "builtin",
  };
}

let mainlineCache: readonly GameCard[] | null = null;
let expansionCache: readonly GameCard[] | null = null;

/** 主线 350 张（PN-*，7 类）；生产牌堆的唯一内容来源。 */
export function mainlineSsotCards(): readonly GameCard[] {
  if (!mainlineCache) {
    mainlineCache = getV2ContentAdapter().mainlineCards.map((card) =>
      toMainlineGameCard(card as V13MainlineCard),
    );
  }
  return mainlineCache;
}

/** 扩圈 40 张（PN-EXPAND-*）：属于 expansion 包自己的 deck，不进 relationship-aware 路由。 */
export function expansionSsotCards(): readonly GameCard[] {
  if (!expansionCache) {
    expansionCache = getV2ContentAdapter().expansionCards.map((card) =>
      toExpansionGameCard(card as V13ExpansionCard),
    );
  }
  return expansionCache;
}

/** 某个玩法的主线卡（pack-specific 补位用）。 */
export function mainlineSsotCardsByPack(packId: string): readonly GameCard[] {
  return mainlineSsotCards().filter((card) => card.packId === packId);
}

/** 主线 pack id 集合（去重、稳定顺序）：relationship-aware 路由只认这些玩法。 */
export const V2_MAINLINE_PACK_IDS: readonly string[] = Array.from(
  new Set(V2_GAME_TYPES.map((gameType) => V2_MAINLINE_PACK_BY_GAME_TYPE[gameType].packId)),
);

export function isV2MainlinePack(packId: string): boolean {
  return V2_MAINLINE_PACK_IDS.includes(packId);
}
