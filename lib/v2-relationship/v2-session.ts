/**
 * B6｜Session 级编排器（relationship-aware 主链调用方集成，D8=A+ / D2 单 Router）。
 *
 * 唯一主链顺序（PRODUCT_PLAN_V2.0 §H + V2-R5 §5/§6）：
 *   reducer（R3 事件归约）→ routing（Pair 路由）→ guarantee（D7 五档保障）
 *   → exhaustion assess（B5 五层级）→ 桶空则软去重窗口 5→4→3→2→1→0 逐步放宽
 *   → 仍空则返回 AWAITING_HOST_EXHAUSTION_DECISION，由调用方 applyHostDecision。
 *
 * 边界（不得越界）：
 * - 出卡只经 `V2RouterPort`（D2 V2 统一 Router 的调用契约）；本模块不 import
 *   `lib/engine/card-selector` 或任何旧 selector / 旧权重路由（16:8:4:2:1 /
 *   INTENSITY_WEIGHT / future deck），耗尽与洗牌后的兜底也一律回到该端口。
 * - 本模块是纯状态编排：不 import storage / DB / UI，不就地修改入参。
 * - 计数口径由 Router 端口自己保证（B5 review rec#1）：`bucket` 是「当前 Heat 内、
 *   在给定软去重窗口下、通过全部硬过滤后仍可出的卡」，`pack`/`global` 同理。
 *
 * 幂等（B5 P2 门禁 / R5 §6.3）：洗牌与结束都按 `sessionId + exhaustionCycle + 1`
 * 组装幂等键写入 Session 内的 `hostDecisions` 账本；同键重放直接返回上次结果，
 * 不多清一次 `usedCardIds`、不多加一个 cycle。AWAITING 结果回传 `exhaustionCycle`
 * 基线，调用方必须用 `hostDecisionRequest` 组请求，并把返回的 Session 状态（含账本）
 * 持久化——重放以「已应用结果态」为准，键不漂移（否则会被当成一次新的洗牌）。
 */

import {
  createInitialRelationshipState,
  FIVE_TIER_GUARANTEE_QUALIFYING_LIMIT,
  SOFT_DEDUP_WINDOW,
  type PairFiveGuarantee,
  type PendingFiveGuarantee,
  type RelationshipState,
  type SessionParticipant,
  type V2HostDecision,
  type V2HostDecisionRecord,
  type V2OrchestrationState,
} from "./v2-state";
import {
  reduceRelationshipEvent,
  type ReduceDelta,
  type RelationshipEvent,
} from "./v2-reducer";
import { isSingleAnchorExposed, rankPairs, singleAnchorPlayerId } from "./v2-routing";
import { advanceGuarantee, type FiveGuaranteeEvent } from "./v2-guarantee";
import {
  applyHostDecision,
  assessExhaustion,
  widenDedupWindow,
  type HostDecisionState,
} from "./v2-exhaustion";

// B8：编排态类型随 Session 持久化，真源搬到 v2-state（含 zod schema），这里原样转发。
export type {
  V2ExhaustionLevel,
  V2HostDecision,
  V2HostDecisionRecord,
  V2OrchestrationState,
} from "./v2-state";

/* ------------------------------------------------------------------ */
/* D2：V2 统一 Router 调用契约（唯一出卡入口）                              */
/* ------------------------------------------------------------------ */

/** Router 返回的一张候选卡。`fiveTier` 用于 D7 保障推进，不得由 UI 猜测。 */
export interface V2RouterCard {
  cardId: string;
  /** 是否为「合法 5 档」（intensity=5 且已通过全部硬过滤）。 */
  fiveTier: boolean;
}

