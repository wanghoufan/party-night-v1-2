import type { GameSession } from "./types";

export type SessionStage = "warm-up" | "flow" | "heat-up";

export function getSessionStage(session: Pick<GameSession, "rounds">, plannedRounds = 20): SessionStage {
  const progress = session.rounds.length / Math.max(1, plannedRounds);
  if (progress < 0.25) return "warm-up";
  if (progress < 0.65) return "flow";
  return "heat-up";
}

/**
 * 混合模式的阶段出题偏好。V1.4：退役的「AI 即兴」不再占据原来的 20% 槽位（R-047），
 * 混合分布只在真实题卡玩法之间调整；preferred 抽不到时仍回落到本局启用集合，不空转。
 */
export function getStagePackPreference(stage: SessionStage): string[] {
  if (stage === "warm-up") return ["most-likely", "never-have", "truth-dare"];
  if (stage === "heat-up") return ["truth-dare", "most-likely"];
  return ["truth-dare", "most-likely", "never-have"];
}
