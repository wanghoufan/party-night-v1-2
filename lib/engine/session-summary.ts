import type { GameSession, SessionSummary } from "@/lib/domain/schemas";

export function calculateSessionSummary(session: GameSession): SessionSummary {
  const start = session.startedAt ? new Date(session.startedAt).getTime() : new Date(session.updatedAt).getTime();
  const end = session.endedAt ? new Date(session.endedAt).getTime() : new Date(session.updatedAt).getTime();
  return {
    id: `summary-${session.id}`,
    sessionId: session.id,
    totalRounds: session.rounds.length,
    durationSeconds: Math.max(0, Math.round((end - start) / 1000)),
    playerCount: session.config.players.length,
    packDistribution: session.rounds.reduce<Record<string, number>>((counts, round) => ({ ...counts, [round.packId]: (counts[round.packId] ?? 0) + 1 }), {}),
    endedAt: session.endedAt ?? session.updatedAt,
  };
}