export interface V2RouterInput {
  relationship: RelationshipState;
  participants: readonly SessionParticipant[];
  /** Pair 路由选中的目标 pair；null = 中性 / 无合法 pair 降级模式（D4）。 */
  targetPairKey: string | null;
  /** 当局开放度上限（1–5）。 */
  intensityLimit: number;
  /** 当前软去重窗口档：Router 需排除 `recentCardIds` 中最近该数量的卡。 */
  softDedupWindow: number;
  /** D7：非 null 时该 pair 处于第 2 次合格机会，Router 只能从合法 5 档集出卡。 */
  requireFiveTierForPair: string | null;
  /**
   * R-CB6｜Single-Anchor Guard：true = 本轮只许出**非定向**卡（`targetMode === "all-players"`），
   * 用于把 anchor 的 pair opportunity 隔开一轮（已在展示那一刻起算，与 completed/skipped 无关）。
   *
   * 缺省 `undefined` = false = 与改动前逐条一致（定向卡照常可出）。
   * 仅由 Guard 强制非定向轮置 true，普通桌 / 普通 pair opportunity 一律不带。
   */
  requireNonTargetedOpportunity?: boolean;
}

/**
 * V2 统一 Router 端口。生产实现必须是 D2 唯一 Router；旧 selector 不可实现本端口。
 * 三个层级计数口径由实现方保证（capability / Intensity-Heat / boundary / consent /
 * target-pair-MATCH / used / 硬 cooldown 全部过滤后仍可出的卡）。
 */
export interface V2RouterPort {
  /** 当前桶：当前 Heat 内在给定软去重窗口下仍可出的卡（含向更低合法档位归一化），已排序。 */
  bucket(input: V2RouterInput): readonly V2RouterCard[];
  /** 当前玩法（pack）硬合法集，已排序。 */
  pack(input: V2RouterInput): readonly V2RouterCard[];
  /** 全局 relationship-aware 硬合法集，已排序。 */
  global(input: V2RouterInput): readonly V2RouterCard[];
}

/* ------------------------------------------------------------------ */
/* R-CB6/R-CB7｜Single-Anchor Guard（薄调度层，不改 Router 主语义）          */
/* ------------------------------------------------------------------ */

/** 受控 bypass 的机器可读 reason：上轮 anchor 曝光后，本轮抽不出任何合法非定向卡。 */
export const NO_LEGAL_NON_TARGETED_CANDIDATE = "NO_LEGAL_NON_TARGETED_CANDIDATE" as const;

export type V2SingleAnchorGuardReason = typeof NO_LEGAL_NON_TARGETED_CANDIDATE;

/**
 * 本轮 Single-Anchor Guard 决策（随 outcome 回传，机器可读；**不进 RelationshipState**）。
 *
 * 两层消解（R-CB7）：
 * - 第一层在 `scheduleTargetPair`：决定**本轮是否进入 pair opportunity**（`applied=true` + 目标 pair
 *   为 `null` = 先走非定向轮，该轮不进 D7、不消耗 pending）；
 * - 第二层在既有 D7 冻结规则里：一旦本轮确实是 pair opportunity，D7 的五档强制/合格机会口径
 *   优先于 Coverage / Signal 排序（`requireFiveTierForPair` 是硬过滤）。
 */
export interface V2SingleAnchorGuard {
  /** 本局是否 Single-Anchor 桌（min==1 且 max>=3，只看 active + 已录入 pairGender）。 */
  singleAnchorTable: boolean;
  /** anchor（少数方唯一玩家）id；普通桌 / 无法识别时为 null。 */
  anchorPlayerId: string | null;
  /** 本轮 Guard 是否生效（阻止本轮再进 anchor 的 pair opportunity）。 */
  applied: boolean;
  /** 受控 bypass 的机器可读 reason；正常轮为 null。 */
  reason: V2SingleAnchorGuardReason | null;
}

/* ------------------------------------------------------------------ */
/* Session 编排状态                                                      */
/* ------------------------------------------------------------------ */

export interface V2SessionState {
  sessionId: string;
  relationship: RelationshipState;
  participants: SessionParticipant[];
  orchestration: V2OrchestrationState;
}

