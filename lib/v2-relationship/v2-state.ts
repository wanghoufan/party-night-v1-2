import { z } from "zod";
import type { GameSession } from "@/lib/domain/schemas";

/**
 * V2 Relationship State（增量扩展 Session，不建第二 store）。
 * 对应 PRODUCT_PLAN_V2.0 目标概念模型 Session.relationshipState 与 R3 事件表冻结。
 * 本模块只定义类型/常量/纯函数状态位，不做业务 reducer（由 v2 reducer/engine 负责落盘）。
 */

/* ------------------------------------------------------------------ */
/* D3=A：固定 20＋可再玩 5 个 Session completed rounds 冻结常量           */
/* ------------------------------------------------------------------ */

export const RELATIONSHIP_MODE = "fixed-20-plus-5" as const;

/** 默认 Session 结算边界，Session 创建时冻结。 */
export const BASE_SESSION_COMPLETED_ROUND_LIMIT = 20 as const;
/** 一次 +5 的加玩额度。 */
export const EXTENSION_SESSION_COMPLETED_ROUND_LIMIT = 5 as const;
/** 整局最多加玩一次。 */
export const MAX_EXTENSIONS = 1 as const;
/** 加玩开后整局最大 completed 轮数。 */
export const MAX_SESSION_COMPLETED_ROUNDS = 25 as const; // 20 + 5

/** Heat 绝对阈值：Heat 只看 relationshipEffectiveCardCount。 */
export interface HeatThresholdBand {
  heat: Heat;
  min: number;
  max: number;
}

export const HEAT_THRESHOLDS: readonly HeatThresholdBand[] = [
  { heat: "H1", min: 0, max: 3 },
  { heat: "H2", min: 4, max: 7 },
  { heat: "H3", min: 8, max: 12 },
  { heat: "H4", min: 13, max: Infinity },
];

export const HEAT_ORDER = ["H1", "H2", "H3", "H4"] as const;
export type Heat = (typeof HEAT_ORDER)[number];

/** 常规互选节奏：relationshipEffectiveCardCount 首次达到 9/14/19 后标记 due。 */
export const MUTUAL_CHECK_COUNTS = [9, 14, 19] as const;
export const MAX_REGULAR_MUTUAL_RUNS = 3 as const;
/** final vs 最近一次 regular mutual 的最小关系有效卡间隔。 */
export const MINIMUM_EFFECTIVE_CARDS_BETWEEN_RUNS = 5 as const;
/** regular mutual 触发时，目标 Session 剩余轮数下限，保证新 MATCH 能获保障窗口。 */
export const MINIMUM_REMAINING_SESSION_ROUNDS_FOR_REGULAR_MUTUAL = 2 as const;
/** D7=A：5 档保障需两次合格 pair opportunity 内展示一张合法 5 档。 */
export const FIVE_TIER_GUARANTEE_QUALIFYING_LIMIT = 2 as const;
/** D8=A+：recentCardIds 软去重窗口初始大小（5→4→3→2→1→0 逐步放宽）。 */
export const SOFT_DEDUP_WINDOW = 5 as const;

/** 初始 Heat。 */
export const INITIAL_HEAT: Heat = "H1";
/** 版本。 */
export const RELATIONSHIP_STATE_VERSION = 1 as const;

/* ------------------------------------------------------------------ */
/* Heat 纯函数                                                           */
/* ------------------------------------------------------------------ */

export function heatForEffectiveCount(effectiveCount: number): Heat {
  for (const band of HEAT_THRESHOLDS) {
    if (effectiveCount >= band.min && effectiveCount <= band.max) return band.heat;
  }
  // 负值防御：任何未计数/异常输入都落在最低档。
  return "H1";
}

/** Heat 单调不降比较。 */
export function isHeatAtLeast(current: Heat, target: Heat): boolean {
  return HEAT_ORDER.indexOf(current) >= HEAT_ORDER.indexOf(target);
}

/* ------------------------------------------------------------------ */
/* 事件终态互斥与 eventId 幂等类型                                          */
/* ------------------------------------------------------------------ */

