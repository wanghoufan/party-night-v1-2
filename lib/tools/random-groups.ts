import type { Player } from "@/lib/domain/schemas";
import type { RandomSource } from "@/lib/engine/types";

/** 随机分组（Spec US7 / FR-023）：纯本地 shuffle + 均衡分配，不调用 AI。 */
export interface RandomGroupsOptions {
  /** 分几组；与 groupSize 二选一。默认 2 组。 */
  groups?: number;
  /** 每组人数（“两人一组”传 2）；按需要多少组反推组数。 */
  groupSize?: number;
  random?: RandomSource;
}

const DEFAULT_GROUP_COUNT = 2;

/** 抽取下标：越界/非法随机值都收敛到合法区间，保证纯函数可复现、不越界（与 player-selector 同口径）。 */
function rollIndex(length: number, random: RandomSource): number {
  const roll = random();
  if (!Number.isFinite(roll)) return 0;
  return Math.min(length - 1, Math.max(0, Math.floor(roll * length)));
}

/** Fisher–Yates 洗牌：不改原数组，随机源可注入。 */
export function shuffle<T>(items: T[], random: RandomSource = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = rollIndex(index + 1, random);
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

/**
 * 随机分组：先洗牌再均衡切分，组间人数差 ≤1（奇数余数先落在前面的组）。
 * 组数/每组人数都会收敛到不超过在场人数，绝不产生空组；暂离玩家不参与。
 */
export function randomGroups(players: Player[], options: RandomGroupsOptions = {}): Player[][] {
  const random = options.random ?? Math.random;
  const active = players.filter((player) => player.active);
  if (!active.length) return [];
  const requested = options.groupSize ? Math.ceil(active.length / options.groupSize) : options.groups ?? DEFAULT_GROUP_COUNT;
  const groupCount = Math.max(1, Math.min(Math.floor(requested) || 1, active.length));

  const shuffled = shuffle(active, random);
  const base = Math.floor(active.length / groupCount);
  const remainder = active.length % groupCount;
  const groups: Player[][] = [];
  let cursor = 0;
  for (let index = 0; index < groupCount; index += 1) {
    const size = base + (index < remainder ? 1 : 0);
    groups.push(shuffled.slice(cursor, cursor + size));
    cursor += size;
  }
  return groups;
}
