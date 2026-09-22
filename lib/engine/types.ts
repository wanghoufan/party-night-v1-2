export type {
  ActiveRound,
  BoundaryProfile,
  GameCard,
  GamePackDefinition,
  GameSession,
  Intensity,
  Player,
  RoundHistory,
  SessionConfig,
} from "@/lib/domain/schemas";

export type RandomSource = () => number;

/**
 * 玩法切换的原因（V1.5 段/轮次账）：只有主持人手动切包（`manual-switch`）才开新段，
 * 顶栏「第 n / 40」随之从 1 重计；转瓶子链入/返回与首页进包都属于同一段（`initial-entry`）。
 */
export type PackTransitionCause = "manual-switch" | "spin-chain-enter" | "spin-chain-return" | "initial-entry";
