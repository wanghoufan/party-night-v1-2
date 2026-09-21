import type { Player, RandomSource, RoundHistory } from "./types";

const pick = <T>(items: T[], random: RandomSource): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;

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
