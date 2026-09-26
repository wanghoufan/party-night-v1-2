/**
 * B8 / D2｜`/game` 主链出卡适配器：Session 预生成牌堆 ↔ V2 编排器（唯一出卡入口）。
 *
 * 为什么是「适配器」而不是第二套 Router：D2 冻结的是**选择权**归 V2 —— 出哪张卡一律由
 * `drawV2SessionCard`（V2 编排器）在 `V2RouterPort` 三层计数（bucket/pack/global）上决定，
 * 耗尽、软去重放宽、洗牌后兜底全部回到该端口。本模块只把 Session 里已有的牌堆、参与者、
 * 关系态喂给编排器，并把结果写回 Session：
 * - `bucket/pack/global` 三层全部从**本局牌堆**（SSOT 主线 + AI/自定义补位卡）算，保证抽到的卡
 *   一定能在 `deckSnapshot` 里渲染（离线可玩、AI/自定义卡不被丢弃）。
 * - 卡面的 Heat 档 / Pair 目标 gating 来自 V1.3 Frozen SSOT 元数据（`getV2ContentAdapter().cardById`）；
 *   非 SSOT 卡（旧 seed / AI / 自定义）没有 Heat 与 Pair 元数据，不做这两项 gating。
 * - 这里不 import、也不调用 `lib/engine/card-selector`（旧加权 selector）——V1.6 出卡路径生产不可达。
 */

import type { GameCard, GameSession, Player } from "@/lib/domain/schemas";
import { getV2ContentAdapter } from "@/lib/v2-content/v2-content-adapter";
import { EXPANSION_PACK_ID, isV2MainlinePack } from "@/lib/v2-content/v2-card-bridge";
import { isRecentlyRejected } from "./card-eligibility";
import { diffPlayerRoster, normalizeParticipants } from "@/lib/v2-relationship/v2-participants";
import { applyPlayerExit, applyPlayerTemporarilyAway, type RelationshipEvent } from "@/lib/v2-relationship/v2-reducer";
import {
  createInitialRelationshipState,
  HEAT_ORDER,
  SOFT_DEDUP_WINDOW,
  type RelationshipEventType,
  type RelationshipState,
  type TerminalInteractionState,
  type V2HostDecision,
  type V2OrchestrationState,
} from "@/lib/v2-relationship/v2-state";
import {
  applyV2HostDecision,
  drawV2SessionCard,
  hostDecisionKey,
  reduceV2SessionEvents,
  type V2AwaitingHostOutcome,
  type V2DrawOutcome,
  type V2RouterCard,
  type V2RouterInput,
  type V2RouterPort,
  type V2SessionState,
} from "@/lib/v2-relationship/v2-session";

export interface DeckRouterOptions {
  deck: readonly GameCard[];
  /** 首选玩法（outcome 的 pack 层级与 bucket 都先看这里）；抽不到时回落到 `enabledPackIds`，不空转。 */
  preferredPackIds: readonly string[];
  /** 本局启用玩法（global 层级）。 */
  enabledPackIds: readonly string[];
  /** 只在指定题卡类型里出（转瓶子链入真心话/大冒险）。 */
  cardTypes?: readonly string[];
  /** 最近「换一个」拒绝的题面指纹：软去重之外再避开近似题面。 */
  rejectedFingerprints?: readonly string[];
}

const heatRank = (heat: RelationshipState["heat"]): number => HEAT_ORDER.indexOf(heat) + 1;

/** SSOT 主线卡的 Heat 档/Pair 目标元数据；非 SSOT 卡返回 undefined（不做这两项 gating）。 */
function ssotMeta(cardId: string) {
  return getV2ContentAdapter().cardById(cardId);
}

function heatEligible(card: GameCard, input: V2RouterInput): boolean {
  const meta = ssotMeta(card.id);
  if (!meta || !("heatMin" in meta)) return true;
  const rank = heatRank(input.relationship.heat);
  return rank >= meta.heatMin && rank <= meta.heatMax;
}

