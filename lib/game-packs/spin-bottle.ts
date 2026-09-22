import { z } from "zod";
import type { GamePackDefinition, GameSession } from "@/lib/domain/schemas";

/**
 * 转瓶子的 pack-local state：最近一次落点（避免连续指同一人）+ 链入真心话/大冒险的相位账（V1.5）。
 * 结果 100% 由本地 player-selector 决定（动画只负责表现），不需要 AI 出卡。
 *
 * 链相位五态（Plan V1.5）：enter → question → replacing → resolving → returning。
 * 只有 question（题面在桌上）与 returning（回瓶子 ready）是稳定态，其余是每次动作内部的一步。
 */
export const spinChainPhaseSchema = z.enum(["enter", "question", "replacing", "resolving", "returning"]);
export const spinChainSchema = z.object({
  phase: spinChainPhaseSchema,
  kind: z.enum(["truth", "dare"]),
  /** 被指到的人：本轮参与者固定是他，不随出题重抽。 */
  targetPlayerId: z.string().min(1),
  /** 姓名快照：被指到的人中途离场也照旧显示这个名字，不换人。 */
  targetName: z.string().min(1),
  /** 真心话与大冒险都出完了：回瓶子并提示，不再空转出题。 */
  exhausted: z.boolean().optional(),
  /**
   * L1 洗牌循环（V1.6）：哪几类题已经从头再来过——该类用完就把已用记录清空，题目会重复，但永不卡住现场。
   * 存在链账里是为了刷新后提示还在，主持人知道自己看到的是重复题而不是新题。
   */
  recycled: z.array(z.enum(["truth", "dare"])).optional(),
});
export type SpinChainPhase = z.infer<typeof spinChainPhaseSchema>;
export type SpinChainState = z.infer<typeof spinChainSchema>;

export const spinBottleStateSchema = z.object({
  lastSelectedPlayerId: z.string().min(1).optional(),
  chain: spinChainSchema.optional(),
});
export type SpinBottleState = z.infer<typeof spinBottleStateSchema>;

/** 转瓶子的玩法 id：pack-local state 在 Session.currentPackState 里就按它分键。 */
export const SPIN_BOTTLE_PACK_ID = "spin-bottle";

/** 旧口径（GAP-02 前）用的 state 键；值恰好等于玩法 id，旧数据无需改键，保留只为口径与迁移表完整。 */
export const SPIN_BOTTLE_STATE_KEY = SPIN_BOTTLE_PACK_ID;

/** 记下落点：动画播放之前就写库，刷新只会恢复最终结果，不会恢复半截旋转（Spec Edge Cases）。 */
export function recordSpinResult(playerId: string): SpinBottleState {
  // 重新开转＝上一轮链已结束，这里刻意不带 chain，顺带把旧链相位清干净。
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

/** 链的相位（enter/question/replacing/resolving/returning）；没进过链时 undefined。 */
export function readSpinChain(session: Pick<GameSession, "currentPackState">): SpinChainState | undefined {
  return readSpinBottleState(session)?.chain;
}

export const spinBottlePack: GamePackDefinition = {
  id: SPIN_BOTTLE_PACK_ID, name: "转瓶子", icon: "bottle", enabledByDefault: true,
  mixable: false, minPlayers: 2, supportedCardTypes: ["spin"], weight: 1, source: "builtin",
  capability: {
    requiresAIContent: false, minPlayers: 2, supportsMixedMode: false, supportsLocalSeed: true,
    renderer: "spin",
  },
};
