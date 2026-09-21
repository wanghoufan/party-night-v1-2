import type { CustomGamePack, GamePackDefinition } from "@/lib/domain/schemas";
import { aiImprovPack } from "./ai-improv";
import { mostLikelyPack } from "./most-likely";
import { neverHaveIEverPack } from "./never-have-i-ever";
import { truthOrDarePack } from "./truth-or-dare";

export const BUILTIN_GAME_PACKS = [truthOrDarePack, mostLikelyPack, neverHaveIEverPack, aiImprovPack] as const;

export function createGamePackRegistry(customPacks: CustomGamePack[] = []): Map<string, GamePackDefinition> {
  const registry = new Map<string, GamePackDefinition>();
  for (const pack of BUILTIN_GAME_PACKS) registry.set(pack.id, pack);
  for (const pack of customPacks.filter((item) => item.enabled)) registry.set(pack.definition.id, pack.definition);
  return registry;
}

export function getGamePack(id: string, customPacks: CustomGamePack[] = []): GamePackDefinition | undefined {
  return createGamePackRegistry(customPacks).get(id);
}
