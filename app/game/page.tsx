"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NeonBackground } from "@/components/brand/NeonBackground";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { InGameSettings } from "@/components/game/InGameSettings";
import { PackSwitcherSheet } from "@/components/game/PackSwitcherSheet";
import { PackViewHost, packViewOwnsActions } from "@/components/game/PackViewHost";
import { RoundActions } from "@/components/game/RoundActions";
import { RoundHeader } from "@/components/game/RoundHeader";
import { RoundTimer } from "@/components/game/RoundTimer";
import type { CustomGamePack, GameSession, Intensity, Player } from "@/lib/domain/schemas";
import { completeRound, finishSession, pauseSession, resumeSession, skipRound, startRound, swapRound, updateIntensity, updatePackState, updatePlayers } from "@/lib/engine/session-engine";
import { listSwitchablePacks, switchPackAndDeal } from "@/lib/engine/pack-switcher";
import { selectEligiblePlayer } from "@/lib/engine/player-selector";
import { chainSpinToTruthOrDare } from "@/lib/engine/spin-chain";
import { COMPATIBILITY_STATE_KEY, createCompatibilityState, defaultCompatibilityPair, readCompatibilityState, recordCompatibilityAnswer } from "@/lib/game-packs/compatibility-test";
import { SPIN_BOTTLE_STATE_KEY, readSpinBottleState, recordSpinResult } from "@/lib/game-packs/spin-bottle";
import { pairNames } from "@/components/game/CompatibilityPairPicker";
import { getGamePack, packIsCardless } from "@/lib/game-packs/registry";
import { gamePackRepository } from "@/lib/storage/game-pack-repository";
import { loadDisabledPackIds } from "@/lib/storage/pack-enablement";
import { sessionRepository, createSessionAutosave } from "@/lib/storage/session-repository";

/** 还没有 pack-local state 时，从在场玩家取默认两人；不足 2 人返回 undefined（玩法不可用）。 */
function pairFromDefaults(session: GameSession) {
  const pair = defaultCompatibilityPair(session.config.players);
  return pair ? createCompatibilityState(pair[0]!.id, pair[1]!.id) : undefined;
}