export function createV2SessionState(input: {
  sessionId: string;
  participants?: readonly SessionParticipant[];
}): V2SessionState {
  return {
    sessionId: input.sessionId,
    relationship: createInitialRelationshipState(),
    participants: [...(input.participants ?? [])],
    orchestration: {
      softDedupWindow: SOFT_DEDUP_WINDOW,
      awaitingHostDecision: false,
      lastExhaustionLevel: "BUCKET_OK",
      finished: false,
      hostDecisions: {},
      // R-CB6：新局尚无展示事实 = 无曝光。
      lastTargetedPairKey: null,
    },
  };
}

/* ------------------------------------------------------------------ */
/* reducer 步：R3 事件归约 + D7 保建立                                    */
/* ------------------------------------------------------------------ */

export interface V2ReduceOutcome {
  state: V2SessionState;
  deltas: ReduceDelta[];
}

function createPendingFiveGuarantee(pairKey: string, effectiveCount: number): PairFiveGuarantee {
  return {
    pairKey,
    tracker: {
      status: "pending",
      // 新 MATCH 建立保障窗口，但尚未消耗任何合格机会，故从 0 起。
      qualifyingOpportunitiesSeen: 0,
      qualifyingOpportunitiesLimit: FIVE_TIER_GUARANTEE_QUALIFYING_LIMIT,
      createdAtEffectiveCount: effectiveCount,
    },
  };
}

/**
 * 唯一主链事件入口：逐条归约 R3 事件；一旦 `match_created`，即为该 pair 建立
 * D7 pending 保障（seen=0，等待后续合格机会）。
 */
export function reduceV2SessionEvents(
  state: V2SessionState,
  events: readonly RelationshipEvent[],
): V2ReduceOutcome {
  let relationship = state.relationship;
  const deltas: ReduceDelta[] = [];

  for (const event of events) {
    const reduced = reduceRelationshipEvent(relationship, event);
    relationship = reduced.state;
    deltas.push(reduced.delta);

    if (
      reduced.delta.reasons.includes("match_created") &&
      event.pairKey !== undefined &&
      relationship.fiveGuarantees[event.pairKey] === undefined
    ) {
      relationship = {
        ...relationship,
        fiveGuarantees: {
          ...relationship.fiveGuarantees,
          [event.pairKey]: createPendingFiveGuarantee(
            event.pairKey,
            relationship.relationshipEffectiveCardCount,
          ),
        },
      };
    }
  }

  return { state: { ...state, relationship }, deltas };
}

/* ------------------------------------------------------------------ */
/* routing 步：Pair 路由                                                 */
/* ------------------------------------------------------------------ */

export type V2PairSignals = Record<
  string,
  { shared: number; compat: number; crowd: number; personal: number }
>;

/** 从 relationship.pairState 派生 R3 路由信号；无 pairState 时返回空信号。 */
export function signalsFromRelationship(relationship: RelationshipState): V2PairSignals {
  const signals: V2PairSignals = {};
  for (const [key, pair] of Object.entries(relationship.pairState)) {
    signals[key] = {
      shared: pair.sharedEvidence,
      compat: pair.compatibilityEvidence,
      crowd: pair.crowdEvidence,
      personal: pair.personalEvidence,
    };
  }
  return signals;
}

/**
 * Pair 路由：合法 pair 池按 R3 冻结排序取首位；无合法 pair 时返回 null（中性降级）。
 * R-CB5：把 `relationship.playerCoverage` 作为软排序第 5 参传入（只降权，不越硬合法）。
 */
