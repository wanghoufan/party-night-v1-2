"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NeonBackground } from "@/components/brand/NeonBackground";
import { Button } from "@/components/ui/Button";
import { GameCardView } from "@/components/game/GameCardView";
import { InGameSettings } from "@/components/game/InGameSettings";
import { RoundActions } from "@/components/game/RoundActions";
import { RoundHeader } from "@/components/game/RoundHeader";
import { RoundTimer } from "@/components/game/RoundTimer";
import type { GameSession, Intensity, Player } from "@/lib/domain/schemas";
import { completeRound, finishSession, pauseSession, resumeSession, skipRound, startRound, swapRound, updateIntensity, updatePlayers } from "@/lib/engine/session-engine";
import { sessionRepository } from "@/lib/storage/session-repository";

function GamePageContent() {
  const router = useRouter();
  const id = useSearchParams().get("session");
  const [session, setSession] = useState<GameSession>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => { if (!id) return router.replace("/"); void sessionRepository.get(id).then(async (stored) => { if (!stored) return router.replace("/"); const next = stored.currentRound ? stored : startRound(stored); await sessionRepository.save(next); setSession(next); }); }, [id, router]);
  async function commit(next: GameSession) { await sessionRepository.save(next); setSession(next); }
  async function resolve(action: "complete" | "swap" | "skip") { if (!session) return; const resolved = action === "complete" ? completeRound(session) : action === "swap" ? swapRound(session) : skipRound(session); const next = startRound(resolved); if (!next.currentRound) { const finished = finishSession(resolved); await commit(finished); router.push(`/summary?session=${finished.id}`); } else await commit(next); }
  async function changeIntensity(value: Intensity) { if (session) await commit(updateIntensity(session, value)); }
  async function changePlayers(value: Player[]) { if (session && value.filter((player) => player.active).length >= 2) await commit(updatePlayers(session, value)); }
  async function togglePause() { if (!session) return; await commit(session.status === "paused" ? resumeSession(session) : pauseSession(session)); }
  async function end() { if (!session) return; const finished = finishSession(session); await commit(finished); router.push(`/summary?session=${finished.id}`); }
  if (!session) return <NeonBackground><main className="screen game-screen"><p>正在恢复本局…</p></main></NeonBackground>;
  const card = session.deckSnapshot.find((item) => item.id === session.currentRound?.cardId);
  if (!card || !session.currentRound) return <NeonBackground><main className="screen game-screen"><section className="empty-deck"><h1>本局题卡已经玩完</h1><Button type="button" onClick={() => void end()}>查看总结</Button><Link href="/">返回首页</Link></section></main></NeonBackground>;
  const participantNames = session.currentRound.participantIds.map((playerId) => session.config.players.find((player) => player.id === playerId)?.displayName).filter((name): name is string => Boolean(name));
  return <NeonBackground className="game-bg"><main className="screen game-screen"><RoundHeader current={session.rounds.length + 1} planned={Math.min(40, session.deckSnapshot.length)} onSettings={() => setSettingsOpen(true)} />{session.status === "paused" && <div className="paused-banner">本局已暂停</div>}<GameCardView key={card.id} card={card} participantNames={participantNames} /><RoundTimer roundId={session.currentRound.id} /><RoundActions onComplete={() => void resolve("complete")} onSwap={() => void resolve("swap")} onSkip={() => void resolve("skip")} /><p className="game-motto">Good Friends · Wilder Nights</p><InGameSettings open={settingsOpen} intensity={session.config.intensity} players={session.config.players} paused={session.status === "paused"} onIntensity={(value) => void changeIntensity(value)} onPlayers={(value) => void changePlayers(value)} onPause={() => void togglePause()} onFinish={() => void end()} onClose={() => setSettingsOpen(false)} /></main></NeonBackground>;
}

export default function GamePage() {
  return <Suspense fallback={<NeonBackground><main className="screen game-screen"><p>正在恢复本局…</p></main></NeonBackground>}><GamePageContent /></Suspense>;
}
