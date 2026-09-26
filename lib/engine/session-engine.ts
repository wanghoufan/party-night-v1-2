import { SESSION_SCHEMA_VERSION, gameSessionSchema, type GamePackDefinition, type GameSession, type Intensity, type SessionConfig } from "@/lib/domain/schemas";
import { resolvePackCapability } from "@/lib/domain/pack-capability";
import { getGamePack, packIsCardless } from "@/lib/game-packs/registry";
import { createSessionParticipants } from "@/lib/v2-relationship/v2-participants";
import type { SessionParticipant } from "@/lib/v2-relationship/v2-state";
import { recordRejection } from "./card-eligibility";
import { drawDeckCard, withV2State } from "./v2-deal";
import { selectParticipants } from "./player-selector";
import { getSessionStage, getStagePackPreference } from "./stage-controller";
import type { GameCard, PackTransitionCause, RandomSource } from "./types";
import { createId } from "@/lib/utils/create-id";

const now = () => new Date().toISOString();
const uid = () => createId();

/**
 * 段内显示轮次（顶栏「第 n / 40」的 n）：只数**已完成**的轮次。
 * 换一个（swapped）复用同一个编号、跳过（skipped）不递增，所以两者都不会让计数前进。
 */
export function segmentRoundNo(session: GameSession): number {
  return session.rounds.filter((round) => round.status === "completed" && round.segmentId === session.currentSegmentId).length + 1;
}

/**
 * 新建 Session。
 * @param participants 当局参与者投影（V2 D4：`pairGender` 仅限当局）。不传时按 config.players
 *   生成，`pairGender` 一律 null（不猜、不回写 Player 档案）——旧调用方行为不变。
 */
export function createSession(
  config: SessionConfig,
  deckSnapshot: GameCard[] = [],
  participants: SessionParticipant[] = [],
): GameSession {
  const timestamp = now();
  return gameSessionSchema.parse({
    schemaVersion: SESSION_SCHEMA_VERSION,
    id: uid(),
    status: deckSnapshot.length ? "active" : "generating",
    mode: config.mode,
    config,
    deckSnapshot: structuredClone(deckSnapshot),
    usedCardIds: [],
    rounds: [],
    currentPackId: config.enabledPackIds[0],
    currentSegmentId: uid(),
    currentPackState: {},
    recentRejectedFingerprints: [],
    participants: participants.length ? structuredClone(participants) : createSessionParticipants(config.players),
    startedAt: deckSnapshot.length ? timestamp : undefined,
    updatedAt: timestamp,
  });
}

export function activateSession(session: GameSession, cards: GameCard[]): GameSession {
  const timestamp = now();
  return { ...session, status: "active", deckSnapshot: structuredClone(cards), startedAt: session.startedAt ?? timestamp, updatedAt: timestamp };
}

export interface StartRoundOptions {
  /** 明确切换玩法后的下一题偏好：只影响这一次出题、不改 config、不锁死后续轮次。 */
  preferPackIds?: string[];
  /** 只在指定题卡类型里出题（转瓶子→真心话/大冒险）。 */
  preferCardTypes?: string[];
  /** 明确指定本轮参与者（转瓶子链入真心话时，被指到的人作答）。 */
  participantIds?: string[];
  /** 「换一个」后的替换轮沿用原轮次的逻辑 id，便于审计把两题归到同一个逻辑轮次（V1.5）。 */
  reuseLogicalRoundId?: string;
}

/** 一对目标参与者（V2 Pair Routing 选中的 pairKey）→ 本轮 participantIds。 */
function participantsForCard(
  card: GameCard,
  targetPairKey: string | null,
  session: GameSession,
  random: RandomSource,
): string[] {
  if (card.participantMode === "pair" && targetPairKey) {
    const ids = targetPairKey
      .split("::")
      .filter((id) => session.config.players.some((player) => player.id === id && player.active));
    if (ids.length === 2) return ids;
  }
  return selectParticipants(card.participantMode, session.config.players, session.rounds, random);
}

/**
 * 出一题（B8 / D2）：唯一出卡入口是 V2 编排器 `drawV2SessionCard`（经 `lib/engine/v2-deal`），
 * 三层计数（bucket/pack/global）在**本局牌堆**上算。V1.6 加权 selector 不再参与。
 *
 * 抽不到卡时**不自动结束**，而是把编排态写回 Session：
 * - `AWAITING_HOST_EXHAUSTION_DECISION`：交 Host 显式选择「结束本局 / 洗牌再玩」；
 * - `PACK_EXHAUSTED` / `RELATIONSHIP_GLOBAL_EXHAUSTED`：给中性指引，允许切换其他有卡玩法。
 */
export function startRound(session: GameSession, random: RandomSource = Math.random, options: StartRoundOptions = {}): GameSession {
  if (session.status !== "active" || session.currentRound) return session;
  // 纯本地玩法（转瓶子）不需要题卡：结果由 player-selector 现场决定，也不该被别的 pack 的卡顶掉。
  if (packIsCardless(session.currentPackId)) return session;
  // single 模式只从当前玩法出卡；mixed 模式沿用 V1.0 的阶段混合出卡，currentPackId 跟随抽到的题卡。
  const single = session.config.mode === "single";
  const preferredPackIds = single
    ? [session.currentPackId]
    : options.preferPackIds?.length
      ? options.preferPackIds
      : getStagePackPreference(getSessionStage(session));
  const enabledPackIds = single ? [session.currentPackId] : session.config.enabledPackIds;

  const { outcome, card } = drawDeckCard({
    session,
    preferredPackIds,
    enabledPackIds,
    cardTypes: options.preferCardTypes,
  });
  if (outcome.kind !== "CARD" || !card) return withV2State(session, outcome.state);

  const used = [...session.usedCardIds, card.id];
  const dealt = withV2State(session, outcome.state);
  return {
    ...dealt,
    currentPackId: card.packId,
    usedCardIds: used,
    relationshipState: dealt.relationshipState ? { ...dealt.relationshipState, usedCardIds: used } : dealt.relationshipState,
    currentRound: {
      id: uid(),
      cardId: card.id,
      packId: card.packId,
      participantIds: options.participantIds ?? participantsForCard(card, outcome.targetPairKey, session, random),
      startedAt: now(),
      segmentId: session.currentSegmentId,
      logicalRoundId: options.reuseLogicalRoundId ?? uid(),
      displayRoundNo: segmentRoundNo(session),
    },
    updatedAt: now(),
  };
}

