import { describe, expect, it } from "vitest";
import { packCapabilitySchema } from "@/lib/domain/schemas";
import { resolvePackCapability } from "@/lib/domain/pack-capability";
import { BUILTIN_GAME_PACKS, createGamePackRegistry, getGamePack, resolvePackRendererById } from "@/lib/game-packs/registry";
import { RANDOM_LAUNCHER_PACK_ID, isRandomLauncherPackId } from "@/lib/game-packs/random-launcher";

/** V1.1 Phase 3 新增的四个玩法，默认启用策略与 V1.0 内置一致。 */
const NEW_PACK_IDS = ["would-you-rather", "pointing-game", "compatibility-test", "spin-bottle"] as const;

describe("game pack registry", () => {
  it("exposes eight decoupled built-in packs", () => {
    expect(BUILTIN_GAME_PACKS).toHaveLength(8);
    expect(createGamePackRegistry().size).toBe(8);
  });

  it("resolves every built-in pack by a unique id", () => {
    const ids = BUILTIN_GAME_PACKS.map((pack) => pack.id);
    expect(new Set(ids).size).toBe(BUILTIN_GAME_PACKS.length);
    for (const pack of BUILTIN_GAME_PACKS) expect(getGamePack(pack.id)).toBe(pack);
  });

  it("keeps every built-in pack on a legal minPlayers", () => {
    for (const pack of BUILTIN_GAME_PACKS) {
      expect(Number.isInteger(pack.minPlayers)).toBe(true);
      expect(pack.minPlayers).toBeGreaterThanOrEqual(2);
    }
  });

  it("declares a complete, resolvable capability block for every built-in pack", () => {
    for (const pack of BUILTIN_GAME_PACKS) {
      const capability = resolvePackCapability(pack);
      expect(packCapabilitySchema.safeParse(capability).success).toBe(true);
      expect(capability.minPlayers).toBe(pack.minPlayers);
      // 启动器不出任何题卡，因此没有本地 seed；其余内置玩法都能离线补位。
      expect(capability.supportsLocalSeed).toBe(!isRandomLauncherPackId(pack.id));
    }
  });

  it("enables the four new packs by default like the V1.0 packs", () => {
    for (const id of NEW_PACK_IDS) expect(getGamePack(id)?.enabledByDefault).toBe(true);
    expect(BUILTIN_GAME_PACKS.every((pack) => pack.enabledByDefault)).toBe(true);
  });

  /** 主局 renderer host 只认 registry 声明的 renderer，未知/自定义玩法一律回落到通用题卡视图。 */
  it("resolves the renderer of a pack id straight from the registry", () => {
    expect(resolvePackRendererById("would-you-rather")).toBe("binary-choice");
    expect(resolvePackRendererById("pointing-game")).toBe("pointing");
    expect(resolvePackRendererById("compatibility-test")).toBe("compatibility");
    expect(resolvePackRendererById("spin-bottle")).toBe("spin");
    expect(resolvePackRendererById("truth-dare")).toBe("card");
    expect(resolvePackRendererById("custom-pack")).toBe("card");
  });

  /** V1.4 R-047/R-050：`ai-improv` 这个 id 只留作迁移锚，玩法本体已是动作型「随机玩一个」。 */
  describe("retired ai-improv id reused as the random launcher", () => {
    it("keeps the legacy id but exposes a launcher definition instead of a playable pack", () => {
      const pack = getGamePack(RANDOM_LAUNCHER_PACK_ID);
      expect(isRandomLauncherPackId(RANDOM_LAUNCHER_PACK_ID)).toBe(true);
      expect(pack).toMatchObject({ id: "ai-improv", name: "随机玩一个", mixable: false });
      expect(resolvePackRendererById(RANDOM_LAUNCHER_PACK_ID)).toBe("random-launcher");
      expect(resolvePackCapability(pack!).supportsMixedMode).toBe(false);
    });

    it("stays out of the mixed rotation and carries no seeds of its own", () => {
      expect(resolvePackCapability(getGamePack(RANDOM_LAUNCHER_PACK_ID)!).requiresAIContent).toBe(false);
      expect(resolvePackCapability(getGamePack(RANDOM_LAUNCHER_PACK_ID)!).supportsLocalSeed).toBe(false);
    });
  });
});
