import type { CustomGamePack, GamePackDefinition } from "@/lib/domain/schemas";
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