function GamePageContent() {
  const router = useRouter();
  const id = useSearchParams().get("session");
  const [session, setSession] = useState<GameSession>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [customPacks, setCustomPacks] = useState<CustomGamePack[]>([]);
  const [disabledPackIds, setDisabledPackIds] = useState<string[]>([]);
  useEffect(() => { if (!id) return router.replace("/"); void sessionRepository.get(id).then(async (stored) => { if (!stored) return router.replace("/"); const next = stored.currentRound ? stored : startRound(stored); await sessionRepository.save(next); setSession(next); }); }, [id, router]);
  useEffect(() => { void gamePackRepository.list().then(setCustomPacks); }, []);
  useEffect(() => { void loadDisabledPackIds().then(setDisabledPackIds); }, []);
  // 重要动作（切玩法 / 完成 / 换一个 / 跳过 / 默契分数 / 转瓶子落点）共用一条串行 autosave，
  // 保证快速连点或动画期间刷新时，落库顺序与动作顺序一致（T187）。
  const autosave = useMemo(() => createSessionAutosave(), []);
  const switchablePacks = useMemo(() => session ? listSwitchablePacks(session, customPacks, disabledPackIds) : [], [session, customPacks, disabledPackIds]);
  async function commit(next: GameSession) { await autosave.save(next); setSession(next); }
  async function resolve(action: "complete" | "swap" | "skip") { if (!session) return; const resolved = action === "complete" ? completeRound(session) : action === "swap" ? swapRound(session) : skipRound(session); const next = startRound(resolved); if (!next.currentRound) { const finished = finishSession(resolved); await commit(finished); router.push(`/summary?session=${finished.id}`); } else await commit(next); }
  // 切玩法：同一 Session 内换 currentPackId → 目标玩法 seed 立即补位 → 出下一题并 autosave（不重建 Session、不改 config）。
  async function switchTo(packId: string) { setSwitcherOpen(false); if (!session) return; const next = switchPackAndDeal(session, packId, customPacks, Math.random, {}, disabledPackIds); if (next !== session) await commit(next); }
  async function changeIntensity(value: Intensity) { if (session) await commit(updateIntensity(session, value)); }
  async function changePlayers(value: Player[]) { if (session && value.filter((player) => player.active).length >= 2) await commit(updatePlayers(session, value)); }
  // 默契测试 pack-local state：读不到就从在场玩家取默认两人并落库；刷新后原样恢复（score/pair 不丢）。
  async function changePair(playerId: string) { if (!session) return; const current = readCompatibilityState(session) ?? pairFromDefaults(session); if (!current || current.playerBId === playerId) return; const next = { playerAId: current.playerBId, playerBId: playerId }; await commit(updatePackState(session, COMPATIBILITY_STATE_KEY, createCompatibilityState(next.playerAId, next.playerBId))); }
  async function answerPair(answer: "same" | "different") { if (!session) return; const current = readCompatibilityState(session) ?? pairFromDefaults(session); if (!current) return; await commit(updatePackState(session, COMPATIBILITY_STATE_KEY, recordCompatibilityAnswer(current, answer))); }
  // 转瓶子：结果先由本地 selector 定下并立即落库（动画只表现），再交给视图播动画；被指到的人参与下一题。
  function spinPlayer(): Player | undefined { if (!session) return undefined; const target = selectEligiblePlayer(session.config.players, { avoidPlayerId: readSpinBottleState(session)?.lastSelectedPlayerId }); if (!target) return undefined; void commit(updatePackState(session, SPIN_BOTTLE_STATE_KEY, recordSpinResult(target.id))); return target; }
  function chainSpin(kind: "truth" | "dare") { if (!session) return; const selected = readSpinBottleState(session)?.lastSelectedPlayerId; if (!selected) return; const next = chainSpinToTruthOrDare(session, selected, kind, customPacks); if (next !== session) void commit(next); }
  async function togglePause() { if (!session) return; await commit(session.status === "paused" ? resumeSession(session) : pauseSession(session)); }
  async function end() { if (!session) return; const finished = finishSession(session); await commit(finished); router.push(`/summary?session=${finished.id}`); }
  if (!session) return <NeonBackground><main className="screen game-screen"><p>正在恢复本局…</p></main></NeonBackground>;
  const switcher = <PackSwitcherSheet open={switcherOpen} packs={switchablePacks} currentPackId={session.currentPackId} onSelect={(packId) => void switchTo(packId)} onClose={() => setSwitcherOpen(false)} />;
  const card = session.currentRound ? session.deckSnapshot.find((item) => item.id === session.currentRound?.cardId) : undefined;
  // 纯本地玩法（转瓶子）不需要题卡：没有 currentRound 也要照常进主局，不落到空题库页。
  const cardless = packIsCardless(session.currentPackId);
  if ((!card || !session.currentRound) && !cardless) return <NeonBackground><main className="screen game-screen"><section className="empty-deck"><h1>这个玩法暂时没有可玩的题卡</h1><Button type="button" onClick={() => setSwitcherOpen(true)}>切换玩法</Button><Button variant="ghost" type="button" onClick={() => void end()}>查看总结</Button><Link href="/">返回首页</Link></section>{switcher}</main></NeonBackground>;
  const participantNames = session.currentRound ? session.currentRound.participantIds.map((playerId) => session.config.players.find((player) => player.id === playerId)?.displayName).filter((name): name is string => Boolean(name)) : [];
  const currentPackName = switchablePacks.find((pack) => pack.id === session.currentPackId)?.name ?? getGamePack(session.currentPackId)?.name ?? session.currentPackId;
  // 自带动作条的玩法（如二选一/转瓶子）自己渲染动作；主局不再叠加一套共享动作条。
  const viewOwnsActions = packViewOwnsActions(session.currentPackId);
  const roundActions = { onComplete: () => void resolve("complete"), onSwap: () => void resolve("swap"), onSkip: () => void resolve("skip") };
  // 默契测试配对：优先用已持久化的 state，没有则用默认两人（首次进入时落库，刷新后可恢复）。
  const compatibilityState = readCompatibilityState(session) ?? pairFromDefaults(session);
  const compatibility = { players: session.config.players, pair: compatibilityState ? { playerAId: compatibilityState.playerAId, playerBId: compatibilityState.playerBId, names: pairNames(session.config.players, compatibilityState), state: compatibilityState } : undefined, onChangePair: (playerId: string) => void changePair(playerId), onAnswer: (answer: "same" | "different") => void answerPair(answer) };
  // 转瓶子上下文：落点与上一次结果都来自 pack-local state，视图只负责表现与给去向。
  const spin = { players: session.config.players, lastSelectedPlayerId: readSpinBottleState(session)?.lastSelectedPlayerId, onSpin: spinPlayer, onChain: (kind: "truth" | "dare") => chainSpin(kind) };
  return <NeonBackground className="game-bg"><main className="screen game-screen"><RoundHeader current={session.rounds.length + 1} planned={Math.min(40, session.deckSnapshot.length)} onSettings={() => setSettingsOpen(true)} />{session.status === "paused" && <div className="paused-banner">本局已暂停</div>}<PackViewHost key={card?.id ?? session.currentPackId} packId={session.currentPackId} card={card} participantNames={participantNames} actions={roundActions} compatibility={compatibility} spin={spin} />{session.currentRound && <RoundTimer roundId={session.currentRound.id} />}{!viewOwnsActions && <RoundActions {...roundActions} />}<button className="pack-switch-entry" type="button" onClick={() => setSwitcherOpen(true)}><Icon name="cube" />切换玩法 · {currentPackName}</button><p className="game-motto">Good Friends · Wilder Nights</p>{switcher}<InGameSettings open={settingsOpen} intensity={session.config.intensity} players={session.config.players} paused={session.status === "paused"} onIntensity={(value) => void changeIntensity(value)} onPlayers={(value) => void changePlayers(value)} onPause={() => void togglePause()} onFinish={() => void end()} onClose={() => setSettingsOpen(false)} /></main></NeonBackground>;
}

export default function GamePage() {
  return <Suspense fallback={<NeonBackground><main className="screen game-screen"><p>正在恢复本局…</p></main></NeonBackground>}><GamePageContent /></Suspense>;
}
