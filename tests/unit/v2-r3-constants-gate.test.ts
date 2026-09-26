import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  BASE_SESSION_COMPLETED_ROUND_LIMIT,
  EXTENSION_SESSION_COMPLETED_ROUND_LIMIT,
  FIVE_TIER_GUARANTEE_QUALIFYING_LIMIT,
  MAX_EXTENSIONS,
  MAX_SESSION_COMPLETED_ROUNDS,
  SOFT_DEDUP_WINDOW,
} from "@/lib/v2-relationship/v2-state";

/**
 * R3 常量冻结门：
 * - 优先从 generated SSOT（lib/v2-content/generated/v2-ssot.generated.json）读取运行真源；
 * - Plan §六 的 `effectiveCardCounting` 块尚未物化进 generated SSOT，
 *   故 v2-state 的字面常量暂以 PRODUCT_PLAN_V2.0.md §六手抄值为冻结基准逐值比对。
 *   待 SSOT 补齐该块并重签 SHA256 后，应改由生成物读取（见 CODE_REVIEW-V2-B2 P1-8）。
 */
const SSOT = JSON.parse(
  readFileSync("lib/v2-content/generated/v2-ssot.generated.json", "utf8"),
) as {
  runtimeRules: {
    mutualCheckScheduler: {
      firstEligibleEffectiveCardCount: number;
      minimumEffectiveCardsBetweenRuns: number;
      maxRegularRuns: number;
    };
    pairRouting: { defaultPairCooldownRounds: number };
    heatProgression: {
      openEndedEffectiveCards: Record<string, { min: number; max?: number }>;
    };
  };
};

const rules = SSOT.runtimeRules;

describe("v2 R3 常量门｜generated SSOT 与 Plan §六 冻结值", () => {
  it("mutualCheckScheduler：firstEligible=9 / betweenRuns=5 / maxRegularRuns=3", () => {
    expect(rules.mutualCheckScheduler.firstEligibleEffectiveCardCount).toBe(9);
    expect(rules.mutualCheckScheduler.minimumEffectiveCardsBetweenRuns).toBe(5);
    expect(rules.mutualCheckScheduler.maxRegularRuns).toBe(3);
  });

  it("pairRouting.defaultPairCooldownRounds = 2", () => {
    expect(rules.pairRouting.defaultPairCooldownRounds).toBe(2);
  });

  it("heatProgression.openEndedEffectiveCards 与 Plan 冻结档位一致", () => {
    expect(rules.heatProgression.openEndedEffectiveCards).toEqual({
      H1: { min: 0, max: 3 },
      H2: { min: 4, max: 7 },
      H3: { min: 8, max: 12 },
      H4: { min: 13 },
    });
  });

  it("v2-state 字面常量与 Plan §六 冻结值一致（SSOT 缺 effectiveCardCounting 块，暂以 Plan 冻结）", () => {
    expect(BASE_SESSION_COMPLETED_ROUND_LIMIT).toBe(20);
    expect(EXTENSION_SESSION_COMPLETED_ROUND_LIMIT).toBe(5);
    expect(MAX_EXTENSIONS).toBe(1);
    expect(MAX_SESSION_COMPLETED_ROUNDS).toBe(25);
    expect(FIVE_TIER_GUARANTEE_QUALIFYING_LIMIT).toBe(2);
    expect(SOFT_DEDUP_WINDOW).toBe(5);
  });
});
