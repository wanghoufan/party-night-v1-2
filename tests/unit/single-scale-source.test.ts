import { describe, expect, it } from "vitest";
import { aiCompatibilityCardSchema, aiPointingCardSchema, aiWouldYouRatherCardSchema } from "@/lib/ai/card-schema";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import { gamePackDefinitionSchema, intensitySchema, sessionConfigSchema, type GameCard, type Intensity } from "@/lib/domain/schemas";
import { isCardAllowed } from "@/lib/engine/card-selector";
import { createSession, startRound, updateIntensity } from "@/lib/engine/session-engine";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import { compatibilityStateSchema, COMPATIBILITY_STATE_KEY } from "@/lib/game-packs/compatibility-test";
import { pointingCardSchema } from "@/lib/game-packs/pointing-game";
import { BUILTIN_GAME_PACKS } from "@/lib/game-packs/registry";
import { spinBottleStateSchema, SPIN_BOTTLE_STATE_KEY } from "@/lib/game-packs/spin-bottle";
import { wouldYouRatherCardSchema } from "@/lib/game-packs/would-you-rather";

/**
 * T186 / FR-003 / FR-018 / FR-040 审计锁：V1.2 新增玩法只能读既有
 * SessionConfig.intensity/vibes/relationship/boundaries，不得引入第二套尺度字段。
 * 这里用“schema 形状 + 字段身份 + 筛题行为”三层锁死，而不是靠人工 review 结论。
 */
const NEW_PACK_IDS = ["would-you-rather", "pointing-game", "compatibility-test", "spin-bottle"] as const;
const NEW_AI_PACK_IDS = ["would-you-rather", "pointing-game", "compatibility-test"] as const;

/** 尺度词汇表：除 SessionConfig.intensity 外，任何字段命中都算第二套尺度。 */
const SCALE_WORDS = new Set([
  "intensity", "intensitylevel", "maxintensity", "minintensity",
  "level", "levels", "scale", "scales", "difficulty",
  "spice", "spiciness", "heat", "heatlevel", "wildness", "limits",
]);

/** 递归收集对象里所有命中尺度词汇的键名（用于证明新玩法没有自建尺度字段）。 */
function scaleLikeKeys(value: unknown, path = ""): string[] {
  if (!value || typeof value !== "object") return [];
  const found: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
    const childPath = path ? `${path}.${key}` : key;
    if (SCALE_WORDS.has(normalized)) found.push(childPath);
    found.push(...scaleLikeKeys(child, childPath));
  }
  return found;
}

const players = ["a", "b", "c", "d"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" }));

const card = (packId: string, intensity: Intensity, boundaryTags: GameCard["boundaryTags"] = []): GameCard => ({
  id: `${packId}-${intensity}-${boundaryTags.join("")}`, packId, type: packId, content: `${packId} ${intensity}`,
  intensity, tags: [], boundaryTags, minPlayers: 2, participantMode: "all", source: "builtin",
});

describe("single scale source audit（T186）", () => {
  it("SessionConfig 只有一套尺度字段，且档位固定 1–5", () => {
    expect(Object.keys(sessionConfigSchema.shape).sort()).toEqual(
      ["boundaries", "enabledPackIds", "intensity", "mode", "players", "relationship", "vibes"],
    );
    for (const value of [1, 2, 3, 4, 5]) expect(intensitySchema.safeParse(value).success).toBe(true);
    expect(intensitySchema.safeParse(0).success).toBe(false);
    expect(intensitySchema.safeParse(6).success).toBe(false);
  });

  it("四个新增玩法的定义里没有任何第二套尺度字段", () => {
    for (const packId of NEW_PACK_IDS) {
      const pack = BUILTIN_GAME_PACKS.find((item) => item.id === packId);
      expect(pack, `missing pack ${packId}`).toBeDefined();
      expect(gamePackDefinitionSchema.safeParse(pack).success).toBe(true);
      expect(scaleLikeKeys(pack)).toEqual([]);
    }
  });

  it("新增玩法的题卡契约复用同一个 intensity schema 实例", () => {
    expect(wouldYouRatherCardSchema.shape.intensity).toBe(intensitySchema);
    expect(pointingCardSchema.shape.intensity).toBe(intensitySchema);
    expect(aiWouldYouRatherCardSchema.shape.intensity).toBe(intensitySchema);
    expect(aiPointingCardSchema.shape.intensity).toBe(intensitySchema);
    for (const option of aiCompatibilityCardSchema.options) expect(option.shape.intensity).toBe(intensitySchema);
  });

  it("新增玩法的离线种子只带 Session 的 intensity 字段", () => {
    for (const seed of BUILTIN_SEED_CARDS.filter((item) => item.packId !== "spin-bottle")) {
      expect(scaleLikeKeys(seed)).toEqual(["intensity"]);
      expect(seed.intensity).toBeGreaterThanOrEqual(1);
      expect(seed.intensity).toBeLessThanOrEqual(5);
    }
  });

  it("新玩法的 packing 局部状态不含尺度字段", () => {
    expect(Object.keys(compatibilityStateSchema.shape).sort()).toEqual(["playerAId", "playerBId", "rounds", "score"]);
    expect(Object.keys(spinBottleStateSchema.shape)).toEqual(["lastSelectedPlayerId"]);
    expect(COMPATIBILITY_STATE_KEY).toBe("compatibility");
    expect(SPIN_BOTTLE_STATE_KEY).toBe("spin-bottle");
  });

  it("新玩法题卡一律按 Session 的 intensity 与 boundaries 筛选", () => {
    const pool: GameCard[] = NEW_AI_PACK_IDS.flatMap((packId) => ([1, 2, 3, 4, 5] as Intensity[]).map((value) => card(packId, value)));
    const base = { usedCardIds: [], enabledPackIds: [...NEW_AI_PACK_IDS], playerCount: 4, boundaries: DEFAULT_BOUNDARIES };

    const allowed = pool.filter((item) => isCardAllowed(item, { ...base, intensity: 2 }));
    expect(allowed.map((item) => item.intensity)).toEqual([1, 2, 1, 2, 1, 2]);

    const tagged = card("pointing-game", 2, ["physical-contact"]);
    expect(isCardAllowed(tagged, { ...base, enabledPackIds: ["pointing-game"], intensity: 5 })).toBe(true);
    expect(isCardAllowed(tagged, { ...base, enabledPackIds: ["pointing-game"], intensity: 5, boundaries: { ...DEFAULT_BOUNDARIES, noPhysicalContact: true } })).toBe(false);
  });

  it("局内改尺度对所有新玩法一视同仁，只改 config.intensity", () => {
    const session = createSession(
      { players, relationship: "friends", vibes: ["funny"], intensity: 5, boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ["pointing-game"], mode: "single" },
      NEW_AI_PACK_IDS.flatMap((packId) => ([1, 5] as Intensity[]).map((value) => card(packId, value))),
    );
    const lowered = updateIntensity(session, 1);
    expect(lowered.config.intensity).toBe(1);
    expect(Object.keys(lowered.config).sort()).toEqual(["boundaries", "enabledPackIds", "intensity", "mode", "players", "relationship", "vibes"]);

    const dealt = startRound(lowered, () => 0.99);
    const dealtCard = lowered.deckSnapshot.find((item) => item.id === dealt.currentRound?.cardId);
    expect(dealtCard?.packId).toBe("pointing-game");
    expect(dealtCard?.intensity).toBeLessThanOrEqual(1);
  });
});
