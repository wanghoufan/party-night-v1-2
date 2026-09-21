import { gameSessionSchema, type GameSession, type Intensity, type SessionConfig } from "@/lib/domain/schemas";
import { selectCard } from "./card-selector";
import { selectParticipants } from "./player-selector";
import { getSessionStage, getStagePackPreference } from "./stage-controller";
import type { GameCard, RandomSource } from "./types";
import { createId } from "@/lib/utils/create-id";

const now = () => new Date().toISOString();
const uid = () => createId();

export function createSession(config: SessionConfig, deckSnapshot: GameCard[] = []): GameSession {
  const timestamp = now();
  return gameSessionSchema.parse({
    schemaVersion: 1,
    id: uid(),
    status: deckSnapshot.length ? "active" : "generating",
    mode: config.mode,
    config,
    deckSnapshot: structuredClone(deckSnapshot),
    usedCardIds: [],
    rounds: [],
    startedAt: deckSnapshot.length ? timestamp : undefined,
    updatedAt: timestamp,
  });
}

export function activateSession(session: GameSession, cards: GameCard[]): GameSession {
  const timestamp = now();
  return { ...session, status: "active", deckSnapshot: structuredClone(cards), startedAt: session.startedAt ?? timestamp, updatedAt: timestamp };
}

export function startRound(session: GameSession, random: RandomSource = Math.random): GameSession {
  if (session.status !== "active" || session.currentRound) return session;
  const activePlayers = session.config.players.filter((player) => player.active);
  const card = selectCard({
    cards: session.deckSnapshot,
    usedCardIds: session.usedCardIds,
    enabledPackIds: session.config.enabledPackIds,
    playerCount: activePlayers.length,
    intensity: session.config.intensity,
    boundaries: session.config.boundaries,
    preferredPackIds: getStagePackPreference(getSessionStage(session)),
    random,
  });
  if (!card) return session;
  return {
    ...session,
    usedCardIds: [...session.usedCardIds, card.id],
    currentRound: {
      id: uid(),
      cardId: card.id,
      packId: card.packId,
      participantIds: selectParticipants(card.participantMode, session.config.players, session.rounds, random),
      startedAt: now(),
    },
    updatedAt: now(),
  };
}

function resolveRound(session: GameSession, status: "completed" | "swapped" | "skipped"): GameSession {
  if (!session.currentRound) return session;
  const round = { ...session.currentRound, status, endedAt: now() };
  return { ...session, currentRound: undefined, rounds: [...session.rounds, round], updatedAt: now() };
}

export const completeRound = (session: GameSession) => resolveRound(session, "completed");
export const swapRound = (session: GameSession) => resolveRound(session, "swapped");
export const skipRound = (session: GameSession) => resolveRound(session, "skipped");
export const pauseSession = (session: GameSession): GameSession => session.status === "active" ? { ...session, status: "paused", updatedAt: now() } : session;
export const resumeSession = (session: GameSession): GameSession => session.status === "paused" ? { ...session, status: "active", updatedAt: now() } : session;
export const finishSession = (session: GameSession): GameSession => ({ ...session, status: "finished", currentRound: undefined, endedAt: now(), updatedAt: now() });

export function updateIntensity(session: GameSession, intensity: Intensity): GameSession {
  return { ...session, config: { ...session.config, intensity }, updatedAt: now() };
}

export function updatePlayers(session: GameSession, players: SessionConfig["players"]): GameSession {
  return { ...session, config: { ...session.config, players }, updatedAt: now() };
}
