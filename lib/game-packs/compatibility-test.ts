import { z } from "zod";
import type { GamePackDefinition, GameSession, Player } from "@/lib/domain/schemas";

/** 默契测试状态在 Session.currentPackState 里的键：与其他玩法的局部状态互不覆盖。 */
export const COMPATIBILITY_STATE_KEY = "compatibility";

/**
 * 默契测试的 pack-local state：当前配对的两人、默契分数与已出题数。
 * 随 Session 一起持久化，刷新后可恢复；score 只在主持人确认“一样”时累加（reducer 见下方）。
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

/**
 * 配对是否成立：两人都在场且不是同一人。少于 2 名 active 玩家时默契测试不可用（与 minPlayers 一致）。
 */
export function isValidCompatibilityPair(playerAId: string, playerBId: string): boolean {
  return Boolean(playerAId) && Boolean(playerBId) && playerAId !== playerBId;
}

/** 已持久化的配对在刷新后是否仍然有效（玩家可能被移除/调整为 inactive）。 */
export function isPairStillActive(players: Player[], pair: { playerAId: string; playerBId: string }): boolean {
  if (!isValidCompatibilityPair(pair.playerAId, pair.playerBId)) return false;
  const active = new Set(players.filter((player) => player.active).map((player) => player.id));
  return active.has(pair.playerAId) && active.has(pair.playerBId);
}

/**
 * 默认配对：从在场玩家中取前两位。不足两人返回 undefined（玩法不可用），不猜、不占位。
 */
export function defaultCompatibilityPair(players: Player[]): [Player, Player] | undefined {
  const active = players.filter((player) => player.active);
  return active.length >= 2 ? [active[0]!, active[1]!] : undefined;
}

/**
 * 从 Session 读回默契测试状态：字段缺失/损坏时返回 undefined，由调用方安全重建，不猜分。
 */
export function readCompatibilityState(session: Pick<GameSession, "currentPackState">): CompatibilityState | undefined {
  const raw = session.currentPackState?.[COMPATIBILITY_STATE_KEY];
  const parsed = compatibilityStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** 换 pair：分数与已出题数都从 0 重新计（不同两人的默契分不能相加）。 */
export function startCompatibilityRound(state: CompatibilityState): CompatibilityState {
  return { ...state, rounds: state.rounds + 1 };
}

/**
 * 主持人判断本轮的 reducer：只有“一样”加 1 分；两种结果都累加题数（rounds = 已判轮数）。
 * 入参是“本轮判定前”的状态，返回“判定后”的状态。
 */
export function recordCompatibilityAnswer(state: CompatibilityState, answer: "same" | "different"): CompatibilityState {
  return { playerAId: state.playerAId, playerBId: state.playerBId, score: state.score + (answer === "same" ? 1 : 0), rounds: state.rounds + 1 };
}

export const compatibilityTestPack: GamePackDefinition = {
  id: "compatibility-test", name: "默契测试", icon: "heart", enabledByDefault: true,
  mixable: false, minPlayers: 2, supportedCardTypes: ["compatibility"], weight: 1, source: "builtin",
  capability: {
    requiresAIContent: true, minPlayers: 2, supportsMixedMode: false, supportsLocalSeed: true,
    renderer: "compatibility",
  },
};
