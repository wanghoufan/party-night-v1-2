"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NeonBackground } from "@/components/brand/NeonBackground";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { InGameSettings } from "@/components/game/InGameSettings";
import { PackSwitcherSheet } from "@/components/game/PackSwitcherSheet";
import { PackViewHost } from "@/components/game/PackViewHost";
import { RoundActions } from "@/components/game/RoundActions";
import { RoundHeader } from "@/components/game/RoundHeader";
import { RoundTimer } from "@/components/game/RoundTimer";
import type { CustomGamePack, GameSession, Intensity, Player } from "@/lib/domain/schemas";
import { completeRound, finishSession, pauseSession, resumeSession, skipRound, startRound, swapRound, updateIntensity, updatePlayers } from "@/lib/engine/session-engine";
import { listSwitchablePacks, switchPackAndDeal } from "@/lib/engine/pack-switcher";
import { getGamePack } from "@/lib/game-packs/registry";
import { gamePackRepository } from "@/lib/storage/game-pack-repository";
import { sessionRepository } from "@/lib/storage/session-repository";

function GamePageContent() {
  const router = useRouter();
  const id = useSearchParams().get("session");
  const [session, setSession] = useState<GameSession>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [customPacks, setCustomPacks] = useState<CustomGamePack[]>([]);
  useEffect(() => { if (!id) return router.replace("/"); void sessionRepository.get(id).then(async (stored) => { if (!stored) return router.replace("/"); const next = stored.currentRound ? stored : startRound(stored); await sessionRepository.save(next); setSession(next); }); }, [id, router]);
  useEffect(() => { void gamePackRepository.list().then(setCustomPacks); }, []);
  const switchablePacks = useMemo(() => session ? listSwitchablePacks(session, customPacks) : [], [session, customPacks]);
  async function commit(next: GameSession) { await sessionRepository.save(next); setSession(next); }
  async function resolve(action: "complete" | "swap" | "skip") { if (!session) return; const resolved = action === "complete" ? completeRound(session) : action === "swap" ? swapRound(session) : skipRound(session); const next = startRound(resolved); if (!next.currentRound) { const finished = finishSession(resolved); await commit(finished); router.push(`/summary?session=${finished.id}`); } else await commit(next); }
  // 切玩法：同一 Session 内换 currentPackId → 目标玩法 seed 立即补位 → 出下一题并 autosave（不重建 Session、不改 config）。
  async function switchTo(packId: string) { setSwitcherOpen(false); if (!session) return; const next = switchPackAndDeal(session, packId, customPacks); if (next !== session) await commit(next); }
  async function changeIntensity(value: Intensity) { if (session) await commit(updateIntensity(session, value)); }
  async function changePlayers(value: Player[]) { if (session && value.filter((player) => player.active).length >= 2) await commit(updatePlayers(session, value)); }
  async function togglePause() { if (!session) return; await commit(session.status === "paused" ? resumeSession(session) : pauseSession(session)); }
  async function end() { if (!session) return; const finished = finishSession(session); await commit(finished); router.push(`/summary?session=${finished.id}`); }
  if (!session) return <NeonBackground><main className="screen game-screen"><p>正在恢复本局…</p></main></NeonBackground>;
  const switcher = <PackSwitcherSheet open={switcherOpen} packs={switchablePacks} currentPackId={session.currentPackId} onSelect={(packId) => void switchTo(packId)} onClose={() => setSwitcherOpen(false)} />;
  const card = session.currentRound ? session.deckSnapshot.find((item) => item.id === session.currentRound?.cardId) : undefined;
  if (!card || !session.currentRound) return <NeonBackground><main className="screen game-screen"><section className="empty-deck"><h1>这个玩法暂时没有可玩的题卡</h1><Button type="button" onClick={() => setSwitcherOpen(true)}>切换玩法</Button><Button variant="ghost" type="button" onClick={() => void end()}>查看总结</Button><Link href="/">返回首页</Link></section>{switcher}</main></NeonBackground>;
  const participantNames = session.currentRound.participantIds.map((playerId) => session.config.players.find((player) => player.id === playerId)?.displayName).filter((name): name is string => Boolean(name));
  const currentPackName = switchablePacks.find((pack) => pack.id === session.currentPackId)?.name ?? getGamePack(session.currentPackId)?.name ?? session.currentPackId;
  return <NeonBackground className="game-bg"><main className="screen game-screen"><RoundHeader current={session.rounds.length + 1} planned={Math.min(40, session.deckSnapshot.length)} onSettings={() => setSettingsOpen(true)} />{session.status === "paused" && <div className="paused-banner">本局已暂停</div>}<PackViewHost key={card.id} packId={session.currentRound.packId} card={card} participantNames={participantNames} /><RoundTimer roundId={session.currentRound.id} /><RoundActions onComplete={() => void resolve("complete")} onSwap={() => void resolve("swap")} onSkip={() => void resolve("skip")} /><button className="pack-switch-entry" type="button" onClick={() => setSwitcherOpen(true)}><Icon name="cube" />切换玩法 · {currentPackName}</button><p className="game-motto">Good Friends · Wilder Nights</p>{switcher}<InGameSettings open={settingsOpen} intensity={session.config.intensity} players={session.config.players} paused={session.status === "paused"} onIntensity={(value) => void changeIntensity(value)} onPlayers={(value) => void changePlayers(value)} onPause={() => void togglePause()} onFinish={() => void end()} onClose={() => setSettingsOpen(false)} /></main></NeonBackground>;
}

export default function GamePage() {
  return <Suspense fallback={<NeonBackground><main className="screen game-screen"><p>正在恢复本局…</p></main></NeonBackground>}><GamePageContent /></Suspense>;
}
