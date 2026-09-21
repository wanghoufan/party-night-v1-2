import { describe, expect, it } from "vitest";
import { resolvePackCapability, resolvePackRenderer } from "@/lib/domain/pack-capability";
import { gamePackDefinitionSchema } from "@/lib/domain/schemas";
import { spinBottlePack, spinBottleStateSchema } from "@/lib/game-packs/spin-bottle";

describe("spin-bottle pack", () => {
  it("is a valid built-in pack definition", () => {
    expect(gamePackDefinitionSchema.safeParse(spinBottlePack).success).toBe(true);
    expect(spinBottlePack).toMatchObject({
      id: "spin-bottle", name: "转瓶子", source: "builtin", icon: "bottle",
      enabledByDefault: true, mixable: false, minPlayers: 2, supportedCardTypes: ["spin"],
    });
  });

  it("declares a purely local pack with no AI card requirement", () => {
    expect(spinBottlePack.capability).toEqual({
      requiresAIContent: false, minPlayers: 2, supportsMixedMode: false, supportsLocalSeed: true, renderer: "spin",
    });
    expect(resolvePackCapability(spinBottlePack).requiresAIContent).toBe(false);
    expect(resolvePackRenderer(spinBottlePack)).toBe("spin");
  });

  it("accepts an empty state or the last selected player", () => {
    expect(spinBottleStateSchema.parse({})).toEqual({});
    expect(spinBottleStateSchema.parse({ lastSelectedPlayerId: "alex" })).toEqual({ lastSelectedPlayerId: "alex" });
  });

  it("rejects a blank last selected player", () => {
    expect(spinBottleStateSchema.safeParse({ lastSelectedPlayerId: "" }).success).toBe(false);
  });
});
