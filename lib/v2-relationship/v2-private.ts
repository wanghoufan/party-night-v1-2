import { createId } from '@/lib/utils/create-id';

/**
 * B4 私密互选运行态。
 *
 * 仅存活于当前内存（进程内对象），本模块不 import 任何 storage / DB，
 * 单向答案永不落地：没有任何持久化入口，调用方丢弃引用即彻底消失。
 */
export interface PrivateMutualRun {
  runId: string;
  pairKey: string;
  playerIds: [string, string];
  selections: Record<string, string | null>;
  maskRevealed: boolean;
}

/** 建立一道私密互选 run：双方选择初始为 null，遮罩关闭。 */
export function beginPrivateRun(pairKey: string, playerIds: [string, string]): PrivateMutualRun {
  const [first, second] = playerIds;
  return {
    runId: createId(),
    pairKey,
    playerIds: [first, second],
    selections: { [first]: null, [second]: null },
    maskRevealed: false,
  };
}

/**
 * 就地写入一方选择（只改内存对象，不持久化）。
 *
 * 仅接受本 run 内的两位玩家；maskRevealed 在双方都有选择时打开，
 * 任一方选择被清回 null 时随之关闭。
 */
export function submitPrivateChoice(
  run: PrivateMutualRun,
  playerId: string,
  choice: string | null,
): PrivateMutualRun {
  const [first, second] = run.playerIds;
  if (playerId !== first && playerId !== second) {
    return run;
  }
  run.selections[playerId] = choice;
  run.maskRevealed = run.selections[first] !== null && run.selections[second] !== null;
  return run;
}

/**
 * 互选结果：只有双方都选了同一非空值才算 match，否则 no-action。
 *
 * 返回值恒为 `{ match }`，绝不带任何单向明细（谁选了什么一律不返回）。
 */
export function mutualResult(run: PrivateMutualRun): { match: boolean } {
  const [first, second] = run.playerIds;
  const left = run.selections[first] ?? null;
  const right = run.selections[second] ?? null;
  return { match: left !== null && right !== null && left === right };
}

/** 就地清零选择痕迹并关闭遮罩；调用方随后丢弃引用即可。 */
export function clearPrivateRun(run: PrivateMutualRun): void {
  for (const playerId of Object.keys(run.selections)) {
    run.selections[playerId] = null;
  }
  run.maskRevealed = false;
}
