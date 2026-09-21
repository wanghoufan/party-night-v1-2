import { describe, expect, it } from "vitest";
import { ruleEntrySchema, ruleVariantSchema } from "@/lib/rules/types";
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

/**
 * GAP-01 / FR-032：首批 8 条逐条断言 house-rule 标注与变体完整，
 * 不再靠“抽两条有变体”的代表性抽样（CONVERGE-V1.1 §1 FR-032 PARTIAL）。
 */
const VARIANT_EXPECTATIONS: Array<{ id: string; hasHouseRules: boolean; minVariants: number }> = [
  { id: "miss-card", hasHouseRules: true, minVariants: 1 },
  { id: "kings-cup", hasHouseRules: true, minVariants: 1 },
  { id: "three-gardens", hasHouseRules: false, minVariants: 1 },
  { id: "seven-pass", hasHouseRules: false, minVariants: 1 },
  { id: "fifteen-twenty", hasHouseRules: false, minVariants: 1 },
  { id: "liars-dice", hasHouseRules: false, minVariants: 1 },
  { id: "number-bomb", hasHouseRules: false, minVariants: 1 },
  { id: "finger-guessing", hasHouseRules: true, minVariants: 1 },
];

/** 有地域 / house rules 差异的条目：必须写明差异所在。 */
const HOUSE_RULE_IDS = VARIANT_EXPECTATIONS.filter((entry) => entry.hasHouseRules).map((entry) => entry.id);

describe("rule variants / house rules per entry (FR-032)", () => {
  it("covers every catalog entry in the expectation table", () => {
    expect(VARIANT_EXPECTATIONS.map((entry) => entry.id)).toEqual(RULE_CATALOG.map((entry) => entry.id));
  });

  it("asserts hasHouseRules and a documented variant for each of the eight entries", () => {
    for (const expected of VARIANT_EXPECTATIONS) {
      const entry = getRuleEntry(expected.id);
      expect(entry, `missing entry ${expected.id}`).toBeDefined();
      expect(entry?.hasHouseRules, expected.id).toBe(expected.hasHouseRules);
      expect(entry?.variants.length ?? 0, expected.id).toBeGreaterThanOrEqual(expected.minVariants);
    }
  });

  it("flags exactly the house-rule / regional entries, nothing more", () => {
    const flagged = RULE_CATALOG.filter((entry) => entry.hasHouseRules).map((entry) => entry.id).sort();
    expect(flagged).toEqual([...HOUSE_RULE_IDS].sort());
  });

  it("gives every variant a name, a detail and a valid schema shape", () => {
    for (const entry of RULE_CATALOG) {
      for (const variant of entry.variants) {
        expect(variant.name.trim().length, entry.id).toBeGreaterThan(0);
        expect(variant.detail.trim().length, entry.id).toBeGreaterThan(0);
        expect(ruleVariantSchema.safeParse(variant).success, `${entry.id}/${variant.name}`).toBe(true);
      }
    }
  });

  it("names each entry's variants uniquely so the list cannot show duplicates", () => {
    for (const entry of RULE_CATALOG) {
      const names = entry.variants.map((variant) => variant.name);
      expect(new Set(names).size, entry.id).toBe(names.length);
    }
  });

  it("tells the reader where a house rule / regional difference comes from", () => {
    for (const id of HOUSE_RULE_IDS) {
      const entry = getRuleEntry(id);
      expect(entry, id).toBeDefined();
      expect(entry?.variants.some((variant) => (variant.region ?? "").trim().length > 0), id).toBe(true);
    }
  });

  it("keeps every house-rule entry out of the zero-issue report", () => {
    expect(validateRuleCatalog()).toEqual([]);
  });
});