export function selectTargetPair(
  state: V2SessionState,
  signals?: V2PairSignals,
): string | null {
  const ranked = rankPairs(
    state.participants,
    signals ?? signalsFromRelationship(state.relationship),
    new Set(Object.keys(state.relationship.matches)),
    state.relationship.cooldowns,
    state.relationship.playerCoverage,
  );
  return ranked[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* 出卡：guarantee → exhaustion assess → widen                           */
/* ------------------------------------------------------------------ */

export interface V2DrawRequest {
  /** 当局开放度上限（1–5）。 */
  intensityLimit: number;
  /** 路由信号；缺省时从 relationship.pairState 派生。 */
  signals?: V2PairSignals;
}

/** 本回合对 D7 保障推进的事件（"none" = 未推进）。 */
export type V2GuaranteeAdvance = FiveGuaranteeEvent["kind"] | "none";

export interface V2CardOutcome {
  kind: "CARD";
  cardId: string;
  targetPairKey: string | null;
  exhaustionLevel: "BUCKET_OK" | "BUCKET_EMPTY";
  /** 实际出卡所用软去重窗口档（BUCKET_EMPTY 时 < 起始窗口）。 */
  dedupWindowApplied: number;
  guaranteeAdvance: V2GuaranteeAdvance;
  /** 本轮 Single-Anchor Guard 决策（机器可读；`applied=true` 且 `targetPairKey=null` 即非定向轮）。 */
  guard: V2SingleAnchorGuard;
  state: V2SessionState;
}

export interface V2PackExhaustedOutcome {
  kind: "PACK_EXHAUSTED";
  guidance: string;
  guard: V2SingleAnchorGuard;
  state: V2SessionState;
}

export interface V2GlobalExhaustedOutcome {
  kind: "RELATIONSHIP_GLOBAL_EXHAUSTED";
  guidance: string;
  guard: V2SingleAnchorGuard;
  state: V2SessionState;
}

/** Host 决策等待态；`exhaustionCycle` 是决策前基线，用于组装幂等键。 */
export interface V2AwaitingHostOutcome {
  kind: "AWAITING_HOST_EXHAUSTION_DECISION";
  exhaustionCycle: number;
  idempotencyKey: string;
  guard: V2SingleAnchorGuard;
  state: V2SessionState;
}

export type V2DrawOutcome =
  | V2CardOutcome
  | V2PackExhaustedOutcome
  | V2GlobalExhaustedOutcome
  | V2AwaitingHostOutcome;

export const PACK_EXHAUSTED_GUIDANCE = "本玩法本局已玩完，可切换其他有卡玩法";
export const RELATIONSHIP_GLOBAL_EXHAUSTED_GUIDANCE =
  "关系主线当前已无合法卡，请继续收敛到仍有卡的关系玩法";

interface GuaranteeEvaluation {
  /** 出卡前需应用的 pause/resume；null = 不变。 */
  preEvent: FiveGuaranteeEvent | null;
  /** 本回合是否为该 pair 的合格机会（≥1 张合法 5 档卡）。 */
  qualifying: boolean;
  /** 第 2 次合格机会必须强制合法 5 档。 */
  requireFiveTier: boolean;
}

function evaluateGuarantee(
  tracker: PendingFiveGuarantee | null,
  intensityLimit: number,
  fiveTierAvailable: boolean,
): GuaranteeEvaluation {
  if (tracker === null || (tracker.status !== "pending" && tracker.status !== "paused")) {
    return { preEvent: null, qualifying: false, requireFiveTier: false };
  }
  if (intensityLimit < 5) {
    return {
      preEvent:
        tracker.status === "pending"
          ? { kind: "pause", reason: "intensity-below-five" }
          : null,
      qualifying: false,
      requireFiveTier: false,
    };
  }
  if (!fiveTierAvailable) {
    return {
      preEvent:
        tracker.status === "pending" ? { kind: "pause", reason: "no-legal-five-card" } : null,
      qualifying: false,
      requireFiveTier: false,
    };
  }
  return {
    preEvent: tracker.status === "paused" ? { kind: "resume" } : null,
    qualifying: true,
    requireFiveTier: tracker.qualifyingOpportunitiesSeen >= 1,
  };
}

function withTracker(
  relationship: RelationshipState,
  pairKey: string,
  guarantee: PairFiveGuarantee,
): RelationshipState {
  return {
    ...relationship,
    fiveGuarantees: { ...relationship.fiveGuarantees, [pairKey]: guarantee },
  };
}

/* ------------------------------------------------------------------ */
/* R-CB6/R-CB7 第一层：本轮是否进入 pair opportunity（薄调度）              */
/* ------------------------------------------------------------------ */

/** 未发生调度时的 Guard 视图（仍如实回传本局是否 Single-Anchor 桌）。 */
function idleGuard(state: V2SessionState): V2SingleAnchorGuard {
  const anchorPlayerId = singleAnchorPlayerId(state.participants);
  return {
    singleAnchorTable: anchorPlayerId !== null,
    anchorPlayerId,
    applied: false,
    reason: null,
  };
}

/** 组装一次 Router 输入（探针与出卡共用同一入口，避免两侧过滤口径漂移）。 */
function sessionRouterInput(
  state: V2SessionState,
  request: V2DrawRequest,
  startWindow: number,
  target: { targetPairKey: string | null; requireNonTargetedOpportunity: boolean },
): V2RouterInput {
  return {
    relationship: state.relationship,
    participants: state.participants,
    targetPairKey: target.targetPairKey,
    intensityLimit: request.intensityLimit,
    softDedupWindow: startWindow,
    requireFiveTierForPair: null,
    ...(target.requireNonTargetedOpportunity ? { requireNonTargetedOpportunity: true } : {}),
  };
}

/**
 * 该输入在软去重窗口阶梯（当前档 → … → 0）上是否**真抽得出卡**。
 * 与出卡路径同一放宽规则：只看 bucket，不看 pack/global —— 判据是「本轮能不能出这张非定向卡」，
 * 保证 Guard 的非定向轮不会变成空转或意外耗尽态。
 */
function hasDrawableCard(router: V2RouterPort, input: V2RouterInput, startWindow: number): boolean {
  if (router.bucket(input).length > 0) return true;
  let window = widenDedupWindow(startWindow);
  for (;;) {
    if (router.bucket({ ...input, softDedupWindow: window }).length > 0) return true;
    if (window === 0) return false;
    window = widenDedupWindow(window);
  }
}

interface SingleAnchorSchedule {
  targetPairKey: string | null;
  guard: V2SingleAnchorGuard;
}

/**
 * 本轮目标 pair 的唯一调度点（R-CB6/R-CB7 第一层；不重写 Router）。
 *
 * - 普通路径：`selectTargetPair` 的 R3 冻结排序首位（Coverage 已在其内部参与软排序）；
 * - Guard 触发（Single-Anchor 桌 + 上轮已展示的 targeted pair 涉及 anchor）时：
 *   若本轮抽得出合法非定向卡（`targetPairKey=null` + 只许 `all-players` 的硬过滤），
 *   则本轮改走非定向轮（`targetPairKey=null`，不进 pair opportunity、不计 D7 合格机会）；
 *   若完全抽不出非定向卡，则**受控 bypass**：照常进入 pair opportunity，并回传
 *   `NO_LEGAL_NON_TARGETED_CANDIDATE`（有限步内返回，不死锁、不空转）。
 * - 无合法 pair（D4 降级）时 Guard 不介入：没有 pair opportunity 可保护。
 */
function scheduleTargetPair(
  state: V2SessionState,
  router: V2RouterPort,
  request: V2DrawRequest,
  startWindow: number,
): SingleAnchorSchedule {
  const guard = idleGuard(state);
  const ranked = selectTargetPair(state, request.signals);

  if (
    ranked === null ||
    !isSingleAnchorExposed(guard.anchorPlayerId, state.orchestration.lastTargetedPairKey)
  ) {
    return { targetPairKey: ranked, guard };
  }

  const nonTargeted = sessionRouterInput(state, request, startWindow, {
    targetPairKey: null,
    requireNonTargetedOpportunity: true,
  });
  if (hasDrawableCard(router, nonTargeted, startWindow)) {
    return { targetPairKey: null, guard: { ...guard, applied: true } };
  }
  return {
    targetPairKey: ranked,
    guard: { ...guard, applied: true, reason: NO_LEGAL_NON_TARGETED_CANDIDATE },
  };
}

/**
 * 主链出卡：**Single-Anchor Guard 调度（R-CB6/R-CB7 第一层）** → Pair 路由 → D7 保障判定
 * → 软去重窗口（当前档起，空则 5→0 逐步放宽）→ B5 五层级判定。命中卡片时把 `CARD_PRESENTED`
 * 计入 `recentCardIds`（保最近 5 张）、记录**本轮展示事实**（`lastTargetedPairKey`，Guard 的唯一
 * 曝光输入）并推进保障；三层皆空时返回 Host 决策等待态（不自动洗牌、不自动结束）。
 */
export function drawV2SessionCard(
  state: V2SessionState,
  router: V2RouterPort,
  request: V2DrawRequest,
): V2DrawOutcome {
  /* AWAITING 期间暂停抽卡：不自动洗牌/结束，重入直接返回同一等待态。 */
  if (state.orchestration.awaitingHostDecision) {
    return toAwaitingOutcome(state, idleGuard(state));
  }

  const startWindow = state.orchestration.softDedupWindow;

  /* R-CB6/R-CB7 第一层：先决定本轮是否进入 pair opportunity；Guard 只在这一层介入。 */
  const { targetPairKey, guard } = scheduleTargetPair(state, router, request, startWindow);
  /** Guard 强制的非定向轮：本轮 Router 只许出非定向卡（硬过滤）。 */
  const guardRound = guard.applied && targetPairKey === null;

  const baseInput: V2RouterInput = sessionRouterInput(state, request, startWindow, {
    targetPairKey,
    requireNonTargetedOpportunity: guardRound,
  });

  /* D7 保障：先判定本回合是否合格机会、是否必须强制合法 5 档，并处理 pause/resume。 */
  const tracker = targetPairKey
    ? (state.relationship.fiveGuarantees[targetPairKey]?.tracker ?? null)
    : null;
  const fiveTierAvailable =
    tracker !== null && request.intensityLimit >= 5
      ? router.bucket(baseInput).some((card) => card.fiveTier)
      : false;
  const evaluation = evaluateGuarantee(tracker, request.intensityLimit, fiveTierAvailable);

  let relationship = state.relationship;
  let guaranteeAdvance: V2GuaranteeAdvance = "none";
  if (targetPairKey !== null && evaluation.preEvent !== null) {
    const advanced = advanceGuarantee(
      relationship.fiveGuarantees[targetPairKey] ?? null,
      evaluation.preEvent,
    );
    relationship = withTracker(relationship, targetPairKey, advanced);
    guaranteeAdvance = evaluation.preEvent.kind;
  }

  const drawInput: V2RouterInput = {
    ...baseInput,
    relationship,
    requireFiveTierForPair: evaluation.requireFiveTier ? targetPairKey : null,
  };

  /* 当前窗口起；桶空则按 5→4→3→2→1→0 逐步放宽，首个非空窗口即停。 */
  const startCandidates = router.bucket(drawInput);
  let appliedWindow = startWindow;
  let effectiveCandidates = startCandidates;
  if (startCandidates.length === 0) {
    let window = widenDedupWindow(startWindow);
    for (;;) {
      const candidates = router.bucket({ ...drawInput, softDedupWindow: window });
      appliedWindow = window;
      if (candidates.length > 0) {
        effectiveCandidates = candidates;
        break;
      }
      if (window === 0) break;
      window = widenDedupWindow(window);
    }
  }

  const level = assessExhaustion(
    {
      bucket: startCandidates.length,
      pack: router.pack(drawInput).length,
      global: router.global(drawInput).length,
    },
    startCandidates.length === 0 ? effectiveCandidates.length : 0,
  );

  if (level === "BUCKET_OK" || level === "BUCKET_EMPTY") {
    const card = effectiveCandidates[0];

    /* D7：展示合法 5 档即 offered 终态；否则消耗一次合格机会（qualify）。 */
    if (targetPairKey !== null && evaluation.qualifying) {
      const event: FiveGuaranteeEvent = card.fiveTier
        ? { kind: "present" }
        : { kind: "qualify" };
      const advanced = advanceGuarantee(
        relationship.fiveGuarantees[targetPairKey] ?? null,
        event,
      );
      relationship = withTracker(relationship, targetPairKey, advanced);
      guaranteeAdvance = event.kind;
    }

    return {
      kind: "CARD",
      cardId: card.cardId,
      targetPairKey,
      exhaustionLevel: level,
      dedupWindowApplied: appliedWindow,
      guaranteeAdvance,
      guard,
      state: {
        ...state,
        relationship: {
          ...relationship,
          recentCardIds: [...relationship.recentCardIds, card.cardId].slice(
            -SOFT_DEDUP_WINDOW,
          ),
        },
        orchestration: {
          ...state.orchestration,
          // 新一轮从初始窗口重新评估（R5 §6.2「每次抽取先用窗口 5」）。
          softDedupWindow: SOFT_DEDUP_WINDOW,
          awaitingHostDecision: false,
          lastExhaustionLevel: level,
          // R-CB6：本轮**展示事实**——定向轮记该 pair key，非定向轮记 null。
          // 与 D7 的「CARD_PRESENTED 即 offered」同口径（展示即记，不看终态），
          // 因此 targeted 展示后紧跟 skip，下轮 Guard 依然生效。
          lastTargetedPairKey: targetPairKey,
        },
      },
    };
  }

  /* 耗尽：窗口停在放宽到的档位（全空即 0）并随 Session 持久化。 */
  // 本轮没有展示任何卡 → `lastTargetedPairKey` 原样保留（不写 null、不清 Guard）。
  const exhaustedState: V2SessionState = {
    ...state,
    relationship,
    orchestration: {
      ...state.orchestration,
      softDedupWindow: appliedWindow,
      awaitingHostDecision: level === "AWAITING_HOST_EXHAUSTION_DECISION",
      lastExhaustionLevel: level,
    },
  };

  if (level === "PACK_EXHAUSTED") {
    return { kind: "PACK_EXHAUSTED", guidance: PACK_EXHAUSTED_GUIDANCE, guard, state: exhaustedState };
  }
  if (level === "RELATIONSHIP_GLOBAL_EXHAUSTED") {
    return {
      kind: "RELATIONSHIP_GLOBAL_EXHAUSTED",
      guidance: RELATIONSHIP_GLOBAL_EXHAUSTED_GUIDANCE,
      guard,
      state: exhaustedState,
    };
  }
  return {
    kind: "AWAITING_HOST_EXHAUSTION_DECISION",
    exhaustionCycle: state.relationship.exhaustionCycle,
    idempotencyKey: hostDecisionKey(state.sessionId, state.relationship.exhaustionCycle + 1),
    guard,
    state: exhaustedState,
  };
}

function toAwaitingOutcome(state: V2SessionState, guard: V2SingleAnchorGuard): V2AwaitingHostOutcome {
  return {
    kind: "AWAITING_HOST_EXHAUSTION_DECISION",
    exhaustionCycle: state.relationship.exhaustionCycle,
    idempotencyKey: hostDecisionKey(state.sessionId, state.relationship.exhaustionCycle + 1),
    guard,
    state,
  };
}

/* ------------------------------------------------------------------ */
/* Host 决策：结束本局 / 洗牌再玩（幂等）                                   */
/* ------------------------------------------------------------------ */

/** 幂等键真源：`sessionId + exhaustionCycle + 1`（R5 §6.3）。 */
export function hostDecisionKey(sessionId: string, resultingCycle: number): string {
  return `${sessionId}::${resultingCycle}`;
}

export interface V2HostDecisionRequest {
  decision: V2HostDecision;
  /** AWAITING 结果给出的决策前基线 cycle；不得改读当前状态（否则重放键会漂移）。 */
  exhaustionCycle: number;
}

/** 由 AWAITING 结果组装 Host 决策请求（保证重放/恢复命中同一幂等键）。 */
export function hostDecisionRequest(
  awaiting: V2AwaitingHostOutcome,
  decision: V2HostDecision,
): V2HostDecisionRequest {
  return { decision, exhaustionCycle: awaiting.exhaustionCycle };
}

export interface V2HostDecisionOutcome {
  decision: V2HostDecision;
  usedCardIds: string[];
  exhaustionCycle: number;
  finished: boolean;
}

export interface V2HostDecisionResult {
  state: V2SessionState;
  /** true = 同幂等键重放，未重复清 used / 未重复加 cycle。 */
  replayed: boolean;
  outcome: V2HostDecisionOutcome;
}

function reconcileHostDecision(
  state: V2SessionState,
  recorded: V2HostDecisionRecord,
): V2SessionState {
  return {
    ...state,
    relationship: {
      ...state.relationship,
      usedCardIds: recorded.usedCardIds,
      exhaustionCycle: recorded.exhaustionCycle,
    },
    orchestration: {
      ...state.orchestration,
      awaitingHostDecision: false,
      finished: recorded.finished,
    },
  };
}

/**
 * 应用 Host 显式决策（B5 `applyHostDecision` 是决策语义唯一真源）。
 * - `finish`：`usedCardIds` 与 `exhaustionCycle` 均不变，标记本局结束。
 * - `reshuffle`：只清 `usedCardIds`、`exhaustionCycle + 1`；`recentCardIds` / Heat /
 *   Coverage / Signals / MATCH / cooldown / 5 档保障全部原样保留。
 * 同键重放直接复用已记录结果，不重复清零、不重复加 cycle。
 */
export function applyV2HostDecision(
  state: V2SessionState,
  request: V2HostDecisionRequest,
): V2HostDecisionResult {
  const key = hostDecisionKey(state.sessionId, request.exhaustionCycle + 1);

  const recorded = state.orchestration.hostDecisions[key];
  if (recorded !== undefined) {
    return { state: reconcileHostDecision(state, recorded), replayed: true, outcome: recorded };
  }

  const base: HostDecisionState = {
    usedCardIds: [...state.relationship.usedCardIds],
    recentCardIds: [...state.relationship.recentCardIds],
    // 以请求基线为 cycle，保证 B5 的 +1 与幂等键口径一致。
    exhaustionCycle: request.exhaustionCycle,
  };
  const applied = applyHostDecision(base, request.decision);
  const outcome: V2HostDecisionOutcome = {
    decision: request.decision,
    usedCardIds: applied.usedCardIds,
    exhaustionCycle: applied.exhaustionCycle,
    finished: request.decision === "finish",
  };

  return {
    replayed: false,
    outcome,
    state: {
      ...state,
      relationship: {
        ...state.relationship,
        usedCardIds: applied.usedCardIds,
        exhaustionCycle: applied.exhaustionCycle,
      },
      orchestration: {
        ...state.orchestration,
        softDedupWindow: SOFT_DEDUP_WINDOW,
        awaitingHostDecision: false,
        finished: outcome.finished,
        hostDecisions: { ...state.orchestration.hostDecisions, [key]: outcome },
      },
    },
  };
}