function resolveRound(session: GameSession, status: "completed" | "swapped" | "skipped"): GameSession {
  if (!session.currentRound) return session;
  const round = { ...session.currentRound, status, endedAt: now() };
  const resolved = { ...session, currentRound: undefined, rounds: [...session.rounds, round], updatedAt: now() };
  if (status !== "swapped") return resolved;
  // “换一个”＝拒绝当前题面：记指纹，让最近几轮不再抽到相同/近似文本。
  const card = session.deckSnapshot.find((item) => item.id === round.cardId);
  return card ? { ...resolved, recentRejectedFingerprints: recordRejection(session.recentRejectedFingerprints ?? [], card) } : resolved;
}

export const completeRound = (session: GameSession) => resolveRound(session, "completed");
export const swapRound = (session: GameSession) => resolveRound(session, "swapped");
export const skipRound = (session: GameSession) => resolveRound(session, "skipped");
export const pauseSession = (session: GameSession): GameSession => session.status === "active" ? { ...session, status: "paused", updatedAt: now() } : session;
export const resumeSession = (session: GameSession): GameSession => session.status === "paused" ? { ...session, status: "active", updatedAt: now() } : session;
export const finishSession = (session: GameSession): GameSession => ({ ...session, status: "finished", currentRound: undefined, endedAt: now(), updatedAt: now() });

export interface SwitchPackOptions {
  /** 用户“游戏包”里的启用集合；传入即校验目标玩法已启用（自定义 pack 也走这里）。 */
  enabledPackIds?: string[];
  /** 目标玩法定义；不传时从内置 registry 解析，解析不到则跳过 minPlayers 校验。 */
  definition?: GamePackDefinition;
  /** 切换原因；只有主持人手动切包（manual-switch）才开新段，顶栏轮次从 1 重计（V1.5）。 */
  cause?: PackTransitionCause;
}

/**
 * 局内切换玩法：同一个 Session，不重建、不重置玩家/关系/氛围/尺度/雷区/历史。
 * 校验不通过时原样返回（调用方按引用判断未发生切换）。
 */
export function switchPack(session: GameSession, packId: string, options: SwitchPackOptions = {}): GameSession {
  if (!packId || session.status !== "active") return session;
  if (options.enabledPackIds && !options.enabledPackIds.includes(packId)) return session;
  const definition = options.definition ?? getGamePack(packId);
  if (definition && resolvePackCapability(definition).minPlayers > session.config.players.filter((player) => player.active).length) return session;
  if (session.currentPackId === packId) return session;

  const cause: PackTransitionCause = options.cause ?? "manual-switch";
  // 未完成的 round 记 skipped（无惩罚跳过），避免它凭空消失；已完成的轮次与 usedCardIds 一动不动。
  const abandoned = session.currentRound ? { ...session.currentRound, status: "skipped" as const, endedAt: now() } : undefined;
  // GAP-02：pack-local state 按 packId 分键。切玩法只重置目标玩法那一格（重新进入＝从干净的 state 起），
  // 其他玩法的局部状态原样保留，不再整表清空。
  // V1.5：转瓶子链返回（spin-chain-return）要保留自己那一格——链的相位与落点就存在里面，重置会把回跳弄丢。
  const packStates = session.currentPackState ?? {};
  const resetTargetState = cause !== "spin-chain-return";
  return {
    ...session,
    currentPackId: packId,
    // 只有主持人手动切包才开新段；链入/链返回/首页进包都留在原段，轮次账不被打断。
    currentSegmentId: cause === "manual-switch" ? uid() : session.currentSegmentId,
    currentPackState: resetTargetState ? { ...packStates, [packId]: {} } : packStates,
    currentRound: undefined,
    rounds: abandoned ? [...session.rounds, abandoned] : session.rounds,
    updatedAt: now(),
  };
}

export function updateIntensity(session: GameSession, intensity: Intensity): GameSession {
  return { ...session, config: { ...session.config, intensity }, updatedAt: now() };
}

/**
 * 写某个玩法的局部状态：按 packId 分键只覆盖该玩法那一格，不碰其他玩法的状态（GAP-02）。
 * 玩法 UI 用它在“一样/不一样”“换 pair”“转瓶子落点”后立即落库，刷新可恢复（FR-035 / T147）。
 */
export function updatePackState(session: GameSession, packId: string, value: Record<string, unknown>): GameSession {
  return { ...session, currentPackState: { ...session.currentPackState, [packId]: value }, updatedAt: now() };
}

// 局中改玩家名册不走本模块：R4 §4.3/§4.4 要求区分「真离开（终止）」与「暂离（暂停）」，
// 唯一落盘入口是 `applyPlayerRosterChange`（lib/engine/v2-deal.ts，EXIT 删边+保障 expired+释放 D5；
// AWAY 保留 MATCH/signal/cooldown+保障 paused）。这里不再提供只改 config.players 的旁路写法，
// 免得被误用成「万物皆暂离」。