/** R3 唯一计数事件表的事件类型。 */
export type RelationshipEventType =
  | "REL_CARD_COMPLETED"
  | "REL_CARD_SKIPPED"
  | "REL_CARD_SWAPPED"
  | "NEUTRAL_CARD_COMPLETED"
  | "NEUTRAL_CARD_SKIPPED_OR_SWAPPED"
  | "EXPANSION_CARD_COMPLETED"
  | "EXPANSION_CARD_SKIPPED_OR_SWAPPED"
  | "LEGACY_CURRENT_COMPLETED"
  | "LEGACY_CURRENT_SKIPPED"
  | "SYSTEM_MUTUAL_CHECK_DUE"
  | "SYSTEM_MUTUAL_CHECK_START"
  | "SYSTEM_MUTUAL_CHECK_SUBMIT"
  | "SYSTEM_MUTUAL_CHECK_COMPLETE"
  | "SYSTEM_MUTUAL_CHECK_CANCEL"
  | "SYSTEM_MUTUAL_CHECK_FINAL"
  | "EXTENSION_ACTIVATED_BY_HOST"
  | "CONSENT_REQUEST"
  | "CONSENT_SUBMIT"
  | "CONSENT_INTERSECTION"
  | "CONSENT_NO_ACTION"
  | "EVENT_REPLAYED_OR_DUPLICATE";

/** 同一 interactionId 唯一允许的三种终态之一。 */
export type TerminalInteractionState = "completed" | "skipped" | "swapped";

/** 消费 Session 轮次的事件类型（completed 消耗 20/25 上限）。 */
export const SESSION_COMPLETED_ROUND_EVENT_TYPES: readonly RelationshipEventType[] = [
  "REL_CARD_COMPLETED",
  "NEUTRAL_CARD_COMPLETED",
  "EXPANSION_CARD_COMPLETED",
  "LEGACY_CURRENT_COMPLETED",
];

/** 推进 relationshipEffectiveCardCount 的唯一事件类型。 */
export const RELATIONSHIP_EFFECTIVE_CARD_EVENT_TYPES: readonly RelationshipEventType[] = [
  "REL_CARD_COMPLETED",
];

/** 终态互斥：ref（interactionId）→ 已落盘的终态；首写后其余一律为重复事件。 */
export type TerminalExclusivityIndex = Record<string, TerminalInteractionState>;

/** eventId 幂等：已处理过的 eventId 集合；100% 幂等通过去重。 */
export type ProcessedEventIds = Set<string>;

/* ------------------------------------------------------------------ */
/* Coverage（按 playerId）                                               */
/* ------------------------------------------------------------------ */

export const DEFAULT_COVERAGE_LOW_PARTICIPATION_SKIP_THRESHOLD = 2 as const;

export interface PlayerCoverage {
  /** 合格定向机会已展示数（REL_CARD 展示且合格 targeting）。 */
  offeredTargeted: number;
  /** 合格定向且完成数。 */
  completedTargeted: number;
  /** 连续未完成的定向跳过数。 */
  consecutiveTargetedSkips: number;
  /** 低参与标记（连续跳过达到阈值后 true）。 */
  lowParticipation: boolean;
}

export const createEmptyPlayerCoverage = (): PlayerCoverage => ({
  offeredTargeted: 0,
  completedTargeted: 0,
  consecutiveTargetedSkips: 0,
  lowParticipation: false,
});

/* ------------------------------------------------------------------ */
/* Pair aggregate / MATCH / cooldown                                     */
/* ------------------------------------------------------------------ */

export type PairGender = "male" | "female";

/** D5：单个玩家 active MATCH 上限，新建 MATCH 前双方均须满足。 */
export const MAX_ACTIVE_MATCHES_PER_PLAYER = 2 as const;

export interface PairState {
  pairKey: string;
  /** 双向选择证据计数；custom（shared/compatibility/crowd/personal）互不升级。 */
  sharedEvidence: number;
  compatibilityEvidence: number;
  crowdEvidence: number;
  personalEvidence: number;
  matched: boolean;
  matchedAt: string | null;
  /** 该 pair 当前 cooldown（关系有效卡计数）。 */
  cooldownRounds: number;
}

export interface MatchState {
  pairKey: string;
  matchedAt: string;
  playerIds: readonly [string, string];
}

export type PendingFiveGuaranteeStatus = "pending" | "paused" | "offered" | "expired";

export interface PendingFiveGuarantee {
  status: PendingFiveGuaranteeStatus;
  /** 已累计的合格 Pair opportunity。 */
  qualifyingOpportunitiesSeen: number;
  /** D7=A：固定 2。 */
  qualifyingOpportunitiesLimit: number;
  createdAtEffectiveCount: number;
  pauseReason?: string;
  terminalReason?: string;
}

export interface PairFiveGuarantee {
  pairKey: string;
  tracker: PendingFiveGuarantee | null;
}

/* ------------------------------------------------------------------ */
/* RelationshipState 聚合根                                               */
/* ------------------------------------------------------------------ */

export interface RelationshipState {
  version: typeof RELATIONSHIP_STATE_VERSION;
  heat: Heat;
  heatProgressMode: typeof RELATIONSHIP_MODE;

