import type { GamePackDefinition } from "@/lib/domain/schemas";

export const aiImprovPack: GamePackDefinition = {
  id: "ai-improv", name: "AI 即兴任务", icon: "spark", enabledByDefault: true,
  mixable: true, minPlayers: 2, supportedCardTypes: ["improv", "pair-improv"], weight: 0.8, source: "builtin",
};
