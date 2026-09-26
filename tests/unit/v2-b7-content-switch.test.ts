import { describe, expect, it } from "vitest";

import rawSnapshot from "@/lib/v2-content/generated/v2-ssot.generated.json";
import { getV2ContentAdapter } from "@/lib/v2-content/v2-content-adapter";
import {
  EXPANSION_PACK_ID,
  V2_MAINLINE_PACK_IDS,
  expansionSsotCards,
  mainlineSsotCards,
  mapSsotBoundaryTags,
} from "@/lib/v2-content/v2-card-bridge";
import {
  V2_SSOT_EXPANSION_CARD_COUNT,
  V2_SSOT_EXPANSION_SHA256,
  V2_SSOT_MAINLINE_CARD_COUNT,
  V2_SSOT_MAINLINE_SHA256,
} from "@/lib/v2-content/v2-types";
import { buildPlayableDeck, localSeedDeck, refillPackFromSeeds } from "@/lib/ai/generate-deck";
import { filterCards, isHardBlocked } from "@/lib/ai/safety-filter";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import { gameCardSchema, type SessionConfig } from "@/lib/domain/schemas";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import { getGamePack } from "@/lib/game-packs/registry";

/* ------------------------------------------------------------------ */
/* 装置                                                                  */
/* ------------------------------------------------------------------ */

const MAINLINE_PACK_IDS = ["truth-dare", "most-likely", "never-have", "would-you-rather", "pointing-game", "compatibility-test"];
const ALL_PACK_IDS = [...MAINLINE_PACK_IDS, "ai-improv", "spin-bottle"];

const players = (count = 4) =>
  Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    displayName: `玩家 ${index + 1}`,
    active: true,
    createdAt: "x",
    lastUsedAt: "x",
  }));

const config = (overrides: Partial<SessionConfig> = {}): SessionConfig => ({
  players: players(),
  relationship: "friends",
  vibes: ["funny"],
  intensity: 5,
  boundaries: DEFAULT_BOUNDARIES,
  enabledPackIds: ALL_PACK_IDS,
  mode: "mixed",
  ...overrides,
});

/* ------------------------------------------------------------------ */
/* D1：内容真源切换                                                       */
/* ------------------------------------------------------------------ */

