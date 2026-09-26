import { SOFT_DEDUP_WINDOW } from './v2-state';

/**
 * B5 耗尽控制器（D8=A+，纯函数）。
 *
 * D8 冻结的耗尽顺序（Exhaustion Controller 是唯一决策者，Pack 不得自建另一套回退）：
 *   BUCKET_OK -> BUCKET_EMPTY -> PACK_EXHAUSTED -> RELATIONSHIP_GLOBAL_EXHAUSTED
 *   -> AWAITING_HOST_EXHAUSTION_DECISION
 *
 * 硬合法集计数口径（`hard`）：三者皆为「通过全部硬过滤后仍可出的卡数」，
 * 过滤包含 capability / Intensity-Heat / boundary-current consent / target-pair-MATCH /
 * used / 硬 cooldown。`widenedAvailable` 表示「放宽软去重窗口后仍可出的卡数」，
 * 软去重窗口可 5→4→3→2→1→0 逐步放宽；放宽到 0 仍为 0 才算桶真的空。
 *
 * 判定优先级（先判桶、再判包、最后判全局，逐条命中即返回）：
 *   1. bucket > 0                    -> BUCKET_OK（当前桶硬合法集非空，仍可正常出卡）
 *   2. bucket === 0 且放宽后有卡      -> BUCKET_EMPTY（可放宽软去重窗口救回）
 *   3. 放宽到 0 仍空且 pack > 0       -> PACK_EXHAUSTED（桶无可救，包内仍有兜底）
 *   4. pack === 0 且 global > 0       -> RELATIONSHIP_GLOBAL_EXHAUSTED（包已空，全局仍有卡）
 *   5. 三层皆 0                       -> AWAITING_HOST_EXHAUSTION_DECISION（交 Host）
 *
 * 本模块永不回退 V1.6 Router：不 import `lib/engine/card-selector`（或任何旧 selector / 旧权重路由）。
 */
export type ExhaustionLevel =
  | 'BUCKET_OK'
  | 'BUCKET_EMPTY'
  | 'PACK_EXHAUSTED'
  | 'RELATIONSHIP_GLOBAL_EXHAUSTED'
  | 'AWAITING_HOST_EXHAUSTION_DECISION';

/**
 * 判定当前耗尽层级（纯函数，不修改入参）。
 *
 * @param hard 三层硬合法集剩余计数：bucket=当前桶、pack=当前 pack、global=全局关系硬合法集。
 * @param widenedAvailable 放宽软去重窗口后仍可出的卡数（> 0 表示桶可被放宽救回）。
 */
export function assessExhaustion(
  hard: { bucket: number; pack: number; global: number },
  widenedAvailable: number,
): ExhaustionLevel {
  if (hard.bucket > 0) return 'BUCKET_OK';
  if (widenedAvailable > 0) return 'BUCKET_EMPTY';
  if (hard.pack > 0) return 'PACK_EXHAUSTED';
  if (hard.global > 0) return 'RELATIONSHIP_GLOBAL_EXHAUSTED';
  return 'AWAITING_HOST_EXHAUSTION_DECISION';
}

/**
 * 软去重窗口逐级放宽：5 -> 4 -> 3 -> 2 -> 1 -> 0，0 保持 0（不回弹、不越过上限 5）。
 *
 * 放宽只移除最早的 recent 约束，不改动硬过滤 / used / cooldown，
 * 窗口降到 0 也不是 V1.6 权重路由的入口。
 */
export function widenDedupWindow(current: number): number {
  if (current <= 0) return 0;
  return Math.min(current, SOFT_DEDUP_WINDOW) - 1;
}

/** Host 决策前的关系态快照（`recentCardIds` 恒被保留，见 applyHostDecision 注释）。 */
export interface HostDecisionState {
  usedCardIds: string[];
  recentCardIds: string[];
  exhaustionCycle: number;
}

/**
 * 应用 Host 显式决策（纯函数，不修改入参）。
 *
 * - `finish`：原样返回，`usedCardIds` 与 `exhaustionCycle` 均不变（结束本局，不做任何清理）。
 * - `reshuffle`：仅清空 `usedCardIds` 并将 `exhaustionCycle + 1`；
 *   `recentCardIds` 最近 5 张、Heat / Coverage / Signals / MATCH / cooldown / 5 档 tracker 全部保留，
 *   因此返回值里不出现 recentCardIds（调用方原快照里的那份原封不动）。
 *
 * 幂等键由调用方按 `sessionId + exhaustionCycle + 1` 组装，本函数只负责 +1，
 * 不处理恢复/重放去重（重放不得多清一次或多加一个 cycle）。
 */
export function applyHostDecision(
  s: HostDecisionState,
  decision: 'finish' | 'reshuffle',
): { usedCardIds: string[]; exhaustionCycle: number } {
  if (decision === 'finish') {
    return { usedCardIds: s.usedCardIds, exhaustionCycle: s.exhaustionCycle };
  }
  return { usedCardIds: [], exhaustionCycle: s.exhaustionCycle + 1 };
}
