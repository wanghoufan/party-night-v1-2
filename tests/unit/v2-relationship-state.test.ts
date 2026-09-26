import { describe, expect, it } from "vitest";
import {
  BASE_SESSION_COMPLETED_ROUND_LIMIT,
  EXTENSION_SESSION_COMPLETED_ROUND_LIMIT,
  FIVE_TIER_GUARANTEE_QUALIFYING_LIMIT,
  HEAT_THRESHOLDS,
  INITIAL_HEAT,
  MAX_EXTENSIONS,
  MAX_SESSION_COMPLETED_ROUNDS,
  MINIMUM_EFFECTIVE_CARDS_BETWEEN_RUNS,
  MINIMUM_REMAINING_SESSION_ROUNDS_FOR_REGULAR_MUTUAL,
  MUTUAL_CHECK_COUNTS,
  RELATIONSHIP_EFFECTIVE_CARD_EVENT_TYPES,
  RELATIONSHIP_MODE,
  SOFT_DEDUP_WINDOW,
  SESSION_COMPLETED_ROUND_EVENT_TYPES,
  createEmptyPlayerCoverage,
  createInitialRelationshipState,
  eligiblePair,
  heatForEffectiveCount,
  isHeatAtLeast,
  normalizePairGender,
  pairKey,
  relationshipStateSchema,
  sessionParticipantSchema,
} from "@/lib/v2-relationship/v2-state";

describe("v2 relationship state thresholds", () => {
  it("heat 绝对阈值 0–3/4–7/8–12/13+", () => {
    const bands = HEAT_THRESHOLDS.map((b) => [b.heat, b.min, b.max === Infinity ? null : b.max]);
    expect(bands).toEqual([
      ["H1", 0, 3],
      ["H2", 4, 7],
      ["H3", 8, 12],
      ["H4", 13, null],
    ]);
  });

  it("heatForEffectiveCount 映射边界", () => {
    expect(heatForEffectiveCount(0)).toBe("H1");
    expect(heatForEffectiveCount(3)).toBe("H1");
    expect(heatForEffectiveCount(4)).toBe("H2");
    expect(heatForEffectiveCount(7)).toBe("H2");
    expect(heatForEffectiveCount(8)).toBe("H3");
    expect(heatForEffectiveCount(12)).toBe("H3");
    expect(heatForEffectiveCount(13)).toBe("H4");
    expect(heatForEffectiveCount(99)).toBe("H4");
  });

  it("Heat 单调不降与负值防御", () => {
    expect(isHeatAtLeast("H4", "H2")).toBe(true);
    expect(isHeatAtLeast("H2", "H4")).toBe(false);
    expect(heatForEffectiveCount(-5)).toBe("H1");
  });

  it("D3=A 冻结常量：fixed-20-plus-5，maxExtensions=1，上限 25", () => {
    expect(RELATIONSHIP_MODE).toBe("fixed-20-plus-5");
    expect(BASE_SESSION_COMPLETED_ROUND_LIMIT).toBe(20);
    expect(EXTENSION_SESSION_COMPLETED_ROUND_LIMIT).toBe(5);
    expect(MAX_EXTENSIONS).toBe(1);
    expect(MAX_SESSION_COMPLETED_ROUNDS).toBe(25);
  });

  it("互选节奏与 final 抑制常量", () => {
    expect(MUTUAL_CHECK_COUNTS).toEqual([9, 14, 19]);
    expect(MINIMUM_EFFECTIVE_CARDS_BETWEEN_RUNS).toBe(5);
    expect(MINIMUM_REMAINING_SESSION_ROUNDS_FOR_REGULAR_MUTUAL).toBe(2);
  });

  it("5 档保障与软去重窗口常量", () => {
    expect(FIVE_TIER_GUARANTEE_QUALIFYING_LIMIT).toBe(2);
    expect(SOFT_DEDUP_WINDOW).toBe(5);
  });

  it("双计数器事件白名单：Session 轮次 vs relationship effective", () => {
    expect(SESSION_COMPLETED_ROUND_EVENT_TYPES).toEqual([
      "REL_CARD_COMPLETED",
      "NEUTRAL_CARD_COMPLETED",
      "EXPANSION_CARD_COMPLETED",
      "LEGACY_CURRENT_COMPLETED",
    ]);
    // REL_CARD_COMPLETED 是唯一推进 relationship effective 的事件
    expect(RELATIONSHIP_EFFECTIVE_CARD_EVENT_TYPES).toEqual(["REL_CARD_COMPLETED"]);
  });
});

