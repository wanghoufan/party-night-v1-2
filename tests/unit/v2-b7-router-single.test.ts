import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getV2ContentAdapter } from "@/lib/v2-content/v2-content-adapter";
import { expansionSsotCards, mainlineSsotCards } from "@/lib/v2-content/v2-card-bridge";
import { createMainlineContext, drawMainlineCard } from "@/lib/v2-relationship/v2-mainline";
import { packIdForMainlineCard, createV2MainlineRouter } from "@/lib/v2-relationship/v2-router";
import type { V2RouterInput } from "@/lib/v2-relationship/v2-session";
import { createInitialRelationshipState, pairKey, type RelationshipState, type SessionParticipant } from "@/lib/v2-relationship/v2-state";

/* ------------------------------------------------------------------ */
/* 装置                                                                  */
/* ------------------------------------------------------------------ */

const adapter = getV2ContentAdapter();

const male = (playerId: string): SessionParticipant => ({ playerId, active: true, pairGender: "male" });
const female = (playerId: string): SessionParticipant => ({ playerId, active: true, pairGender: "female" });

const MAINLINE_PACK_IDS = ["truth-dare", "most-likely", "never-have", "would-you-rather", "pointing-game", "compatibility-test"];

function input(overrides: Partial<V2RouterInput> = {}): V2RouterInput {
  const participants = overrides.participants ?? [male("a"), female("b")];
  return {
    relationship: overrides.relationship ?? createInitialRelationshipState(),
    participants,
    targetPairKey: overrides.targetPairKey ?? pairKey("a", "b"),
    intensityLimit: overrides.intensityLimit ?? 3,
    softDedupWindow: overrides.softDedupWindow ?? 5,
    requireFiveTierForPair: overrides.requireFiveTierForPair ?? null,
  };
}

/** 取主线 SSOT 卡元数据；非主线卡（旧 seed / 扩圈 / neutral）一律抛错 —— 这本身也是一条「只出 SSOT」的断言。 */
function mainlineMeta(cardId: string) {
  const card = adapter.mainlineCards.find((item) => item.cardId === cardId);
  if (!card) throw new Error(`非主线 SSOT 卡：${cardId}`);
  return card;
}

const SOURCE_REL = [
  "lib/v2-relationship/v2-session.ts",
  "lib/v2-relationship/v2-router.ts",
  "lib/v2-relationship/v2-mainline.ts",
];
/** B8：App 层出卡链（/game 主链）——这些文件也不得再引用旧 selector。 */
const APP_DEAL_REL = [
  "lib/engine/session-engine.ts",
  "lib/engine/v2-deal.ts",
  "lib/engine/pack-switcher.ts",
  "lib/engine/spin-chain.ts",
];
const loadSource = (rel: string): string => readFileSync(join(process.cwd(), rel), "utf8");

/** 去掉块注释与整行行注释：源码断言只针对可执行代码，注释里解释旧实现不算违规。 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ------------------------------------------------------------------ */
/* D2：单 Router                                                        */
/* ------------------------------------------------------------------ */

