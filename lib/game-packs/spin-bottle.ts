import { z } from "zod";
import type { GamePackDefinition } from "@/lib/domain/schemas";

/**
 * 转瓶子的 pack-local state：只记最近一次选中的玩家，用于避免连续指向同一人。
 * 结果 100% 由本地 player-selector 决定（动画只负责表现），不需要 AI 出卡。
 */
export const spinBottleStateSchema = z.object({
  lastSelectedPlayerId: z.string().min(1).optional(),
});
export type SpinBottleState = z.infer<typeof spinBottleStateSchema>;

export const spinBottlePack: GamePackDefinition = {
  id: "spin-bottle", name: "转瓶子", icon: "bottle", enabledByDefault: true,
  mixable: false, minPlayers: 2, supportedCardTypes: ["spin"], weight: 1, source: "builtin",
  capability: {
    requiresAIContent: false, minPlayers: 2, supportsMixedMode: false, supportsLocalSeed: true,
    renderer: "spin",
  },
};
