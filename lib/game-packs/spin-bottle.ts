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

/** 转瓶子的玩法 id：pack-local state 在 Session.currentPackState 里就按它分键。 */
export const SPIN_BOTTLE_PACK_ID = "spin-bottle";

/** 旧口径（GAP-02 前）用的 state 键；值恰好等于玩法 id，旧数据无需改键，保留只为口径与迁移表完整。 */
export const SPIN_BOTTLE_STATE_KEY = SPIN_BOTTLE_PACK_ID;

/** 记下落点：动画播放之前就写库，刷新只会恢复最终结果，不会恢复半截旋转（Spec Edge Cases）。 */
export function recordSpinResult(playerId: string): SpinBottleState {
  return { lastSelectedPlayerId: playerId };
}

/**
 * 从 Session 读回转瓶子状态：缺失/损坏时返回 undefined，由调用方安全重建，不猜落点。
 * pack-local state 按 packId 分键（GAP-02），只认自己那一格。
 */
export function readSpinBottleState(session: Pick<GameSession, "currentPackState">): SpinBottleState | undefined {
  const parsed = spinBottleStateSchema.safeParse(session.currentPackState?.[SPIN_BOTTLE_PACK_ID]);
  return parsed.success ? parsed.data : undefined;
}

export const spinBottlePack: GamePackDefinition = {
  id: SPIN_BOTTLE_PACK_ID, name: "转瓶子", icon: "bottle", enabledByDefault: true,
  mixable: false, minPlayers: 2, supportedCardTypes: ["spin"], weight: 1, source: "builtin",
  capability: {
    requiresAIContent: false, minPlayers: 2, supportsMixedMode: false, supportsLocalSeed: true,
    renderer: "spin",
  },
};
