import type { CustomGamePack, GamePackDefinition, PackRenderer } from "@/lib/domain/schemas";
import { resolvePackCapability } from "@/lib/domain/pack-capability";
import { aiImprovPack } from "./ai-improv";
import { compatibilityTestPack } from "./compatibility-test";
import { mostLikelyPack } from "./most-likely";
import { neverHaveIEverPack } from "./never-have-i-ever";
import { pointingGamePack } from "./pointing-game";
import { spinBottlePack } from "./spin-bottle";
import { truthOrDarePack } from "./truth-or-dare";
import { wouldYouRatherPack } from "./would-you-rather";

export const BUILTIN_GAME_PACKS = [
  truthOrDarePack, mostLikelyPack, neverHaveIEverPack, aiImprovPack,
  wouldYouRatherPack, pointingGamePack, compatibilityTestPack, spinBottlePack,
] as const;

export function createGamePackRegistry(customPacks: CustomGamePack[] = []): Map<string, GamePackDefinition> {
  const registry = new Map<string, GamePackDefinition>();
  for (const pack of BUILTIN_GAME_PACKS) registry.set(pack.id, pack);
  for (const pack of customPacks.filter((item) => item.enabled)) registry.set(pack.definition.id, pack.definition);
  return registry;
}

export function getGamePack(id: string, customPacks: CustomGamePack[] = []): GamePackDefinition | undefined {
  return createGamePackRegistry(customPacks).get(id);
}

/** 主局 renderer host 用：按 packId 取 registry 声明的 renderer，未知/自定义玩法回落到通用题卡视图。 */
export function resolvePackRendererById(id: string, customPacks: CustomGamePack[] = []): PackRenderer {
  const pack = getGamePack(id, customPacks);
  return pack ? resolvePackCapability(pack).renderer : "card";
}

/** 不需要任何题卡的纯本地玩法（转瓶子）：renderer 自己就是完整玩法，主局不出卡、也不被别的 pack 的卡顶掉。 */
const CARDLESS_RENDERERS: PackRenderer[] = ["spin"];

export function packIsCardless(id: string, customPacks: CustomGamePack[] = []): boolean {
  return CARDLESS_RENDERERS.includes(resolvePackRendererById(id, customPacks));
}
