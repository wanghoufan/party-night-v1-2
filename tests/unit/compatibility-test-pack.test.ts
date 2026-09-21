import { describe, expect, it } from "vitest";
import { resolvePackCapability, resolvePackRenderer } from "@/lib/domain/pack-capability";
import { gamePackDefinitionSchema } from "@/lib/domain/schemas";
import { compatibilityStateSchema, compatibilityTestPack, createCompatibilityState } from "@/lib/game-packs/compatibility-test";

describe("compatibility-test pack", () => {
  it("is a valid built-in pack definition", () => {
    expect(gamePackDefinitionSchema.safeParse(compatibilityTestPack).success).toBe(true);
    expect(compatibilityTestPack).toMatchObject({
      id: "compatibility-test", name: "默契测试", source: "builtin",
      enabledByDefault: true, mixable: false, minPlayers: 2, supportedCardTypes: ["compatibility"],
    });
  });

  it("declares AI content with a local seed fallback on the compatibility renderer", () => {
    expect(compatibilityTestPack.capability).toEqual({
      requiresAIContent: true, minPlayers: 2, supportsMixedMode: false, supportsLocalSeed: true, renderer: "compatibility",
    });
    expect(resolvePackCapability(compatibilityTestPack)).toEqual(compatibilityTestPack.capability);
    expect(resolvePackRenderer(compatibilityTestPack)).toBe("compatibility");
  });

  it("starts a pair at score 0 with no rounds played", () => {
    const state = createCompatibilityState("alex", "emma");
    expect(state).toEqual({ playerAId: "alex", playerBId: "emma", score: 0, rounds: 0 });
    expect(compatibilityStateSchema.safeParse(state).success).toBe(true);
  });

  it("keeps pair, score and rounds across a serialization round trip", () => {
    const state = { ...createCompatibilityState("alex", "emma"), score: 4, rounds: 7 };
    expect(compatibilityStateSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it("rejects a state without a pair or with invalid counters", () => {
    expect(compatibilityStateSchema.safeParse({ playerAId: "", playerBId: "emma", score: 0, rounds: 0 }).success).toBe(false);
    expect(compatibilityStateSchema.safeParse({ playerAId: "alex", playerBId: "emma", score: -1, rounds: 0 }).success).toBe(false);
    expect(compatibilityStateSchema.safeParse({ playerAId: "alex", playerBId: "emma", score: 1.5, rounds: 0 }).success).toBe(false);
    expect(compatibilityStateSchema.safeParse({ playerAId: "alex", score: 0, rounds: 0 }).success).toBe(false);
  });
});