/**
 * Pair 目标 gating（D4）。
 *
 * - 只有真正需要 MATCH 才能出的卡（`match-pair` / `matchRequired`）受约束：该 pair 没有 MATCH 就不出，
 *   不空转、不猜人。
 * - 其余 pair 定向卡在 `NO_ELIGIBLE_PAIR` 时**照常按普通玩法出**（R4 §4.1「保留普通抽卡」「进入普通玩法」）：
 *   参与者走既有 `selectParticipants`，不读、不展示任何 pairGender 字段，也就不存在猜性别问题。
 *   （V2 关系主线 API 的 SSOT Router 另有更严的读法，见 B7；本适配器只在 App 普通玩法降级时放宽。）
 */
function targetEligible(card: GameCard, input: V2RouterInput): boolean {
  const meta = ssotMeta(card.id);
  if (!meta || !("targetMode" in meta)) return true;
  if (meta.targetMode === "match-pair" || meta.matchRequired === true) {
    return (
      input.targetPairKey !== null &&
      input.relationship.matches[input.targetPairKey] !== undefined
    );
  }
  return true;
}

/** 硬合法：不含 Heat 档与软去重窗口（与 v2-router 的三层计数口径一致）。 */
function hardEligible(card: GameCard, input: V2RouterInput, options: DeckRouterOptions): boolean {
  if (!options.enabledPackIds.includes(card.packId)) return false;
  if (options.cardTypes?.length && !options.cardTypes.includes(card.type)) return false;
  if (card.intensity > input.intensityLimit) return false;
  if (input.requireFiveTierForPair !== null && card.intensity !== 5) return false;
  if (input.relationship.usedCardIds.includes(card.id)) return false;
  const activeCount = input.participants.filter((participant) => participant.active).length;
  if (activeCount < 2) return false;
  if (activeCount < card.minPlayers) return false;
  if (card.maxPlayers && card.maxPlayers < activeCount) return false;
  return targetEligible(card, input);
}

