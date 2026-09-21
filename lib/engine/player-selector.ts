import type { Player, RandomSource, RoundHistory } from "./types";

const pick = <T>(items: T[], random: RandomSource): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;

/** 抽取下标：越界/非法随机值都收敛到合法区间，宁可重复也不能空转（SC-004）。 */
const pickIndex = (length: number, random: RandomSource): number => {
  const roll = random();
  if (!Number.isFinite(roll)) return 0;
  return Math.min(length - 1, Math.max(0, Math.floor(roll * length)));
};

export interface EligiblePlayerOptions {
  /** 上一次的落点（如转瓶子上一次选中的人）：还有别人可选时避开他，避免连续指同一人。 */
  avoidPlayerId?: string;
  random?: RandomSource;
}

/**
 * 转瓶子/随机点名这类“从在场玩家里现场抽一个”的场景接口：
 * 只从 active 玩家中选，排除 inactive；有第二人可选时避开上一次落点；只剩一人时放宽避免重复，仍然返回他。
 * 没有任何 active 玩家时返回 undefined（调用方按“无人可选”处理，不猜人）。
 */
export function selectEligiblePlayer(players: Player[], options: EligiblePlayerOptions = {}): Player | undefined {
  const random = options.random ?? Math.random;
  const active = players.filter((player) => player.active);
  if (!active.length) return undefined;
  const rotated = options.avoidPlayerId ? active.filter((player) => player.id !== options.avoidPlayerId) : active;
  const pool = rotated.length ? rotated : active;
  return pool[pickIndex(pool.length, random)]!;
}

export function selectSinglePlayer(
  players: Player[],
  rounds: RoundHistory[],
  random: RandomSource = Math.random,
): Player | undefined {
  const active = players.filter((player) => player.active);
  if (!active.length) return undefined;
  const counts = new Map(active.map((player) => [player.id, 0]));
  for (const round of rounds) {
    const id = round.participantIds[0];
    if (id && counts.has(id)) counts.set(id, counts.get(id)! + 1);
  }
  const lastId = rounds.at(-1)?.participantIds[0];
  const eligible = active.length > 1 ? active.filter((player) => player.id !== lastId) : active;
  const min = Math.min(...eligible.map((player) => counts.get(player.id) ?? 0));
  return pick(eligible.filter((player) => (counts.get(player.id) ?? 0) === min), random);
}

export function selectPlayerPair(
  players: Player[],
  rounds: RoundHistory[],
  random: RandomSource = Math.random,
): [Player, Player] | undefined {
  const active = players.filter((player) => player.active);
  if (active.length < 2) return undefined;
  const pairCounts = new Map<string, number>();
  for (const round of rounds) {
    if (round.participantIds.length !== 2) continue;
    const key = [...round.participantIds].sort().join(":");
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }
  const pairs: Array<[Player, Player]> = [];
  for (let left = 0; left < active.length; left += 1) {
    for (let right = left + 1; right < active.length; right += 1) {
      pairs.push([active[left]!, active[right]!]);
    }
  }
  const min = Math.min(...pairs.map(([a, b]) => pairCounts.get([a.id, b.id].sort().join(":")) ?? 0));
  return pick(
    pairs.filter(([a, b]) => (pairCounts.get([a.id, b.id].sort().join(":")) ?? 0) === min),
    random,
  );
}

export function selectParticipants(
  mode: "none" | "single" | "pair" | "all",
  players: Player[],
  rounds: RoundHistory[],
  random: RandomSource = Math.random,
): string[] {
  if (mode === "none") return [];
  if (mode === "all") return players.filter((player) => player.active).map((player) => player.id);
  if (mode === "pair") return selectPlayerPair(players, rounds, random)?.map((player) => player.id) ?? [];
  const selected = selectSinglePlayer(players, rounds, random);
  return selected ? [selected.id] : [];
}
