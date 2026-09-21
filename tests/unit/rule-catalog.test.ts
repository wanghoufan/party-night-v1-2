import { describe, expect, it } from "vitest";
import { ruleEntrySchema } from "@/lib/rules/types";
import { RULE_CATALOG, RULE_CATALOG_ISSUES, getRuleEntry, validateRuleCatalog } from "@/lib/rules/catalog";

/** V1.1 Phase 13 / Spec §8 首批 8 条规则库条目（FR-030）。 */
const EXPECTED_IDS = [
  "miss-card",
  "kings-cup",
  "three-gardens",
  "seven-pass",
  "fifteen-twenty",
  "liars-dice",
  "number-bomb",
  "finger-guessing",
] as const;

describe("rule catalog", () => {
  it("ships the eight first-batch entries in order", () => {
    expect(RULE_CATALOG.map((entry) => entry.id)).toEqual([...EXPECTED_IDS]);
  });

  it("resolves every entry by a unique id", () => {
    const ids = RULE_CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of EXPECTED_IDS) expect(getRuleEntry(id)?.id).toBe(id);
  });

  it("returns undefined for an unknown rule id instead of guessing", () => {
    expect(getRuleEntry("does-not-exist")).toBeUndefined();
  });

  it("validates every entry against the RuleEntry schema", () => {
    for (const entry of RULE_CATALOG) {
      const result = ruleEntrySchema.safeParse(entry);
      expect(result.success, `${entry.id} should parse`).toBe(true);
    }
  });

  it("fills the required display fields on every entry", () => {
    for (const entry of RULE_CATALOG) {
      expect(entry.title.trim().length, entry.id).toBeGreaterThan(0);
      expect(entry.quickSummary.trim().length, entry.id).toBeGreaterThan(0);
      expect(entry.props.length, entry.id).toBeGreaterThanOrEqual(0);
      expect(entry.steps.length, entry.id).toBeGreaterThan(0);
      for (const step of entry.steps) expect(step.detail.trim().length, entry.id).toBeGreaterThan(0);
    }
  });

  it("documents a common version and at least one variant for every entry", () => {
    for (const entry of RULE_CATALOG) {
      expect(entry.variants.length, entry.id).toBeGreaterThan(0);
      for (const variant of entry.variants) {
        expect(variant.name.trim().length, entry.id).toBeGreaterThan(0);
        expect(variant.detail.trim().length, entry.id).toBeGreaterThan(0);
      }
    }
  });

  it("flags house-rule / regional entries explicitly (FR-032)", () => {
    const flagged = RULE_CATALOG.filter((entry) => entry.hasHouseRules).map((entry) => entry.id);
    expect(flagged).toContain("miss-card");
    expect(flagged).toContain("kings-cup");
    expect(flagged).toContain("finger-guessing");
  });

  it("reports no catalog issues", () => {
    expect(validateRuleCatalog()).toEqual([]);
    expect(RULE_CATALOG_ISSUES).toEqual([]);
  });

  it("detects duplicate ids and empty variants for house-rule entries", () => {
    const issues = validateRuleCatalog([
      {
        ...RULE_CATALOG[0],
        id: "duplicate",
        hasHouseRules: true,
        variants: [],
      },
      { ...RULE_CATALOG[1], id: "duplicate" },
    ]);
    expect(issues.some((issue) => issue.message.includes("duplicate"))).toBe(true);
    expect(issues.some((issue) => issue.field === "variants")).toBe(true);
  });
});
