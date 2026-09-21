import { describe, expect, it } from "vitest";
import { gamePackDefinitionSchema } from "@/lib/domain/schemas";
import { resolvePackCapability, resolvePackRenderer } from "@/lib/domain/pack-capability";
import { wouldYouRatherCardSchema, wouldYouRatherPack } from "@/lib/game-packs/would-you-rather";

describe("would-you-rather pack definition", () => {
  it("is a valid builtin pack definition", () => {
    const parsed = gamePackDefinitionSchema.safeParse(wouldYouRatherPack);
    expect(parsed.success).toBe(true);
    expect(wouldYouRatherPack).toMatchObject({
      id: "would-you-rather",
      name: "二选一",
      enabledByDefault: true,
      mixable: true,
      source: "builtin",
    });
    expect(wouldYouRatherPack.minPlayers).toBeGreaterThanOrEqual(2);
    expect(wouldYouRatherPack.supportedCardTypes).toContain("would-you-rather");
  });

  it("declares its full capability block for the shared engine", () => {
    expect(wouldYouRatherPack.capability).toEqual({
      requiresAIContent: true,
      minPlayers: 2,
      supportsMixedMode: true,
      supportsLocalSeed: true,
      renderer: "binary-choice",
    });
  });

  it("resolves through the shared capability helpers without falling back", () => {
    expect(resolvePackCapability(wouldYouRatherPack)).toEqual(wouldYouRatherPack.capability);
    expect(resolvePackRenderer(wouldYouRatherPack)).toBe("binary-choice");
  });

  it("stays playable offline through local seed structure", () => {
    expect(resolvePackCapability(wouldYouRatherPack).supportsLocalSeed).toBe(true);
    expect(resolvePackCapability(wouldYouRatherPack).requiresAIContent).toBe(true);
  });
});

describe("would-you-rather card contract", () => {
  const card = { type: "would-you-rather", optionA: "凌晨三点吃火锅", optionB: "清晨六点看日出", intensity: 2, tags: ["funny"] };

  it("accepts an A/VS/B card and defaults tags", () => {
    expect(wouldYouRatherCardSchema.safeParse(card).success).toBe(true);
    expect(wouldYouRatherCardSchema.parse({ ...card, tags: undefined }).tags).toEqual([]);
  });

  it("rejects malformed or non-textual options", () => {
    expect(wouldYouRatherCardSchema.safeParse({ ...card, type: "pointing" }).success).toBe(false);
    expect(wouldYouRatherCardSchema.safeParse({ ...card, optionA: "" }).success).toBe(false);
    expect(wouldYouRatherCardSchema.safeParse({ ...card, optionB: undefined }).success).toBe(false);
    expect(wouldYouRatherCardSchema.safeParse({ ...card, intensity: 6 }).success).toBe(false);
  });

  it("caps option length so external content cannot blow up the card", () => {
    expect(wouldYouRatherCardSchema.safeParse({ ...card, optionA: "长".repeat(121) }).success).toBe(false);
  });
});
