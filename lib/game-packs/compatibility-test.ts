import { z } from "zod";
import type { GamePackDefinition } from "@/lib/domain/schemas";

/**
 * 默契测试的 pack-local state：当前配对的两人、默契分数与已出题数。
 * 随 Session 一起持久化，刷新后可恢复；score 只在主持人确认“一样”时累加（reducer 见 engine 层）。
 */
export const compatibilityStateSchema = z.object({
  playerAId: z.string().min(1),
  playerBId: z.string().min(1),
  score: z.number().int().nonnegative(),
  rounds: z.number().int().nonnegative(),
});
export type CompatibilityState = z.infer<typeof compatibilityStateSchema>;

export function createCompatibilityState(playerAId: string, playerBId: string): CompatibilityState {
  return { playerAId, playerBId, score: 0, rounds: 0 };
}

export const compatibilityTestPack: GamePackDefinition = {
  id: "compatibility-test", name: "默契测试", icon: "heart", enabledByDefault: true,
  mixable: false, minPlayers: 2, supportedCardTypes: ["compatibility"], weight: 1, source: "builtin",
  capability: {
    requiresAIContent: true, minPlayers: 2, supportsMixedMode: false, supportsLocalSeed: true,
    renderer: "compatibility",
  },
};
