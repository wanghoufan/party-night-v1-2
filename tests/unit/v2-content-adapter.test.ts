import { describe, expect, it } from "vitest";

import { getV2ContentAdapter } from "@/lib/v2-content/v2-content-adapter";
import {
  V2_SSOT_MAINLINE_SHA256,
  V2_SSOT_MAINLINE_CARD_COUNT,
  V2_SSOT_EXPANSION_CARD_COUNT,
} from "@/lib/v2-content/v2-types";
import { validateV13Envelope } from "@/lib/v2-content/v2-validation";

const adapter = getV2ContentAdapter();

describe("V2ContentAdapter readonly SSOT", () => {
  it("ships exactly the frozen 350 mainline + 40 expansion cards", () => {
    expect(adapter.mainlineCardCount).toBe(V2_SSOT_MAINLINE_CARD_COUNT);
    expect(adapter.expansionCardCount).toBe(V2_SSOT_EXPANSION_CARD_COUNT);
    expect(adapter.mainlineCards).toHaveLength(350);
    expect(adapter.expansionCards).toHaveLength(40);
  });

  it("keeps every cardId globally unique across mainline + expansion", () => {
    const ids = [...adapter.mainlineCards, ...adapter.expansionCards].map((card) => card.cardId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("passes the frozen enum / schema / quantity validation on the generated snapshot", () => {
    const result = validateV13Envelope({
      mainlineSchemaVersion: adapter.provenance.mainline.schemaVersion,
      mainlineCards: adapter.mainlineCards,
      expansionSchemaVersion: adapter.provenance.expansion.schemaVersion,
      expansionCards: adapter.expansionCards,
      runtimeRules: adapter.runtimeRules,
    });
    expect(result).toEqual({ ok: true, stats: { mainline: 350, expansion: 40, uniqueCardIds: 390 } });
  });

  it("rejects a duplicate cardId inside expansion cards (fails validation)", () => {
    const expansion = structuredClone(adapter.expansionCards).map((card: unknown) => ({ ...(card as Record<string, unknown>) }));
    expect((expansion[1] as { cardId: string }).cardId).not.toBe((expansion[0] as { cardId: string }).cardId);
    expansion[1] = { ...(expansion[1] as object), cardId: (expansion[0] as { cardId: string }).cardId };
    const result = validateV13Envelope({
      mainlineSchemaVersion: adapter.provenance.mainline.schemaVersion,
      mainlineCards: adapter.mainlineCards,
      expansionSchemaVersion: adapter.provenance.expansion.schemaVersion,
      expansionCards: expansion,
      runtimeRules: adapter.runtimeRules,
    });
    if (result.ok) throw new Error("expected validation failure");
    expect(result.issues).toContain("扩圈 cardId 非唯一");
  });

  it("exposes a complete runtimeRules with all 10 frozen top-level keys", () => {
    const required = ["coverageGate", "drawBands", "chemistryCompatibility", "heatProgression", "targetedScheduling", "mutualCheckScheduler", "intensity5Unlock", "pairRouting", "signalFilters", "mostLikely50OneOff"] as const;
    const rules = adapter.runtimeRules as Record<string, unknown>;
    for (const key of required) expect(rules[key], key).toBeDefined();
  });

  it("records the exact archive provenance and fixed hashes", () => {
    expect(adapter.provenance.mainline.sha256).toBe(V2_SSOT_MAINLINE_SHA256);
    expect(adapter.provenance.migrationIdPolicy).toBe("NONE");
    expect(adapter.provenance.mainline.cardCount).toBe(350);
    expect(adapter.provenance.expansion.cardCount).toBe(40);
  });

  it("looks up cards by exact PN-* id", () => {
    expect(adapter.cardById("PN-TRUTH-001")?.cardId).toBe("PN-TRUTH-001");
    expect(adapter.cardById("PN-EXPAND-040")?.fallbackPolicy).toBe("switch-to-table-version");
    expect(adapter.cardById("seed-truth-dare-truth-1")).toBeUndefined();
  });

  it("never provides any seed → PN migration mapping（ID 映射 = NONE）", () => {
    expect(adapter.mainlineByType("truth").every((card) => card.cardId.startsWith("PN-"))).toBe(true);
    const all = [...adapter.mainlineCards, ...adapter.expansionCards];
    expect(all.some((card) => card.cardId.startsWith("seed-"))).toBe(false);
  });

  it("is deeply immutable (read-only)", () => {
    expect(Object.isFrozen(adapter.mainlineCards)).toBe(true);
    expect(Object.isFrozen(adapter.mainlineCards[0])).toBe(true);
    expect(Object.isFrozen(adapter.runtimeRules)).toBe(true);
    expect(Object.isFrozen(adapter.provenance)).toBe(true);
  });
});