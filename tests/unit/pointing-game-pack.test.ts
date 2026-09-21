import { describe, expect, it } from "vitest";
import { gamePackDefinitionSchema } from "@/lib/domain/schemas";
import { resolvePackCapability, resolvePackRenderer } from "@/lib/domain/pack-capability";
import { pointingCardSchema, pointingGamePack } from "@/lib/game-packs/pointing-game";

describe("pointing game pack definition", () => {
  it("is a valid builtin pack definition", () => {
    const parsed = gamePackDefinitionSchema.safeParse(pointingGamePack);
    expect(parsed.success).toBe(true);
    expect(pointingGamePack).toMatchObject({
      id: "pointing-game",
      name: "指人游戏",
      enabledByDefault: true,
      mixable: true,
      source: "builtin",
    });
    expect(pointingGamePack.minPlayers).toBeGreaterThanOrEqual(2);
    expect(pointingGamePack.supportedCardTypes).toContain("pointing");
  });

  it("declares its full capability block for the shared engine", () => {
    expect(pointingGamePack.capability).toEqual({
      requiresAIContent: true,
      minPlayers: 3,
      supportsMixedMode: true,
      supportsLocalSeed: true,
      renderer: "pointing",
    });
    expect(pointingGamePack.capability?.minPlayers).toBe(pointingGamePack.minPlayers);
  });

  it("resolves through the shared capability helpers without falling back", () => {
    expect(resolvePackCapability(pointingGamePack)).toEqual(pointingGamePack.capability);
    expect(resolvePackRenderer(pointingGamePack)).toBe("pointing");
  });

  it("stays playable offline through local seed structure", () => {
    expect(resolvePackCapability(pointingGamePack).supportsLocalSeed).toBe(true);
    expect(resolvePackCapability(pointingGamePack).requiresAIContent).toBe(true);
  });
});

describe("pointing card contract", () => {
  const card = { type: "pointing", prompt: "指一个你觉得今晚最会隐藏秘密的人", intensity: 2, tags: ["icebreaker"] };

  it("accepts an instruction card and defaults tags", () => {
    expect(pointingCardSchema.safeParse(card).success).toBe(true);
    expect(pointingCardSchema.parse({ ...card, tags: undefined }).tags).toEqual([]);
  });

  it("rejects probability-style or malformed cards", () => {
    expect(pointingCardSchema.safeParse({ ...card, type: "vote" }).success).toBe(false);
    expect(pointingCardSchema.safeParse({ ...card, prompt: "" }).success).toBe(false);
    expect(pointingCardSchema.safeParse({ ...card, intensity: 0 }).success).toBe(false);
  });

  it("caps prompt length so external content cannot blow up the card", () => {
    expect(pointingCardSchema.safeParse({ ...card, prompt: "指".repeat(201) }).success).toBe(false);
  });
});
