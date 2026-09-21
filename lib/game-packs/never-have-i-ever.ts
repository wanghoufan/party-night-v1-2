import type { GamePackDefinition } from "@/lib/domain/schemas";

export const neverHaveIEverPack: GamePackDefinition = {
  id: "never-have", name: "我从来没有", icon: "glass", enabledByDefault: true,
  mixable: true, minPlayers: 2, supportedCardTypes: ["statement"], weight: 1, source: "builtin",
};
