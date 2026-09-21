import type { GamePackDefinition } from "@/lib/domain/schemas";

export const truthOrDarePack: GamePackDefinition = {
  id: "truth-dare", name: "真心话大冒险", icon: "heart", enabledByDefault: true,
  mixable: true, minPlayers: 2, supportedCardTypes: ["truth", "dare"], weight: 1.2, source: "builtin",
};
