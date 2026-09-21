import type { Player } from "@/lib/domain/schemas";
import type { RandomSource } from "@/lib/engine/types";
import { selectEligiblePlayer } from "@/lib/engine/player-selector";

/** 随机点名（Spec US7 / FR-022）：纯本地、不调用 AI。 */
export interface RandomPlayerOptions {
  /** 上一次点名的人：还有别人可选时避开他，避免连续重复。 */
  avoidPlayerId?: string;
  random?: RandomSource;
}

/**
 * 从在场玩家里纯随机点一个人。
 * 选人规则复用共享 player-selector（与转瓶子同一套）：不选暂离玩家、能避开上一次落点、只剩一人时放宽不空转。
 */
export function pickRandomPlayer(players: Player[], options: RandomPlayerOptions = {}): Player | undefined {
  return selectEligiblePlayer(players, options);
}

/** 没有昵称时用“玩家 1 / 玩家 2…”占位（Spec Edge Cases）。 */
export function playerLabel(player: Pick<Player, "displayName">, index: number): string {
  const name = player.displayName.trim();
  return name || `玩家 ${index + 1}`;
}

/** 在场玩家的展示名表：暂离玩家不出现，顺序即在场顺序（占位编号按这个顺序算）。 */
export function playerLabels(players: Player[]): Map<string, string> {
  const labels = new Map<string, string>();
  let index = 0;
  for (const player of players) {
    if (!player.active) continue;
    labels.set(player.id, playerLabel(player, index));
    index += 1;
  }
  return labels;
}