  /* 双计数器 */
  sessionCompletedRounds: number;
  relationshipEffectiveCardCount: number;

  /* D3=A fixed-20-plus-5 */
  baseSessionCompletedRoundLimit: number;
  extensionSessionCompletedRoundLimit: number;
  extensionActivated: boolean;

  /* 互选调度 */
  lastMutualCheckAtEffectiveCount: number | null;
  regularMutualCheckRuns: number;

  /* Coverage */
  playerCoverage: Record<string, PlayerCoverage>;

  eligiblePairPolicyVersion: number;

  /* Pair aggregate + MATCH + cooldown */
  pairState: Record<string, PairState>;
  matches: Record<string, MatchState>;
  cooldowns: Record<string, number>;

  /* 5 档保障 */
  fiveGuarantees: Record<string, PairFiveGuarantee>;

  /* used / soft-dedup / exhaustion */
  usedCardIds: readonly string[];
  recentCardIds: readonly string[];
  exhaustionCycle: number;

  /* 原子去重元数据：终态互斥 + eventId 幂等 */
  terminalExclusivity: TerminalExclusivityIndex;
  processedEventIds: readonly string[];
}

export const createInitialRelationshipState = (): RelationshipState => ({
  version: RELATIONSHIP_STATE_VERSION,
  heat: INITIAL_HEAT,
  heatProgressMode: RELATIONSHIP_MODE,
  sessionCompletedRounds: 0,
  relationshipEffectiveCardCount: 0,
  baseSessionCompletedRoundLimit: BASE_SESSION_COMPLETED_ROUND_LIMIT,
  extensionSessionCompletedRoundLimit: EXTENSION_SESSION_COMPLETED_ROUND_LIMIT,
  extensionActivated: false,
  lastMutualCheckAtEffectiveCount: null,
  regularMutualCheckRuns: 0,
  playerCoverage: {},
  eligiblePairPolicyVersion: 1,
  pairState: {},
  matches: {},
  cooldowns: {},
  fiveGuarantees: {},
  usedCardIds: [],
  recentCardIds: [],
  exhaustionCycle: 0,
  terminalExclusivity: {},
  processedEventIds: [],
});

/* ------------------------------------------------------------------ */
/* Session 增量扩展：participants（pairGender 当局快照）                     */
/* ------------------------------------------------------------------ */

export interface SessionParticipant {
  playerId: string;
  active: boolean;
  pairGender: PairGender | null;
}

/** 非法/缺失 pairGender 一律规范化为 null，不猜测性别。 */
export const normalizePairGender = (value: unknown): PairGender | null =>
  value === "male" || value === "female" ? value : null;

/** R4 eligiblePair 谓词 + pairKey。 */
export const eligiblePair = (a: SessionParticipant, b: SessionParticipant): boolean =>
  a.active === true &&
  b.active === true &&
  a.playerId !== b.playerId &&
  a.pairGender !== null &&
  b.pairGender !== null &&
  a.pairGender !== b.pairGender;

export const pairKey = (a: string, b: string): string => [a, b].sort().join("::");

/* ------------------------------------------------------------------ */
/* 类型增强：把 relationshipState / participants 声明到 Session 上         */
/* ------------------------------------------------------------------ */

export type V2SessionExtension = {
  relationshipState?: RelationshipState;
  participants?: SessionParticipant[];
};

export type V2Session = GameSession & V2SessionExtension;

/* ------------------------------------------------------------------ */
/* zod schema（供 schemas.ts 增量扩展 Session，旧 Session 原样可读）         */
/* ------------------------------------------------------------------ */

export const pairGenderSchema = z.enum(["male", "female"]).nullable();

export const playerCoverageSchema = z.object({
  offeredTargeted: z.number().int().nonnegative(),
  completedTargeted: z.number().int().nonnegative(),
  consecutiveTargetedSkips: z.number().int().nonnegative(),
  lowParticipation: z.boolean(),
});

export const pairStateSchema = z.object({
  pairKey: z.string(),
  sharedEvidence: z.number().int().nonnegative(),
  compatibilityEvidence: z.number().int().nonnegative(),
  crowdEvidence: z.number().int().nonnegative(),
  personalEvidence: z.number().int().nonnegative(),
  matched: z.boolean(),
  matchedAt: z.string().nullable(),
  cooldownRounds: z.number().int().nonnegative(),
});

export const matchStateSchema = z.object({
  pairKey: z.string(),
  matchedAt: z.string(),
  playerIds: z.tuple([z.string(), z.string()]),
});

