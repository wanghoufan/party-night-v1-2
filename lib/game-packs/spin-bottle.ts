import { z } from "zod";
import type { GamePackDefinition, GameSession } from "@/lib/domain/schemas";

/**
 * 转瓶子的 pack-local state：只记最近一次选中的玩家，用于避免连续指向同一人。
 * 结果 100% 由本地 player-selector 决定（动画只负责表现），不需要 AI 出卡。
 */
export const spinBottleStateSchema = z.object({
  lastSelectedPlayerId: z.string().min(1).optional(),
});
export type SpinBottleState = z.infer<typeof spinBottleStateSchema>;

/** 转瓶子状态在 Session.currentPackState 里的键：与其他玩法的局部状态互不覆盖。 */
export const SPIN_BOTTLE_STATE_KEY = "spin-bottle";

/** 记下落点：动画播放之前就写库，刷新只会恢复最终结果，不会恢复半截旋转（Spec Edge Cases）。 */
export function recordSpinResult(playerId: string): SpinBottleState {
  return { lastSelectedPlayerId: playerId };
}

/** 从 Session 读回转瓶子状态：缺失/损坏时返回 undefined，由调用方安全重建，不猜落点。 */
export function readSpinBottleState(session: Pick<GameSession, "currentPackState">): SpinBottleState | undefined {
  const parsed = spinBottleStateSchema.safeParse(session.currentPackState?.[SPIN_BOTTLE_STATE_KEY]);
  return parsed.success ? parsed.data : undefined;
}

export const spinBottlePack: GamePackDefinition = {
  id: "spin-bottle", name: "转瓶子", icon: "bottle", enabledByDefault: true,
  mixable: false, minPlayers: 2, supportedCardTypes: ["spin"], weight: 1, source: "builtin",
  capability: {
    requiresAIContent: false, minPlayers: 2, supportsMixedMode: false, supportsLocalSeed: true,
    renderer: "spin",
  },
};
