import {
  eligiblePair,
  pairKey,
  type SessionParticipant,
} from "./v2-state";

export interface ScoredPair {
  pairKey: string;
  score: number;
}

export function scorePair(
  p: { shared: number; compat: number; crowd: number; personal: number; matched: boolean },
  cooldown: number,
  smallPool: boolean,
): number {
  let s =
    Math.min(p.shared, 1) * 0.5 +
    Math.min(p.compat, 1) * 0.5 +
    Math.min(p.crowd, 2) * 1 +
    Math.min(p.personal, 1) * 2 +
    (p.matched ? 5 : 0);
  if (smallPool) {
    s =
      Math.min(p.shared, 1) * 0.5 +
      Math.min(p.compat, 1) * 0.5 +
      Math.min(p.crowd, 1) * 0.5 +
      Math.min(p.personal, 1) * 1 +
      (p.matched ? 3 : 0);
  }
  return s - (cooldown > 0 ? 4 : 0);
}

export function rankPairs(
  parts: SessionParticipant[],
  signals: Record<string, { shared: number; compat: number; crowd: number; personal: number }>,
  matchedKeys: Set<string>,
  cooldowns: Record<string, number>,
): string[] {
  const keys: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      if (eligiblePair(parts[i], parts[j])) {
        keys.push(pairKey(parts[i].playerId, parts[j].playerId));
      }
    }
  }
  const smallPool = keys.length <= 6;
  const scored: ScoredPair[] = keys.map((k) => ({
    pairKey: k,
    score: scorePair(
      { ...(signals[k] ?? { shared: 0, compat: 0, crowd: 0, personal: 0 }), matched: matchedKeys.has(k) },
      cooldowns[k] ?? 0,
      smallPool,
    ),
  }));
  scored.sort((a, b) => b.score - a.score || (a.pairKey < b.pairKey ? -1 : 1));
  return scored.map((s) => s.pairKey);
}
