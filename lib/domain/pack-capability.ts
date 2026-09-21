import type { GamePackDefinition, PackCapability, PackRenderer } from "./schemas";

const RENDERER_BY_CARD_TYPE: Record<string, PackRenderer> = {
  "would-you-rather": "binary-choice",
  pointing: "pointing",
  compatibility: "compatibility",
  spin: "spin",
};

export function resolvePackRenderer(pack: Pick<GamePackDefinition, "supportedCardTypes">): PackRenderer {
  for (const cardType of pack.supportedCardTypes) {
    const renderer = RENDERER_BY_CARD_TYPE[cardType];
    if (renderer) return renderer;
  }
  return "card";
}

/**
 * 显式声明 capability 的 pack 用它；未声明的旧内置/自定义 pack 按现有字段推导默认能力，
 * 保证 V1.0 pack 行为不变（本地 seed 一律可用、混合能力沿用 mixable）。
 */
export function resolvePackCapability(pack: GamePackDefinition): PackCapability {
  return pack.capability ?? {
    requiresAIContent: false,
    minPlayers: pack.minPlayers,
    supportsMixedMode: pack.mixable,
    supportsLocalSeed: true,
    renderer: resolvePackRenderer(pack),
  };
}
