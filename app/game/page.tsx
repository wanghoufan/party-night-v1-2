"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NeonBackground } from "@/components/brand/NeonBackground";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { InGameSettings } from "@/components/game/InGameSettings";
import { HostExhaustionSheet } from "@/components/game/HostExhaustionSheet";
import { MutualCheckSheet } from "@/components/game/MutualCheckSheet";
import { PackSwitcherSheet } from "@/components/game/PackSwitcherSheet";
import { PackViewHost, packViewOwnsActions } from "@/components/game/PackViewHost";
import { RoundActions } from "@/components/game/RoundActions";
import { RoundHeader } from "@/components/game/RoundHeader";
import { RoundTimer } from "@/components/game/RoundTimer";
import type { CustomGamePack, GameSession, Intensity, Player } from "@/lib/domain/schemas";
import { PACK_PLAYABLE_THRESHOLD, refillPackInBackground } from "@/lib/ai/generate-deck";
import { dedupeCards } from "@/lib/ai/normalize";
import { completeRound, finishSession, pauseSession, resumeSession, segmentRoundNo, skipRound, startRound, swapRound, updateIntensity, updatePackState } from "@/lib/engine/session-engine";
import { applyHostDecisionToSession, applyPlayerRosterChange, awaitingHostDecision, orchestrationOf, reduceResolvedRound, relationshipOf, withV2State } from "@/lib/engine/v2-deal";
import { NO_ELIGIBLE_PAIR_HINT, normalizeParticipants, pairModeFor } from "@/lib/v2-relationship/v2-participants";
import { mutualCandidateIds, mutualCheckFinalEvents, mutualCheckTrigger } from "@/lib/v2-relationship/v2-mutual-check";
import { reduceV2SessionEvents, type V2SessionState } from "@/lib/v2-relationship/v2-session";
import { PACK_EXHAUSTED_GUIDANCE, RELATIONSHIP_GLOBAL_EXHAUSTED_GUIDANCE } from "@/lib/v2-relationship/v2-session";
import { listSwitchablePacks, switchPackAndDeal } from "@/lib/engine/pack-switcher";
import { selectEligiblePlayer } from "@/lib/engine/player-selector";
import { enterSpinChain, remainingSpinChainCards, replaceInSpinChain, resolveSpinChain, returnToBottle, spinChainAvailability, SPIN_CHAIN_PACK_ID } from "@/lib/engine/spin-chain";
import { COMPATIBILITY_PACK_ID, createCompatibilityState, defaultCompatibilityPair, readCompatibilityState, recordCompatibilityAnswer } from "@/lib/game-packs/compatibility-test";
import { SPIN_BOTTLE_PACK_ID, readSpinBottleState, readSpinChain, recordSpinResult } from "@/lib/game-packs/spin-bottle";
import { pairNames } from "@/components/game/CompatibilityPairPicker";
import { getGamePack, packIsCardless } from "@/lib/game-packs/registry";
import { aiProviderRepository } from "@/lib/storage/ai-provider-repository";
import { gamePackRepository } from "@/lib/storage/game-pack-repository";
import { sessionRepository, createSessionAutosave } from "@/lib/storage/session-repository";
import { play } from "@/lib/audio";

/** 还没有 pack-local state 时，从在场玩家取默认两人；不足 2 人返回 undefined（玩法不可用）。 */
function pairFromDefaults(session: GameSession) {
  const pair = defaultCompatibilityPair(session.config.players);
  return pair ? createCompatibilityState(pair[0]!.id, pair[1]!.id) : undefined;
}

/** 链完成后落库的相位是 returning：恢复时若发现还停在别的玩法上，直接补一次回瓶子（保证「自动回瓶子 ready」）。 */
function recoverSpinChain(session: GameSession): GameSession {
  const chain = readSpinChain(session);
  return chain?.phase === "returning" && session.currentPackId !== SPIN_BOTTLE_PACK_ID ? returnToBottle(session, { chain }) : session;
}

