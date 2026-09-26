import {
  FIVE_TIER_GUARANTEE_QUALIFYING_LIMIT,
  type PairFiveGuarantee,
  type PendingFiveGuarantee,
} from './v2-state';

/** 五重保障状态机事件：合格机会、展示、暂停、恢复、过期。 */
export type FiveGuaranteeEvent = {
  kind: 'qualify' | 'present' | 'pause' | 'resume' | 'expire';
  reason?: string;
};

/**
 * D7 五重保障推进（纯函数，不修改入参）。
 *
 * 规则：
 * - 无保障 + qualify → 以「已见 1 次合格机会」建立 pending 保障。
 * - pending + qualify → 已见 +1；达到上限(2) 转为 offered 终态。qualify 仅累计尚未展示的合格机会。
 * - pending + present → offered 即时终态（D7 展示即终态）。
 * - pending + pause → paused；paused + resume → pending。
 * - 任意非终态 + expire → expired 终态。
 * - offered / expired 为终态，遇到任何事件保持不变（幂等）。
 */
export function advanceGuarantee(
  g: PairFiveGuarantee | null,
  ev: FiveGuaranteeEvent,
): PairFiveGuarantee {
  const pairKey = g?.pairKey ?? '';
  const tracker = g?.tracker ?? null;

  // 无保障：只有 qualify 能建立 pending 保障，其余事件保持无保障。
  if (tracker === null) {
    if (ev.kind !== 'qualify') {
      return { pairKey, tracker: null };
    }
    return {
      pairKey,
      tracker: {
        status: 'pending',
        qualifyingOpportunitiesSeen: 1,
        qualifyingOpportunitiesLimit: FIVE_TIER_GUARANTEE_QUALIFYING_LIMIT,
        createdAtEffectiveCount: 0,
      },
    };
  }

  // 终态冻结：offered / expired 对任何事件都不再变化。
  if (tracker.status === 'offered' || tracker.status === 'expired') {
    return { pairKey, tracker };
  }

  // D7 展示即终态：pending 保障一旦展示合法卡，立即进入 offered 终态。
  if (ev.kind === 'present') {
    if (tracker.status !== 'pending') {
      return { pairKey, tracker };
    }
    const presented: PendingFiveGuarantee = { ...tracker, status: 'offered' };
    return { pairKey, tracker: presented };
  }

  if (ev.kind === 'expire') {
    const expired: PendingFiveGuarantee = { ...tracker, status: 'expired' };
    if (ev.reason !== undefined) {
      expired.terminalReason = ev.reason;
    }
    return { pairKey, tracker: expired };
  }

  if (ev.kind === 'qualify') {
    if (tracker.status !== 'pending') {
      return { pairKey, tracker };
    }
    const seen = tracker.qualifyingOpportunitiesSeen + 1;
    const reached = seen >= tracker.qualifyingOpportunitiesLimit;
    return {
      pairKey,
      tracker: {
        ...tracker,
        qualifyingOpportunitiesSeen: seen,
        status: reached ? 'offered' : 'pending',
      },
    };
  }

  if (ev.kind === 'pause') {
    if (tracker.status !== 'pending') {
      return { pairKey, tracker };
    }
    const paused: PendingFiveGuarantee = { ...tracker, status: 'paused' };
    if (ev.reason !== undefined) {
      paused.pauseReason = ev.reason;
    }
    return { pairKey, tracker: paused };
  }

  // resume
  if (tracker.status !== 'paused') {
    return { pairKey, tracker };
  }
  const resumed: PendingFiveGuarantee = { ...tracker, status: 'pending' };
  delete resumed.pauseReason;
  return { pairKey, tracker: resumed };
}
