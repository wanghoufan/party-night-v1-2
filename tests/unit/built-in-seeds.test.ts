import { describe, expect, it } from "vitest";
import { boundaryTagSchema, gameCardSchema } from "@/lib/domain/schemas";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import { RANDOM_LAUNCHER_PACK_ID } from "@/lib/game-packs/random-launcher";

/** 需要可离线 seed 的 AI 玩法（转瓶子纯本地，按 Plan 7.1 不配 seed）。 */
const SEEDED_PACKS: Array<{ packId: string; type: string }> = [
  { packId: "would-you-rather", type: "would-you-rather" },
  { packId: "pointing-game", type: "pointing" },
  { packId: "compatibility-test", type: "compatibility" },
];

const seedsOf = (packId: string) => BUILTIN_SEED_CARDS.filter((card) => card.packId === packId);

describe("built-in offline seeds", () => {
  it("keeps every seed a schema-valid builtin card", () => {
    for (const card of BUILTIN_SEED_CARDS) {
      expect(gameCardSchema.safeParse(card).success).toBe(true);
      expect(card.source).toBe("builtin");
    }
  });

  it("gives the three AI packs offline seeds with their own card type and unique ids", () => {
    for (const { packId, type } of SEEDED_PACKS) {
      const cards = seedsOf(packId);
      expect(cards.length).toBeGreaterThanOrEqual(4);
      expect(cards.every((card) => card.type === type)).toBe(true);
      expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
    }
  });

  it("gives every builtin seed a globally unique id, even when a pack has several card types", () => {
    // 真心话/大冒险同属 truth-dare 却分属两个 type：id 撞车会让按 id 查卡串到另一类型的题面。
    const ids = BUILTIN_SEED_CARDS.map((card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
    const truthDare = seedsOf("truth-dare");
    expect(truthDare.map((card) => card.type).sort()).toEqual(["dare", "dare", "dare", "dare", "dare", "dare", "truth", "truth", "truth", "truth", "truth", "truth"]);
  });

  it("covers the session intensity scale so every setting can start offline", () => {
    for (const { packId } of SEEDED_PACKS) {
      const intensities = new Set(seedsOf(packId).map((card) => card.intensity));
      expect(intensities.size).toBeGreaterThanOrEqual(3);
      expect(intensities.has(1)).toBe(true);
      expect(intensities.has(3)).toBe(true);
    }
  });

  it("only uses boundary tags the session model knows", () => {
    for (const card of BUILTIN_SEED_CARDS) {
      for (const tag of card.boundaryTags) expect(boundaryTagSchema.safeParse(tag).success).toBe(true);
    }
  });

  it("never seeds the purely-local spin-bottle pack", () => {
    expect(seedsOf("spin-bottle")).toHaveLength(0);
  });

  /** V1.4 R-047：`ai-improv` 的题卡玩法已退役（id 只留作迁移锚），不能再有 seed 进任意牌堆。 */
  it("never seeds the retired ai-improv launcher", () => {
    expect(seedsOf(RANDOM_LAUNCHER_PACK_ID)).toHaveLength(0);
  });
});