function GamePageContent() {
  const router = useRouter();
  const id = useSearchParams().get("session");
  const [session, setSession] = useState<GameSession>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [customPacks, setCustomPacks] = useState<CustomGamePack[]>([]);
  const [toast, setToast] = useState("");
  const [hostBusy, setHostBusy] = useState(false);
  // B9/D5：命中常规互选检查点后打开的私密互选（null = 未打开）；取消不产生任何结果。
  const [mutualCheckpoint, setMutualCheckpoint] = useState<number | null>(null);
  useEffect(() => { if (!id) return router.replace("/"); void sessionRepository.get(id).then(async (stored) => { if (!stored) return router.replace("/"); const recovered = recoverSpinChain(stored); const next = recovered.currentRound ? recovered : startRound(recovered); await sessionRepository.save(next); setSession(next); }); }, [id, router]);
  useEffect(() => { void gamePackRepository.list().then(setCustomPacks); }, []);
  // 重要动作（切玩法 / 完成 / 换一个 / 跳过 / 默契分数 / 转瓶子落点）共用一条串行 autosave，
  // 保证快速连点或动画期间刷新时，落库顺序与动作顺序一致（T187）。
  const autosave = useMemo(() => createSessionAutosave(), []);
  // 主持人主动切换只受注册表 + 当前人数限制：游戏包开关只圈 AI 组局，不挡这里的主动切换（R-057）。
  const switchablePacks = useMemo(() => session ? listSwitchablePacks(session, customPacks) : [], [session, customPacks]);
  async function commit(next: GameSession) { await autosave.save(next); setSession(next); }
  // L2 后台补题（V1.6）：链内某类剩余 < 3 时，用默认 Provider 悄悄补一批新题（不阻塞 UI，不打断当前题）。
  // 每类只尝试一次、任一时刻只跑一个请求（单例）；没配 Provider／没 Key／断网一律静默，交给 L1 本地洗牌兜底。
  const refill = useRef({ inFlight: false, attempted: new Set<string>() });
  const latestSession = useRef<GameSession | undefined>(undefined);
  useEffect(() => { latestSession.current = session; }, [session]);
  useEffect(() => {
    if (!session || refill.current.inFlight || readSpinChain(session)?.phase !== "question") return;
    const remaining = remainingSpinChainCards(session);
    const low = (["truth", "dare"] as const).filter((kind) => remaining[kind] < PACK_PLAYABLE_THRESHOLD && !refill.current.attempted.has(kind));
    if (!low.length) return;
    const snapshot = session;
    refill.current.inFlight = true;
    low.forEach((kind) => refill.current.attempted.add(kind));
    void (async () => {
      try {
        const profiles = await aiProviderRepository.listProfiles();
        const profile = profiles.find((item) => item.isDefault) ?? profiles[0];
        const apiKey = profile ? await aiProviderRepository.getSecret(profile.id) : undefined;
        if (!profile || !apiKey) return; // 没配好 Provider/Key：静默，交给 L1
        const deck = await refillPackInBackground({ deck: snapshot.deckSnapshot, profile, apiKey, sessionConfig: snapshot.config, sessionId: snapshot.id, packId: SPIN_CHAIN_PACK_ID });
        // 只把相对快照新增的卡并回「最新」session，避免覆盖期间用户已经做出的动作；再统一去重。
        const added = deck.filter((card) => !snapshot.deckSnapshot.some((item) => item.id === card.id));
        const latest = latestSession.current;
        if (!added.length || !latest || latest.id !== snapshot.id) return; // 没补到新题或已换局：静默
        const next = { ...latest, deckSnapshot: dedupeCards([...latest.deckSnapshot, ...added]) };
        await autosave.save(next);
        setSession(next);
        setToast("已补充新题");
      } catch { /* 断网/上游异常：静默失败，绝不影响现场（L1 兜底） */ }
      finally { refill.current.inFlight = false; }
    })();
  }, [session, autosave]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 4000); return () => window.clearTimeout(timer); }, [toast]);
  // B9/D5：Heat（relationshipEffectiveCardCount）打到常规互选检查点 9/14/19、且当局存在合法 pair 时弹私密互选。
  // 判定口径全在 v2-mutual-check（复用 v2-state 检查点 + v2-reducer 四道门，无第二套口径）；
  // 无合法 pair / 未到检查点 / 已暂停 / 已有私密流程在跑 → 不弹、不空转；同一检查点只弹一次（取消不重弹）。
  const mutualShown = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!session || mutualCheckpoint !== null) return;
    const trigger = mutualCheckTrigger({
      relationship: relationshipOf(session),
      participants: normalizeParticipants(session.participants, session.config.players),
      sessionStatus: session.status,
    });
    if (!trigger.due || trigger.checkpoint === null) return;
    if (mutualShown.current.has(trigger.checkpoint)) return;
    mutualShown.current.add(trigger.checkpoint);
    setMutualCheckpoint(trigger.checkpoint);
  }, [session, mutualCheckpoint]);
  // 每轮出题翻牌：轮次 id 变化即来一声（同一轮重渲染不重复；首轮也一样）。
  const roundId = session?.currentRound?.id;
  useEffect(() => { if (roundId) play("deal"); }, [roundId]);
  // 推进本轮：链内（truth-dare 题面上，链相位 question）走链自己的相位机——完成＝resolving→returning 自动回瓶子；
  // 换一个＝replacing 重出同类型题、参与者仍是链里固定的被指人。普通玩法沿用共享引擎语义。
  async function resolve(action: "complete" | "swap" | "skip") { if (!session) return; play(action === "complete" ? "complete" : action === "swap" ? "swap" : "skip"); /* V2-B10：每轮终态先按 R3 事件表归约到关系态——relationship-aware 普通卡 completed 推进有效卡计数/Heat，skip/swap 与 neutral/expansion 一律 +0；归约保留 currentRound，随后照旧走引擎/转瓶子链。 */ const reduced = reduceResolvedRound(session, action === "complete" ? "completed" : action === "swap" ? "swapped" : "skipped"); const chain = readSpinChain(session); if (chain?.phase === "question" && session.currentRound?.packId === SPIN_CHAIN_PACK_ID) { await commit(action === "swap" ? replaceInSpinChain(reduced, customPacks) : resolveSpinChain(reduced)); return; } const resolved = action === "complete" ? completeRound(reduced) : action === "swap" ? swapRound(reduced) : skipRound(reduced); const next = startRound(resolved, Math.random, action === "swap" && session.currentRound ? { reuseLogicalRoundId: session.currentRound.logicalRoundId } : {}); if (!next.currentRound) { const ended = next.v2Orchestration?.lastExhaustionLevel; if (next.v2Orchestration?.awaitingHostDecision || ended === "PACK_EXHAUSTED" || ended === "RELATIONSHIP_GLOBAL_EXHAUSTED") { await commit(next); return; } const finished = finishSession(resolved); await commit(finished); router.push(`/summary?session=${finished.id}`); } else await commit(next); }
  // 切玩法：同一 Session 内换 currentPackId → 目标玩法 seed 立即补位 → 出下一题并 autosave（不重建 Session、不改 config）。
  // 手动切包（manual-switch）会开新段，顶栏轮次从 1 重计（V1.5）。
  async function switchTo(packId: string) { setSwitcherOpen(false); if (!session) return; const next = switchPackAndDeal(session, packId, customPacks, Math.random, {}, "manual-switch"); if (next !== session) { play("pack-switch"); await commit(next); } }
  async function changeIntensity(value: Intensity) { if (session) await commit(updateIntensity(session, value)); }
  // R4 §4.3/§4.4：局中名册变更走唯一落盘入口——真离开（移出名册）＝终止语义（删边/保障 expired/释放 D5），
  // 暂离（仍在名册、active 转 false）＝暂停语义（MATCH/cooldown/signal 保留、保障 paused），回席从暂停点继续。
  async function changePlayers(value: Player[]) { if (session && value.filter((player) => player.active).length >= 2) await commit(applyPlayerRosterChange(session, value)); }
  // 默契测试 pack-local state：读不到就从在场玩家取默认两人并落库；刷新后原样恢复（score/pair 不丢）。
  async function changePair(playerId: string) { if (!session) return; const current = readCompatibilityState(session) ?? pairFromDefaults(session); if (!current || current.playerBId === playerId) return; const next = { playerAId: current.playerBId, playerBId: playerId }; await commit(updatePackState(session, COMPATIBILITY_PACK_ID, createCompatibilityState(next.playerAId, next.playerBId))); }
  async function answerPair(answer: "same" | "different") { if (!session) return; play(answer === "same" ? "compat-same" : "compat-different"); const current = readCompatibilityState(session) ?? pairFromDefaults(session); if (!current) return; await commit(updatePackState(session, COMPATIBILITY_PACK_ID, recordCompatibilityAnswer(current, answer))); }
  // 转瓶子：结果先由本地 selector 定下并立即落库（动画只表现），再交给视图播动画；被指到的人参与下一题。
  function spinPlayer(): Player | undefined { if (!session) return undefined; const target = selectEligiblePlayer(session.config.players, { avoidPlayerId: readSpinBottleState(session)?.lastSelectedPlayerId }); if (!target) return undefined; void commit(updatePackState(session, SPIN_BOTTLE_PACK_ID, recordSpinResult(target.id))); return target; }
  function chainSpin(kind: "truth" | "dare") { if (!session) return; const targetId = readSpinBottleState(session)?.lastSelectedPlayerId; if (!targetId) return; const targetName = session.config.players.find((player) => player.id === targetId)?.displayName ?? readSpinChain(session)?.targetName; if (!targetName) return; const next = enterSpinChain(session, { targetPlayerId: targetId, targetName, kind }, customPacks); if (next !== session) { play("chain-enter"); void commit(next); } }
  async function togglePause() { if (!session) return; play(session.status === "paused" ? "resume" : "pause"); await commit(session.status === "paused" ? resumeSession(session) : pauseSession(session)); }
  async function end() { if (!session) return; play("finish-chord"); const finished = finishSession(session); await commit(finished); router.push(`/summary?session=${finished.id}`); }
  // B8 耗尽 Host 二选一（D8=A+）：finish / reshuffle 都经 applyV2HostDecision 落库，幂等键防重放。
  async function hostDecision(decision: "finish" | "reshuffle") {
    if (!session || hostBusy) return;
    const awaiting = awaitingHostDecision(session);
    if (!awaiting) return;
    setHostBusy(true);
    try {
      const decided = applyHostDecisionToSession(session, awaiting, decision);
      if (decision === "finish") {
        play("finish-chord");
        const finished = finishSession(decided);
        await commit(finished);
        router.push(`/summary?session=${finished.id}`);
        return;
      }
      play("pack-switch");
      // 洗牌只清 relationship-aware 普通 used；recent/Heat/MATCH/5 档保障原样保留，随后回统一 Router 再抽一张。
      await commit(startRound(decided, Math.random, { preferPackIds: [decided.currentPackId] }));
    } finally { setHostBusy(false); }
  }
  // B9/D5：私密互选收束 → 只把公开结果落盘：记一次常规互选（DUE）+ 每个互选成的 pair 建 MATCH。
  // 单向明细在这一步之前已由面板清空；事件里只有 pairKey/playerIds，reducer 内再做一次 D5 上限与幂等校验。
  async function finishMutualCheck(payload: { runId: string; checkpoint: number; matches: { pairKey: string; playerIds: [string, string] }[] }) {
    setMutualCheckpoint(null);
    if (!session) return;
    if (payload.matches.length > 0) play("complete");
    const state: V2SessionState = {
      sessionId: session.id,
      relationship: relationshipOf(session),
      participants: normalizeParticipants(session.participants, session.config.players),
      orchestration: orchestrationOf(session),
    };
    const events = mutualCheckFinalEvents(payload.runId, payload.checkpoint, { matches: payload.matches }, new Date().toISOString());
    await commit(withV2State(session, reduceV2SessionEvents(state, events).state));
  }
  // 取消：面板已清空内存里的单向数据，这里不产生任何 MATCH/DUE 事件，也不公布任何人。
  function cancelMutualCheck() { setMutualCheckpoint(null); }
  if (!session) return <NeonBackground><main className="screen game-screen"><p>正在恢复本局…</p></main></NeonBackground>;
  const switcher = <PackSwitcherSheet open={switcherOpen} packs={switchablePacks} currentPackId={session.currentPackId} onSelect={(packId) => void switchTo(packId)} onClose={() => setSwitcherOpen(false)} />;
  const card = session.currentRound ? session.deckSnapshot.find((item) => item.id === session.currentRound?.cardId) : undefined;
  // 纯本地玩法（转瓶子）不需要题卡：没有 currentRound 也要照常进主局，不落到空题库页。
  const cardless = packIsCardless(session.currentPackId);
  const awaiting = awaitingHostDecision(session);
  const exhaustionLevel = session.v2Orchestration?.lastExhaustionLevel;
  // B8/D8=A+：耗尽等待态先交 Host 二选一；本玩法/全局仍有卡时给中性指引，允许切换其他有卡玩法（都不自动结束）。
  if ((!card || !session.currentRound) && !cardless) {
    if (awaiting) return <NeonBackground className="game-bg"><main className="screen game-screen"><section className="empty-deck"><h1>可玩的题都出完了</h1><p className="game-hint">换一换口味，或者就此收工。</p></section><HostExhaustionSheet open busy={hostBusy} onFinish={() => void hostDecision("finish")} onReshuffle={() => void hostDecision("reshuffle")} /></main></NeonBackground>;
    if (exhaustionLevel === "PACK_EXHAUSTED" || exhaustionLevel === "RELATIONSHIP_GLOBAL_EXHAUSTED") return <NeonBackground className="game-bg"><main className="screen game-screen"><section className="empty-deck"><h1>{exhaustionLevel === "PACK_EXHAUSTED" ? PACK_EXHAUSTED_GUIDANCE : RELATIONSHIP_GLOBAL_EXHAUSTED_GUIDANCE}</h1><Button type="button" onClick={() => setSwitcherOpen(true)}>切换玩法</Button><Button variant="ghost" type="button" onClick={() => void end()}>查看总结</Button><Link href="/">返回首页</Link></section>{switcher}</main></NeonBackground>;
    return <NeonBackground className="game-bg"><main className="screen game-screen"><section className="empty-deck"><h1>这个玩法暂时没有可玩的题卡</h1><Button type="button" onClick={() => setSwitcherOpen(true)}>切换玩法</Button><Button variant="ghost" type="button" onClick={() => void end()}>查看总结</Button><Link href="/">返回首页</Link></section>{switcher}</main></NeonBackground>;
  }
  // 链内参与者用姓名快照：被指到的人中途离场，本轮照样显示当时记下的名字（不换人）。
  const chain = readSpinChain(session);
  const participantNames = session.currentRound ? session.currentRound.participantIds.map((playerId) => session.config.players.find((player) => player.id === playerId)?.displayName ?? (chain?.targetPlayerId === playerId ? chain.targetName : undefined)).filter((name): name is string => Boolean(name)) : [];
  const currentPackName = switchablePacks.find((pack) => pack.id === session.currentPackId)?.name ?? getGamePack(session.currentPackId)?.name ?? session.currentPackId;
  // 自带动作条的玩法（如二选一/转瓶子）自己渲染动作；主局不再叠加一套共享动作条。
  const viewOwnsActions = packViewOwnsActions(session.currentPackId);
  const paused = session.status === "paused";
  const roundActions = { onComplete: () => void resolve("complete"), onSwap: () => void resolve("swap"), onSkip: () => void resolve("skip") };
  // 默契测试配对：优先用已持久化的 state，没有则用默认两人（首次进入时落库，刷新后可恢复）。
  const compatibilityState = readCompatibilityState(session) ?? pairFromDefaults(session);
  const compatibility = { players: session.config.players, pair: compatibilityState ? { playerAId: compatibilityState.playerAId, playerBId: compatibilityState.playerBId, names: pairNames(session.config.players, compatibilityState), state: compatibilityState } : undefined, onChangePair: (playerId: string) => void changePair(playerId), onAnswer: (answer: "same" | "different") => void answerPair(answer) };
  // 转瓶子上下文：落点与上一次结果都来自 pack-local state，视图只负责表现与给去向。
  // resumeReady＝链刚回瓶子（phase=returning）：直接进 ready，接着转下一个人；exhausted＝两类题卡都出完了。
  // availableKinds：补位后还能出题的类型（空牌堆也按补位后算），只有整类被雷区/尺度挡掉才禁；
  // recycledKinds：新卡已出完、这次进去走 L1 洗牌重出（题目会重复）的类型，给一句可见提示（V1.6）。
  const chainAvailability = spinChainAvailability(session);
  const spin = { players: session.config.players, lastSelectedPlayerId: readSpinBottleState(session)?.lastSelectedPlayerId, resumeReady: chain?.phase === "returning", exhausted: chain?.exhausted === true, availableKinds: chainAvailability.available, recycledKinds: chainAvailability.recycled, onSpin: spinPlayer, onChain: (kind: "truth" | "dare") => chainSpin(kind) };
  // D4=A 降级：无合法 Pair 时不跑关系主线，走普通玩法；只给中性提示，不公开任何人的字段值（不含男女字样）。
  const mutualParticipants = normalizeParticipants(session.participants, session.config.players);
  const pairDegraded = pairModeFor(mutualParticipants) === "NO_ELIGIBLE_PAIR";
  // B9/D5：私密互选候选人＝至少属于一条合法 eligible 边的参与者（点名顺序沿用当局玩家顺序）。
  const mutualPlayers = mutualCandidateIds(mutualParticipants).map((playerId) => ({ id: playerId, displayName: session.config.players.find((player) => player.id === playerId)?.displayName ?? playerId }));
  return <NeonBackground className="game-bg"><main className="screen game-screen"><RoundHeader current={segmentRoundNo(session)} planned={Math.min(40, session.deckSnapshot.length)} paused={paused} onTogglePause={() => void togglePause()} onSettings={() => setSettingsOpen(true)} onFinish={() => void end()} />{paused && <div className="paused-banner" role="status">本局已暂停</div>}{pairDegraded && <p className="game-hint" role="status">{NO_ELIGIBLE_PAIR_HINT}</p>}{toast && <p className="game-toast" role="status">{toast}</p>}<PackViewHost key={card?.id ?? session.currentPackId} packId={session.currentPackId} card={card} participantNames={participantNames} actions={roundActions} compatibility={compatibility} spin={spin} paused={paused} />{session.currentRound && <RoundTimer roundId={session.currentRound.id} paused={paused} />}{!viewOwnsActions && <RoundActions {...roundActions} disabled={paused} />}<button className="pack-switch-entry" type="button" disabled={paused} onClick={() => setSwitcherOpen(true)}><Icon name="cube" />切换玩法 · {currentPackName}</button><p className="game-motto">Good Friends · Wilder Nights</p>{switcher}{mutualCheckpoint !== null && <MutualCheckSheet open players={mutualPlayers} participants={mutualParticipants} checkpoint={mutualCheckpoint} relationship={relationshipOf(session)} onFinished={(value) => void finishMutualCheck(value)} onCancelled={cancelMutualCheck} />}<InGameSettings open={settingsOpen} intensity={session.config.intensity} players={session.config.players} paused={paused} onIntensity={(value) => void changeIntensity(value)} onPlayers={(value) => void changePlayers(value)} onPause={() => void togglePause()} onFinish={() => void end()} onClose={() => setSettingsOpen(false)} /></main></NeonBackground>;
}

export default function GamePage() {
  return <Suspense fallback={<NeonBackground><main className="screen game-screen"><p>正在恢复本局…</p></main></NeonBackground>}><GamePageContent /></Suspense>;
}