export const pendingFiveGuaranteeSchema = z.object({
  status: z.enum(["pending", "paused", "offered", "expired"]),
  qualifyingOpportunitiesSeen: z.number().int().nonnegative(),
  qualifyingOpportunitiesLimit: z.number().int().positive(),
  createdAtEffectiveCount: z.number().int().nonnegative(),
  pauseReason: z.string().optional(),
  terminalReason: z.string().optional(),
});

export const pairFiveGuaranteeSchema = z.object({
  pairKey: z.string(),
  tracker: pendingFiveGuaranteeSchema.nullable(),
});

export const relationshipStateSchema = z.object({
  version: z.literal(RELATIONSHIP_STATE_VERSION),
  heat: z.enum(HEAT_ORDER),
  heatProgressMode: z.literal(RELATIONSHIP_MODE),
  sessionCompletedRounds: z.number().int().nonnegative(),
  relationshipEffectiveCardCount: z.number().int().nonnegative(),
  baseSessionCompletedRoundLimit: z.number().int().positive(),
  extensionSessionCompletedRoundLimit: z.number().int().positive(),
  extensionActivated: z.boolean(),
  lastMutualCheckAtEffectiveCount: z.number().int().nonnegative().nullable(),
  regularMutualCheckRuns: z.number().int().nonnegative(),
  playerCoverage: z.record(z.string(), playerCoverageSchema),
  eligiblePairPolicyVersion: z.number().int().positive(),
  pairState: z.record(z.string(), pairStateSchema),
  matches: z.record(z.string(), matchStateSchema),
  cooldowns: z.record(z.string(), z.number().int().nonnegative()),
  fiveGuarantees: z.record(z.string(), pairFiveGuaranteeSchema),
  usedCardIds: z.array(z.string()),
  recentCardIds: z.array(z.string()),
  exhaustionCycle: z.number().int().nonnegative(),
  terminalExclusivity: z.record(z.string(), z.enum(["completed", "skipped", "swapped"])),
  processedEventIds: z.array(z.string()),
});

export const sessionParticipantSchema = z.object({
  playerId: z.string().min(1),
  active: z.boolean(),
  pairGender: pairGenderSchema,
});

/* ------------------------------------------------------------------ */
/* B8：Session 级编排态（随 Session 持久化；Host 决策幂等账本在其中）          */
/* ------------------------------------------------------------------ */

/** Host 在耗尽等待态的两个显式选择（D8=A+）。 */
export type V2HostDecision = "finish" | "reshuffle";

/** 一次 Host 决策的落盘结果；同键重放直接复用，不重算。 */
export interface V2HostDecisionRecord {
  decision: V2HostDecision;
  usedCardIds: string[];
  exhaustionCycle: number;
  finished: boolean;
}

/** B6/B8 编排态：随 Session 持久化（保存/恢复后从同一档继续）。 */
export interface V2OrchestrationState {
  /** B5/R5 §6.2：软去重窗口当前档，初始 SOFT_DEDUP_WINDOW，5→0 逐步放宽。 */
  softDedupWindow: number;
  /** 是否处于 AWAITING_HOST_EXHAUSTION_DECISION（暂停抽卡，可保存/恢复）。 */
  awaitingHostDecision: boolean;
  /** 最近一次耗尽层级（恢复后继续展示）。 */
  lastExhaustionLevel: V2ExhaustionLevel;
  /** Host 已选“结束本局”。 */
  finished: boolean;
  /** 幂等账本：key = sessionId + '::' + 决策后 exhaustionCycle。 */
  hostDecisions: Record<string, V2HostDecisionRecord>;
}

/** 与 v2-exhaustion 的 ExhaustionLevel 同值域（本文件不 import 控制器，避免循环）。 */
export type V2ExhaustionLevel =
  | "BUCKET_OK"
  | "BUCKET_EMPTY"
  | "PACK_EXHAUSTED"
  | "RELATIONSHIP_GLOBAL_EXHAUSTED"
  | "AWAITING_HOST_EXHAUSTION_DECISION";

export const v2HostDecisionRecordSchema = z.object({
  decision: z.enum(["finish", "reshuffle"]),
  usedCardIds: z.array(z.string()),
  exhaustionCycle: z.number().int().nonnegative(),
  finished: z.boolean(),
});

export const v2OrchestrationStateSchema = z.object({
  softDedupWindow: z.number().int().nonnegative(),
  awaitingHostDecision: z.boolean(),
  lastExhaustionLevel: z.enum([
    "BUCKET_OK",
    "BUCKET_EMPTY",
    "PACK_EXHAUSTED",
    "RELATIONSHIP_GLOBAL_EXHAUSTED",
    "AWAITING_HOST_EXHAUSTION_DECISION",
  ]),
  finished: z.boolean(),
  hostDecisions: z.record(z.string(), v2HostDecisionRecordSchema),
});