describe("V2-B7 D2｜relationship-aware 主线单 Router（SSOT 出卡）", () => {
  it("bucket：只出「当前玩法 ∩ 当前 Heat 档 ∩ 强度上限内 ∩ 软去重窗口外」的硬合法卡", () => {
    const router = createV2MainlineRouter({ packId: "truth-dare" });
    const narrow = router.bucket(input({ intensityLimit: 1 }));
    const bucket = router.bucket(input({ intensityLimit: 3 }));

    expect(bucket.length).toBeGreaterThan(0);
    expect(narrow.length).toBeGreaterThan(0);
    for (const card of narrow) expect(mainlineMeta(card.cardId).intensity).toBe(1);

    for (const card of bucket) {
      const meta = mainlineMeta(card.cardId);
      expect(meta.intensity, card.cardId).toBeLessThanOrEqual(3);
      // bucket 只出当前玩法（currentPackId 之外的卡不许进桶）
      expect(packIdForMainlineCard(meta), card.cardId).toBe("truth-dare");
      // bucket 只出当前 Heat 档：H1 = relationshipEffectiveCardCount 0–3
      expect(meta.heatMin, card.cardId).toBeLessThanOrEqual(1);
      expect(meta.heatMax, card.cardId).toBeGreaterThanOrEqual(1);
    }

    // 强度上限真的在算（用不套 Heat 档的 global 对照，避免 H1 档本身没有高档卡）
    const openest = router.global(input({ intensityLimit: 1 }));
    const wider = router.global(input({ intensityLimit: 3 }));
    expect(openest.length).toBeGreaterThan(0);
    expect(wider.length).toBeGreaterThan(openest.length);
    expect(openest.every((card) => mainlineMeta(card.cardId).intensity === 1)).toBe(true);
  });

  it("usedCardIds 是硬过滤：已用卡在 bucket/pack/global 三层都不出现", () => {
    const router = createV2MainlineRouter({ packId: "truth-dare" });
    const base = input({ intensityLimit: 5 });
    const used = router.global(base).slice(0, 5).map((card) => card.cardId);
    expect(used).toHaveLength(5);

    const withUsed = input({
      intensityLimit: 5,
      relationship: { ...createInitialRelationshipState(), usedCardIds: used },
    });
    const all = [...router.bucket(withUsed), ...router.pack(withUsed), ...router.global(withUsed)].map((card) => card.cardId);
    expect(used.some((cardId) => all.includes(cardId))).toBe(false);
  });

  it("软去重窗口按 softDedupWindow 生效：窗口 5 挡住的卡，窗口放到 0 就回来（只放宽、不回退旧 Router）", () => {
    const router = createV2MainlineRouter({ packId: "never-have" });
    const recent = router.bucket(input({ intensityLimit: 5 })).slice(0, 5).map((card) => card.cardId);
    expect(recent).toHaveLength(5);

    const relationship: RelationshipState = { ...createInitialRelationshipState(), recentCardIds: recent };
    const narrow = router.bucket(input({ intensityLimit: 5, relationship, softDedupWindow: 5 })).map((card) => card.cardId);
    expect(recent.some((cardId) => narrow.includes(cardId))).toBe(false);

    const wide = router.bucket(input({ intensityLimit: 5, relationship, softDedupWindow: 0 })).map((card) => card.cardId);
    expect(recent.every((cardId) => wide.includes(cardId))).toBe(true);
  });

  it("pack() 只数当前玩法，global() 覆盖全部 6 个 relationship-aware 玩法", () => {
    const router = createV2MainlineRouter({ packId: "most-likely" });
    // most-likely 是 3 人起玩：用 4 人局验证人数下限过滤后的计数。
    const req = input({ intensityLimit: 5, participants: [male("a"), female("b"), female("c"), male("d")] });

    const pack = router.pack(req).map((card) => card.cardId);
    expect(pack.length).toBeGreaterThan(0);
    expect(pack.every((cardId) => packIdForMainlineCard(mainlineMeta(cardId)) === "most-likely")).toBe(true);

    const global = router.global(req).map((card) => card.cardId);
    const packs = new Set(global.map((cardId) => packIdForMainlineCard(mainlineMeta(cardId))));
    expect([...packs].sort()).toEqual([...MAINLINE_PACK_IDS].sort());
  });

  it("人数下限生效：2 人局里 3 人起的玩法（most-likely / pointing-game）候选一律为空", () => {
    const twoPlayers = input({ intensityLimit: 5 });
    for (const packId of ["most-likely", "pointing-game"]) {
      const router = createV2MainlineRouter({ packId });
      expect(router.pack(twoPlayers), packId).toHaveLength(0);
      expect(router.global(twoPlayers).map((card) => packIdForMainlineCard(mainlineMeta(card.cardId)))).not.toContain(packId);
    }
  });

  it("match-pair（matchRequired）卡只在已建立 MATCH 的 pair 上可出（未 MATCH 时候选数 0）", () => {
    const router = createV2MainlineRouter({ packId: "truth-dare" });
    const key = pairKey("a", "b");
    const matchedCard = adapter.mainlineCards.find((card) => card.targetMode === "match-pair")!;
    expect(matchedCard).toBeDefined();

    const before = router.global(input({ intensityLimit: 5, targetPairKey: key })).map((card) => card.cardId);
    expect(before).not.toContain(matchedCard.cardId);

    const withMatch = input({
      intensityLimit: 5,
      targetPairKey: key,
      relationship: {
        ...createInitialRelationshipState(),
        matches: { [key]: { pairKey: key, matchedAt: "x", playerIds: ["a", "b"] } },
      },
    });
    const after = router.global(withMatch).map((card) => card.cardId);
    expect(after).toContain(matchedCard.cardId);
  });

  it("neutral / expansion 不接管路由：三层结果永远只含主线 SSOT 卡，扩圈卡一张不出", () => {
    const router = createV2MainlineRouter({ packId: "truth-dare" });
    const req = input({ intensityLimit: 5 });
    const returned = [...router.bucket(req), ...router.pack(req), ...router.global(req)].map((card) => card.cardId);

    const mainlineIds = new Set(mainlineSsotCards().map((card) => card.id));
    const expansionIds = new Set(expansionSsotCards().map((card) => card.id));

    expect(returned.length).toBeGreaterThan(0);
    // mainlineMeta 对非主线卡抛错 → 每个 id 都必须能在 SSOT 主线里找到，旧 seed / 扩圈 / neutral 一律出不来
    for (const cardId of returned) expect(() => mainlineMeta(cardId), cardId).not.toThrow();
    expect(returned.every((cardId) => mainlineIds.has(cardId))).toBe(true);
    expect(returned.some((cardId) => expansionIds.has(cardId))).toBe(false);
    // 扩圈 deck 自身仍在（保留自身 deck），只是不进关系路由
    expect(expansionIds.size).toBe(40);
  });

  it("出卡全经 V2RouterPort：编排器出的卡一定来自 SSOT 主线，绝不混入旧 deck", () => {
    const context = createMainlineContext({
      sessionId: "s-b7",
      participants: [male("a"), female("b")],
      packId: "truth-dare",
      intensityLimit: 3,
    });
    const { outcome } = drawMainlineCard(context);

    expect(outcome.kind).toBe("CARD");
    if (outcome.kind !== "CARD") return;
    expect(outcome.cardId.startsWith("PN-")).toBe(true);
    expect(packIdForMainlineCard(mainlineMeta(outcome.cardId))).toBe("truth-dare");
  });

  it("耗尽（三层皆空）返回 AWAITING_HOST，不回退旧 Router 硬塞卡", () => {
    const allMainlineIds = mainlineSsotCards().map((card) => card.id);
    const context = createMainlineContext({
      sessionId: "s-exhausted",
      participants: [male("a"), female("b")],
      packId: "truth-dare",
      intensityLimit: 5,
      relationship: { ...createInitialRelationshipState(), usedCardIds: allMainlineIds },
    });
    const { outcome, context: next } = drawMainlineCard(context);

    expect(outcome.kind).toBe("AWAITING_HOST_EXHAUSTION_DECISION");
    expect(next.state.orchestration.awaitingHostDecision).toBe(true);
    expect(next.state.relationship.usedCardIds).toEqual(allMainlineIds);
  });

  it("禁回退源码断言：V2 主线与 /game 出卡链的可执行代码不引用旧 selector / 指数权重 / 旧种子", () => {
    for (const rel of SOURCE_REL) {
      // 只看可执行代码：注释里解释「本模块不得 import card-selector」是允许的，真引用才是违规。
      const code = stripComments(loadSource(rel));
      expect(code, rel).not.toContain("card-selector");
      expect(code, rel).not.toContain("INTENSITY_WEIGHT");
      expect(code, rel).not.toContain("16:8:4:2:1");
      expect(code, rel).not.toContain("BUILTIN_SEED_CARDS");
      expect(code, rel).not.toContain("built-in-seeds");
      expect(code, rel).not.toMatch(/future-?deck/i);
    }
    // 反证：旧 selector 与指数权重仍在仓库里保留（只保留文件，V2 主线不可达）
    const legacy = loadSource("lib/engine/card-selector.ts");
    expect(legacy).toMatch(/INTENSITY_WEIGHT/);
    // B8 收口：App 出卡链只经 V2 编排器，不再 import 旧 selector（test:219 的显式保留引用已删除）。
    for (const rel of APP_DEAL_REL) {
      const code = stripComments(loadSource(rel));
      expect(code, rel).not.toMatch(/from\s+["'][^"']*card-selector["']/);
      expect(code, rel).not.toContain("INTENSITY_WEIGHT");
      expect(code, rel).not.toContain("pickWeightedCard");
      expect(code, rel).not.toContain("selectCard");
    }
    expect(loadSource("lib/engine/session-engine.ts")).toMatch(/from "\.\/v2-deal"/);
  });
});
