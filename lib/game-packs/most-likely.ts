import type { GamePackDefinition } from "@/lib/domain/schemas";

export const mostLikelyPack: GamePackDefinition = {
  id: "most-likely", name: "谁最可能", icon: "people", enabledByDefault: true,
  mixable: true, minPlayers: 3, supportedCardTypes: ["vote"], weight: 1, source: "builtin",
};