describe("v2 relationship state defaults", () => {
  it("createInitialRelationshipState 初始值", () => {
    const s = createInitialRelationshipState();
    expect(s.heat).toBe(INITIAL_HEAT);
    expect(s.heatProgressMode).toBe("fixed-20-plus-5");
    expect(s.sessionCompletedRounds).toBe(0);
    expect(s.relationshipEffectiveCardCount).toBe(0);
    expect(s.baseSessionCompletedRoundLimit).toBe(20);
    expect(s.extensionSessionCompletedRoundLimit).toBe(5);
    expect(s.extensionActivated).toBe(false);
    expect(s.lastMutualCheckAtEffectiveCount).toBeNull();
    expect(s.regularMutualCheckRuns).toBe(0);
    expect(s.usedCardIds).toEqual([]);
    expect(s.recentCardIds).toEqual([]);
    expect(s.exhaustionCycle).toBe(0);
    expect(s.terminalExclusivity).toEqual({});
    expect(s.processedEventIds).toEqual([]);
    expect(s.matches).toEqual({});
    expect(s.cooldowns).toEqual({});
    expect(s.fiveGuarantees).toEqual({});
  });

  it("createEmptyPlayerCoverage 初始值", () => {
    expect(createEmptyPlayerCoverage()).toEqual({
      offeredTargeted: 0,
      completedTargeted: 0,
      consecutiveTargetedSkips: 0,
      lowParticipation: false,
    });
  });
});

describe("pairGender / pair 谓词", () => {
  it("normalizePairGender 只接受 male|female，其余规范化 null", () => {
    expect(normalizePairGender("male")).toBe("male");
    expect(normalizePairGender("female")).toBe("female");
    expect(normalizePairGender(null)).toBeNull();
    expect(normalizePairGender(undefined)).toBeNull();
    expect(normalizePairGender("Other")).toBeNull();
    expect(normalizePairGender(123)).toBeNull();
  });

  it("eligiblePair 只接受男子女、active、非自身", () => {
    const a = { playerId: "a", active: true, pairGender: "male" as const };
    const b = { playerId: "b", active: true, pairGender: "female" as const };
    expect(eligiblePair(a, b)).toBe(true);
    expect(eligiblePair(b, a)).toBe(true);
    expect(eligiblePair(a, a)).toBe(false);
    expect(eligiblePair({ ...a, pairGender: null }, b)).toBe(false);
    expect(eligiblePair({ ...a, playerId: "b" }, b)).toBe(false);
    expect(eligiblePair({ ...a, active: false }, b)).toBe(false);
    expect(eligiblePair({ ...a, pairGender: "female" as const }, b)).toBe(false);
  });

  it("pairKey 无向稳定排序", () => {
    expect(pairKey("b", "a")).toBe("a::b");
    expect(pairKey("a", "b")).toBe("a::b");
  });
});

describe("session 增量兼容", () => {
  it("relationshipStateSchema 接受合法初始状态", () => {
    const ok = relationshipStateSchema.safeParse(createInitialRelationshipState());
    expect(ok.success).toBe(true);
  });

  it("relationshipStateSchema 拒绝非法 heat / 负计数", () => {
    expect(relationshipStateSchema.safeParse({ ...createInitialRelationshipState(), heat: "H5" }).success).toBe(false);
    expect(relationshipStateSchema.safeParse({ ...createInitialRelationshipState(), sessionCompletedRounds: -1 }).success).toBe(false);
  });

  it("sessionParticipantSchema 规范化 pairGender", () => {
    expect(sessionParticipantSchema.safeParse({ playerId: "p", active: true, pairGender: "male" }).success).toBe(true);
    expect(sessionParticipantSchema.safeParse({ playerId: "p", active: true, pairGender: "whatever" }).success).toBe(false);
  });
});

describe("旧 Session 原样可读", () => {
  it("gameSessionSchema 解析缺失 relationshipState/participants 的旧 Session", async () => {
    const { gameSessionSchema } = await import("@/lib/domain/schemas");
    const session = {
      schemaVersion: 2,
      id: "s",
      status: "active",
      mode: "single",
      config: {
        players: [
          { id: "p1", displayName: "A", active: true, createdAt: "x", lastUsedAt: "x" },
          { id: "p2", displayName: "B", active: true, createdAt: "x", lastUsedAt: "x" },
        ],
        relationship: "friends",
        vibes: ["funny"],
        intensity: 3,
        boundaries: {
          noPhysicalContact: false, noAlcoholPenalty: false, noExPartners: false,
          noSexualHistory: false, noMoneyIncome: false, noPhonePrivacy: false,
          noPublicPosting: false, noStrangerContact: false, noPhotoVideo: false,
          noSocialAccounts: false, customText: "",
        },
        enabledPackIds: ["truth-dare"],
        mode: "single",
      },
      deckSnapshot: [],
      usedCardIds: [],
      rounds: [],
      currentPackId: "truth-dare",
      updatedAt: "x",
    };
    const parsed = gameSessionSchema.safeParse(session);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.relationshipState).toBeUndefined();
      expect(parsed.data.participants).toBeUndefined();
    }
  });
});