describe("V2-B7 D1｜SSOT 内容真源（350+40，migrationIdPolicy=NONE）", () => {
  it("生成物数量/hash/ID policy 与冻结契约一致，且 ID 唯一、全为 PN-* 命名空间", () => {
    const adapter = getV2ContentAdapter();

    expect(adapter.mainlineCardCount).toBe(V2_SSOT_MAINLINE_CARD_COUNT);
    expect(adapter.expansionCardCount).toBe(V2_SSOT_EXPANSION_CARD_COUNT);
    expect(adapter.provenance.mainline.sha256).toBe(V2_SSOT_MAINLINE_SHA256);
    expect(adapter.provenance.expansion.sha256).toBe(V2_SSOT_EXPANSION_SHA256);
    // P0-01：自动内容等价 ID 映射 = NONE（不得出现 seed↔PN 翻译表）
    expect(adapter.provenance.migrationIdPolicy).toBe("NONE");

    const ids = [...adapter.mainlineCards, ...adapter.expansionCards].map((card) => card.cardId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("PN-"))).toBe(true);
    expect(ids.some((id) => id.startsWith("seed-"))).toBe(false);

    // 生成物就是本次运行的同一份真源（防止测试读到别的快照）
    expect((rawSnapshot as { provenance: { migrationIdPolicy: string } }).provenance.migrationIdPolicy).toBe("NONE");
  });

  it("桥接出 350 主线卡（7 类落到 6 个玩法：truth-dare 100、其余各 50）且 cardType 落在 pack 支持类型内", () => {
    const cards = mainlineSsotCards();
    expect(cards).toHaveLength(V2_SSOT_MAINLINE_CARD_COUNT);

    const perPack = new Map<string, number>();
    for (const card of cards) perPack.set(card.packId, (perPack.get(card.packId) ?? 0) + 1);
    expect(perPack.get("truth-dare")).toBe(100);
    for (const packId of MAINLINE_PACK_IDS.filter((id) => id !== "truth-dare")) {
      expect(perPack.get(packId), packId).toBe(50);
    }
    expect([...perPack.keys()].sort()).toEqual([...V2_MAINLINE_PACK_IDS].sort());

    for (const card of cards) {
      const pack = getGamePack(card.packId);
      expect(pack, card.packId).toBeDefined();
      expect(pack!.supportedCardTypes, card.id).toContain(card.type);
      expect(gameCardSchema.safeParse(card).success, card.id).toBe(true);
    }
  });

  it("扩圈桥接出 40 张自身 deck 卡（expansion 包，pairScoreEligible=false）", () => {
    const cards = expansionSsotCards();
    expect(cards).toHaveLength(V2_SSOT_EXPANSION_CARD_COUNT);
    expect(cards.every((card) => card.packId === EXPANSION_PACK_ID)).toBe(true);
    expect(cards.every((card) => gameCardSchema.safeParse(card).success)).toBe(true);

    const adapter = getV2ContentAdapter();
    expect(adapter.expansionCards.every((card) => card.pairScoreEligible === false)).toBe(true);
    expect(adapter.expansionCards.every((card) => card.matchEligible === false)).toBe(true);
  });

  it("生产牌堆与补位只出 PN-*，零 seed-*（禁回退内容断言）", () => {
    const deck = buildPlayableDeck({ cards: [] }, config(), 40);
    expect(deck).toHaveLength(40);
    expect(deck.every((card) => card.id.startsWith("PN-"))).toBe(true);
    expect(deck.every((card) => card.source === "builtin")).toBe(true);
    expect(deck.some((card) => card.id.startsWith("seed-"))).toBe(false);
    for (const packId of MAINLINE_PACK_IDS) expect(deck.some((card) => card.packId === packId), packId).toBe(true);

    const offline = localSeedDeck(config());
    expect(offline.length).toBeGreaterThanOrEqual(20);
    expect(offline.every((card) => card.id.startsWith("PN-"))).toBe(true);

    const refilled = refillPackFromSeeds([], config(), "compatibility-test");
    expect(refilled.length).toBeGreaterThan(0);
    expect(refilled.every((card) => card.id.startsWith("PN-") && card.packId === "compatibility-test")).toBe(true);
  });

  it("旧 seed 文件保留且仍可读（history-only 兼容），但不进任何新牌堆/补位", () => {
    expect(BUILTIN_SEED_CARDS).toHaveLength(350);
    expect(BUILTIN_SEED_CARDS.every((card) => card.id.startsWith("seed-"))).toBe(true);

    const ssotIds = new Set([...mainlineSsotCards(), ...expansionSsotCards()].map((card) => card.id));
    expect(BUILTIN_SEED_CARDS.some((card) => ssotIds.has(card.id))).toBe(false);

    const newDeckIds = new Set(localSeedDeck(config()).map((card) => card.id));
    expect(BUILTIN_SEED_CARDS.some((card) => newDeckIds.has(card.id))).toBe(false);
  });

  it("SSOT 边界标签逐条映射到既有雷区；未登记标签 fail closed", () => {
    expect(mapSsotBoundaryTags([])).toEqual([]);
    expect(mapSsotBoundaryTags(["physical-contact"])).toEqual(["physical-contact"]);
    expect(mapSsotBoundaryTags(["proximity"])).toEqual(["physical-contact"]);
    expect(mapSsotBoundaryTags(["relationship-sensitive"])).toEqual(["ex-partner"]);
    expect(mapSsotBoundaryTags(["photo-optional"])).toEqual(["photo-video"]);
    expect(mapSsotBoundaryTags(["external-participant"])).toEqual(["stranger-contact"]);
    expect(mapSsotBoundaryTags(["proximity", "photo-optional", "proximity"])).toEqual(["physical-contact", "photo-video"]);
    expect(() => mapSsotBoundaryTags(["未知标签"])).toThrow();

    // 映射后的标签必须是 App 既有枚举：扩圈卡在「不接触陌生人」关闭时才可玩，开启时整包被安全过滤挡下。
    const expansion = expansionSsotCards();
    expect(expansion.every((card) => card.boundaryTags.includes("stranger-contact"))).toBe(true);
    const safety = { intensity: 5 as const, playerCount: 4 };
    expect(
      filterCards([...expansion], { ...safety, boundaries: { ...DEFAULT_BOUNDARIES, noStrangerContact: false } }),
    ).toHaveLength(40);
    expect(
      filterCards([...expansion], { ...safety, boundaries: { ...DEFAULT_BOUNDARIES, noStrangerContact: true } }),
    ).toHaveLength(0);
  });

  it("桥接卡面长度全过（题面 ≤500 字），且与旧关键词硬规则只撞已知 1 张（登记为待评审例外）", () => {
    const all = [...mainlineSsotCards(), ...expansionSsotCards()];
    for (const card of all) expect(card.content.length, card.id).toBeLessThanOrEqual(500);

    // 旧 `filterCards` 的「强迫」关键词是给 AI 生成物用的子串硬规则，对 V1.3 冻结题面会误判否定式用法：
    // PN-CHEM-048 题面「答案不用于强迫任何下一步」被 substring 命中。运行期按安全方向剔除（少 1 张，不放出），
    // 这里把它登记成显式例外：内容真源一变更，本断言就会失败并要求重新评审（是否收窄正则走 Change A 由 TM/评审定）。
    const blocked = all.filter((card) => isHardBlocked(`${card.content} ${card.instruction ?? ""}`)).map((card) => card.id);
    expect(blocked).toEqual(["PN-CHEM-048"]);

    // 安全方向不变式：默认雷区下主线只被剔除这一张，其余 349 张全部可出。
    const allowed = filterCards([...mainlineSsotCards()], { intensity: 5, playerCount: 4, boundaries: DEFAULT_BOUNDARIES });
    expect(allowed).toHaveLength(349);
  });
});