/** 确定性排序：强度降序、cardId 升序（Router 不掷随机数，出哪张由编排器与窗口决定）。 */
function sortCards(cards: GameCard[]): GameCard[] {
  return [...cards].sort(
    (a, b) => b.intensity - a.intensity || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

const toRouterCard = (card: GameCard): V2RouterCard => ({
  cardId: card.id,
  fiveTier: card.intensity === 5,
});

/**
 * 生产出卡端口：三层计数全部在**本局牌堆**上算。
 * - `bucket`：当前作用域玩法 ∩ 硬合法 ∩ 当前 Heat 档 ∩ 不在软去重窗口内（含「换一个」近似题面回避）。
 * - `pack`：当前作用域玩法的硬合法集（不套 Heat 档与软去重：本玩法还有材料，只是当前桶出不了）。
 * - `global`：本局启用玩法的硬合法集（同上）。
 * 作用域玩法优先取 `preferredPackIds`，其中无卡时回落到 `enabledPackIds`（与 V1.6 的偏好回落同口径）。
 */
export function createDeckRouter(options: DeckRouterOptions): V2RouterPort {
  const rejected = options.rejectedFingerprints ?? [];
  const deferred = rejected.length
    ? (cards: GameCard[]) => {
        const fresh = cards.filter((card) => !isRecentlyRejected(card, [...rejected]));
        return fresh.length ? fresh : cards;
      }
    : (cards: GameCard[]) => cards;

  const scopeOf = (input: V2RouterInput): readonly string[] => {
    if (!options.preferredPackIds.length) return options.enabledPackIds;
    const scopeHasCards = options.deck.some(
      (card) => options.preferredPackIds.includes(card.packId) && hardEligible(card, input, options),
    );
    return scopeHasCards ? options.preferredPackIds : options.enabledPackIds;
  };

  const recentWindow = (input: V2RouterInput): Set<string> => {
    if (input.softDedupWindow <= 0) return new Set();
    return new Set(input.relationship.recentCardIds.slice(-input.softDedupWindow));
  };

  return {
    bucket(input) {
      const scope = scopeOf(input);
      const excluded = recentWindow(input);
      const cards = options.deck.filter(
        (card) =>
          scope.includes(card.packId) &&
          hardEligible(card, input, options) &&
          heatEligible(card, input) &&
          !excluded.has(card.id),
      );
      return sortCards(deferred(cards)).map(toRouterCard);
    },
    pack(input) {
      const scope = scopeOf(input);
      return sortCards(
        options.deck.filter((card) => scope.includes(card.packId) && hardEligible(card, input, options)),
      ).map(toRouterCard);
    },
    global(input) {
      return sortCards(options.deck.filter((card) => hardEligible(card, input, options))).map(toRouterCard);
    },
  };
}

/* ------------------------------------------------------------------ */
/* 编排态读写                                                            */
/* ------------------------------------------------------------------ */

export const createInitialOrchestration = (): V2OrchestrationState => ({
  softDedupWindow: SOFT_DEDUP_WINDOW,
  awaitingHostDecision: false,
  lastExhaustionLevel: "BUCKET_OK",
  finished: false,
  hostDecisions: {},
});

/** 从 Session 组装 V2 编排态（缺失即初始档：旧 Session 原样可玩）。 */
export function orchestrationOf(session: GameSession): V2OrchestrationState {
  return session.v2Orchestration ?? createInitialOrchestration();
}

/**
 * 从 Session 组装关系态：`usedCardIds` 以 Session 的 used 账为准（转瓶子 L1 洗牌会直接改它，
 * 必须以 Session 为准才不会把洗回来的卡又当成已用）；其余字段（recent/Heat/MATCH/5 档）沿用持久化值。
 */
export function relationshipOf(session: GameSession): RelationshipState {
  const base = session.relationshipState ?? createInitialRelationshipState();
  return { ...base, usedCardIds: [...session.usedCardIds] };
}

export interface DrawDeckInput {
  session: GameSession;
  /** single 模式只在本玩法内抽；mixed 模式用阶段偏好（抽不到回落到 enabled）。 */
  preferredPackIds: readonly string[];
  enabledPackIds: readonly string[];
  cardTypes?: readonly string[];
}

export interface DrawDeckResult {
  outcome: V2DrawOutcome;
  /** 抽中卡（CARD 时一定能在 `session.deckSnapshot` 里找到）。 */
  card: GameCard | undefined;
}

/** 主链抽一张：唯一出卡入口 `drawV2SessionCard`（V2 Router 三层计数 + 耗尽控制器）。 */
export function drawDeckCard(input: DrawDeckInput): DrawDeckResult {
  const { session } = input;
  const state: V2SessionState = {
    sessionId: session.id,
    relationship: relationshipOf(session),
    // 旧 Session 可能没有 participants：按 config.players 幂等补齐（pairGender=null），不阻止出卡。
    participants: normalizeParticipants(session.participants, session.config.players),
    orchestration: orchestrationOf(session),
  };
  const router = createDeckRouter({
    deck: session.deckSnapshot,
    preferredPackIds: input.preferredPackIds,
    enabledPackIds: input.enabledPackIds,
    cardTypes: input.cardTypes,
    rejectedFingerprints: session.recentRejectedFingerprints ?? [],
  });
  const outcome = drawV2SessionCard(state, router, {
    intensityLimit: session.config.intensity,
  });
  const card =
    outcome.kind === "CARD"
      ? session.deckSnapshot.find((item) => item.id === outcome.cardId)
      : undefined;
  return { outcome, card };
}

/** 把编排结果写回 Session（used 账本 + 关系态 + 编排态；不碰牌堆与轮次）。 */
export function withV2State(session: GameSession, state: V2SessionState): GameSession {
  return {
    ...session,
    // used 的唯一真源是 relationship.usedCardIds（洗牌时两者一起清），这里保持同值。
    usedCardIds: [...state.relationship.usedCardIds],
    relationshipState: state.relationship,
    participants: state.participants,
    v2Orchestration: state.orchestration,
  };
}

/* ------------------------------------------------------------------ */
/* R4 §4.3 / §4.4 名册变更：退出（终止）/ 暂离（暂停）/ 回席                */
/* ------------------------------------------------------------------ */

/**
 * 局中玩家名册变更的**唯一落盘入口**（R4 §4.3/§4.4）。
 *
 * 按 `diffPlayerRoster` 的三分语义处理关系边，绝不把 `active=false` 一刀切：
 * - 真离开（从名册移除）→ `applyPlayerExit`：删含该玩家的 pairState/cooldowns/matches，
 *   相关 5 档保障进终态 `expired`（`expired-player-exit`），D5 名额立即释放；
 * - 暂离（仍在名册、`active` 转 false）→ `applyPlayerTemporarilyAway`：不删任何边，
 *   MATCH/cooldown/signal 全保留（D5 名额不释放），相关保障 `paused`（`player-away`），计数不清零；
 * - 回席（`active` 转 true）→ 不需要额外归约：资格由参与者投影重算，保障在下次出卡时
 *   沿 `advanceGuarantee(resume)` 从暂停点继续，不补算离席期机会。
 *
 * 参与者投影同事务更新（`active` 以新名册为准；离开者随名册消失而退出 pair pool），
 * 旧名册之外新增的玩家按新参与者处理（无历史边可迁移）。计数（effective/Heat/轮次）一律不动。
 */
export function applyPlayerRosterChange(session: GameSession, players: readonly Player[]): GameSession {
  const transitions = diffPlayerRoster(session.config.players, players);
  let relationship = relationshipOf(session);
  for (const playerId of transitions.exited) relationship = applyPlayerExit(relationship, playerId);
  for (const playerId of transitions.away) relationship = applyPlayerTemporarilyAway(relationship, playerId);

  const activeById = new Map(players.map((player) => [player.id, player.active]));
  const participants = normalizeParticipants(session.participants, players).map((participant) => ({
    ...participant,
    active: activeById.get(participant.playerId) === true,
  }));

  return withV2State(
    { ...session, config: { ...session.config, players: [...players] } },
    {
      sessionId: session.id,
      relationship,
      participants,
      orchestration: orchestrationOf(session),
    },
  );
}

/* ------------------------------------------------------------------ */
/* R3 事件归约：每轮终态 → 有效卡计数 / Heat（V2-B10）                      */
/* ------------------------------------------------------------------ */

/** 轮次终态（R3 `terminalEventExclusivity` 的三种合法值）。 */
export type V2RoundTerminal = TerminalInteractionState;

/** R3 事件族：只由本轮 `packId` 判定，不按交互文案或页面动作推导。 */
export type V2CardEventFamily = "REL" | "NEUTRAL" | "EXPANSION";

/**
 * 本轮所属 R3 事件族（唯一口径）：
 * - `expansion` 包 → EXPANSION（扩圈原版/table-only，不推进 Heat/Pair）；
 * - 关系主线玩法（`isV2MainlinePack`）→ REL（relationship-aware 普通卡）；
 * - 其余玩法（转瓶子等）→ NEUTRAL。
 */
export function cardEventFamilyForPack(packId: string): V2CardEventFamily {
  if (packId === EXPANSION_PACK_ID) return "EXPANSION";
  return isV2MainlinePack(packId) ? "REL" : "NEUTRAL";
}

const ROUND_EVENT_TYPE: Record<V2CardEventFamily, Record<V2RoundTerminal, RelationshipEventType>> = {
  REL: {
    completed: "REL_CARD_COMPLETED",
    skipped: "REL_CARD_SKIPPED",
    swapped: "REL_CARD_SWAPPED",
  },
  NEUTRAL: {
    completed: "NEUTRAL_CARD_COMPLETED",
    skipped: "NEUTRAL_CARD_SKIPPED_OR_SWAPPED",
    swapped: "NEUTRAL_CARD_SKIPPED_OR_SWAPPED",
  },
  EXPANSION: {
    completed: "EXPANSION_CARD_COMPLETED",
    skipped: "EXPANSION_CARD_SKIPPED_OR_SWAPPED",
    swapped: "EXPANSION_CARD_SKIPPED_OR_SWAPPED",
  },
};

/**
 * 轮次终态 → 唯一 R3 事件：
 * - `ref` = 轮次 id（interactionId，终态互斥键）；`eventId` = `轮次id::终态`（同轮重放幂等）；
 * - `cardId` 随事件走（R3：completed/skipped/swapped 均记 used）；
 * - `playerId` 只在单点名单轮（`participantIds` 恰 1 人）记定向归属；pair 回合没有单一
 *   「定向归属玩家」，不猜、也不按两人各记一遍；
 * - NEUTRAL / EXPANSION 的跳过/换题必须显式带 `terminal`，否则终态无法落盘。
 */
export function eventForRoundTerminal(
  round: NonNullable<GameSession["currentRound"]>,
  terminal: V2RoundTerminal,
  timestamp: string,
): RelationshipEvent {
  const family = cardEventFamilyForPack(round.packId);
  const event: RelationshipEvent = {
    eventId: `${round.id}::${terminal}`,
    type: ROUND_EVENT_TYPE[family][terminal],
    ref: round.id,
    cardId: round.cardId,
    timestamp,
  };
  if (family === "REL" && round.participantIds.length === 1) {
    event.playerId = round.participantIds[0];
  }
  if (family !== "REL" && terminal !== "completed") {
    event.terminal = terminal;
  }
  return event;
}

/**
 * 每轮 completed / skipped / swapped 后按 R3 事件表归约（唯一计数入口）：
 * - `REL_CARD_COMPLETED` 推进 `relationshipEffectiveCardCount`，Heat 由此重算，9/14/19 mutual 才可达；
 * - skipped / swapped / NEUTRAL / EXPANSION 一律 +0：不消耗 20/25 限额、不推进 Heat 或 mutual 间隔。
 *
 * 只动 `relationshipState`（+ `v2Orchestration`）与 used 账；`currentRound` 原样保留，
 * 供随后的 `completeRound` / `swapRound` / `skipRound` 与 `startRound` 继续使用。
 * 出牌时（`startRound`）本轮 `cardId` 已进 used 账，本函数归约后按首现去重，
 * 保证同一张卡不因「出牌 + 终态」两条路径记两次。
 */
export function reduceResolvedRound(
  session: GameSession,
  terminal: V2RoundTerminal,
  timestamp: string = new Date().toISOString(),
): GameSession {
  const round = session.currentRound;
  if (!round) return session;

  const state: V2SessionState = {
    sessionId: session.id,
    relationship: relationshipOf(session),
    participants: normalizeParticipants(session.participants, session.config.players),
    orchestration: orchestrationOf(session),
  };
  const reduced = reduceV2SessionEvents(state, [eventForRoundTerminal(round, terminal, timestamp)]).state;
  const relationship: RelationshipState = {
    ...reduced.relationship,
    usedCardIds: [...new Set(reduced.relationship.usedCardIds)],
  };
  return withV2State(session, { ...reduced, relationship });
}

/* ------------------------------------------------------------------ */
/* 耗尽 Host 决策（D8=A+，幂等）                                          */
/* ------------------------------------------------------------------ */

/** 处于 AWAITING_HOST_EXHAUSTION_DECISION 时的决策请求基线；非等待态返回 undefined。 */
export function awaitingHostDecision(session: GameSession): V2AwaitingHostOutcome | undefined {
  const orchestration = session.v2Orchestration;
  if (!orchestration?.awaitingHostDecision) return undefined;
  const relationship = relationshipOf(session);
  return {
    kind: "AWAITING_HOST_EXHAUSTION_DECISION",
    exhaustionCycle: relationship.exhaustionCycle,
    idempotencyKey: hostDecisionKey(session.id, relationship.exhaustionCycle + 1),
    state: {
      sessionId: session.id,
      relationship,
      participants: normalizeParticipants(session.participants, session.config.players),
      orchestration,
    },
  };
}

/**
 * 应用 Host 显式决策（结束本局 / 洗牌再玩），并把结果写回 Session。
 * 幂等键 = `sessionId + exhaustionCycle + 1`，同键重放直接复用账本，不多清一次 used、不多加 cycle。
 */
export function applyHostDecisionToSession(
  session: GameSession,
  awaiting: V2AwaitingHostOutcome,
  decision: V2HostDecision,
): GameSession {
  const result = applyV2HostDecision(awaiting.state, {
    decision,
    exhaustionCycle: awaiting.exhaustionCycle,
  });
  return withV2State(session, result.state);
}
