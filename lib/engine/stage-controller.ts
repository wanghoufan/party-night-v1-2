import type { GameSession } from "./types";

export type SessionStage = "warm-up" | "flow" | "heat-up";

export function getSessionStage(session: Pick<GameSession, "rounds">, plannedRounds = 20): SessionStage {
  const progress = session.rounds.length / Math.max(1, plannedRounds);
  if (progress < 0.25) return "warm-up";
  if (progress < 0.65) return "flow";
  return "heat-up";
}

export function getStagePackPreference(stage: SessionStage): string[] {
  if (stage === "warm-up") return ["most-likely", "never-have", "truth-dare"];
  if (stage === "heat-up") return ["truth-dare", "ai-improv", "most-likely"];
  return ["truth-dare", "most-likely", "never-have", "ai-improv"];
}
