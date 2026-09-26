import { z } from "zod";
import {
  relationshipStateSchema,
  sessionParticipantSchema,
  v2OrchestrationStateSchema,
  type RelationshipState,
  type V2OrchestrationState,
} from "@/lib/v2-relationship/v2-state";

/** 本地持久化 schema 版本：V1 记录读取时必须先经 lib/storage/session-migration 迁移。 */
export const SESSION_SCHEMA_VERSION = 2 as const;

export const intensitySchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
export type Intensity = z.infer<typeof intensitySchema>;

export const boundaryTagSchema = z.enum([
  "physical-contact", "alcohol", "ex-partner", "sexual-history", "money",
  "phone-privacy", "public-posting", "stranger-contact", "photo-video", "social-account",
]);
export type BoundaryTag = z.infer<typeof boundaryTagSchema>;

export const playerSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(30),
  active: z.boolean(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
});
export type Player = z.infer<typeof playerSchema>;

export const boundaryProfileSchema = z.object({
  noPhysicalContact: z.boolean(),
  noAlcoholPenalty: z.boolean(),
  noExPartners: z.boolean(),
  noSexualHistory: z.boolean(),
  noMoneyIncome: z.boolean(),
  noPhonePrivacy: z.boolean(),
  noPublicPosting: z.boolean(),
  noStrangerContact: z.boolean(),
  noPhotoVideo: z.boolean(),
  noSocialAccounts: z.boolean(),
  customText: z.string().max(500),
});
export type BoundaryProfile = z.infer<typeof boundaryProfileSchema>;

export const gameCardSchema = z.object({
  id: z.string().min(1),
  packId: z.string().min(1),
  type: z.string().min(1),
  content: z.string().min(1).max(500),
  instruction: z.string().max(300).optional(),
  intensity: intensitySchema,
  tags: z.array(z.string()).default([]),
  boundaryTags: z.array(boundaryTagSchema).default([]),
  minPlayers: z.number().int().min(2),
  maxPlayers: z.number().int().min(2).optional(),
  participantMode: z.enum(["none", "single", "pair", "all"]),
  source: z.enum(["builtin", "ai", "custom"]),
});
export type GameCard = z.infer<typeof gameCardSchema>;

export const packRendererSchema = z.enum(["card", "binary-choice", "pointing", "compatibility", "spin", "random-launcher"]);
export type PackRenderer = z.infer<typeof packRendererSchema>;

/** Pack 能力声明：只描述玩法需要什么、由哪个 renderer 承载，不含 Session 业务逻辑。 */
export const packCapabilitySchema = z.object({
  requiresAIContent: z.boolean(),
  minPlayers: z.number().int().min(2),
  maxPlayers: z.number().int().min(2).optional(),
  supportsMixedMode: z.boolean(),
  supportsLocalSeed: z.boolean(),
  renderer: packRendererSchema,
});
export type PackCapability = z.infer<typeof packCapabilitySchema>;

export const gamePackDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  icon: z.string().min(1),
  enabledByDefault: z.boolean(),
  mixable: z.boolean(),
  minPlayers: z.number().int().min(2),
  supportedCardTypes: z.array(z.string()).min(1),
  weight: z.number().positive().default(1),
  source: z.enum(["builtin", "custom"]).default("builtin"),
  capability: packCapabilitySchema.optional(),
});
export type GamePackDefinition = z.infer<typeof gamePackDefinitionSchema>;

export const sessionConfigSchema = z.object({
  players: z.array(playerSchema).min(2),
  relationship: z.string().min(1),
  vibes: z.array(z.string()).min(1),
  intensity: intensitySchema,
  boundaries: boundaryProfileSchema,
  enabledPackIds: z.array(z.string()).min(1),
  mode: z.enum(["mixed", "single"]),
});
export type SessionConfig = z.infer<typeof sessionConfigSchema>;

/**
 * 轮次审计字段（V1.5）：段（segment）内可读轮次账 + 换题归组。
 * 旧落库形态没有这些字段，所以是可选的；由 session-engine 新建时写全、读取路径（session-migration）补全，
 * 两边都保证「能读到就一定有」，schema 保留可选只为兼容旧数据与测试里手写的最小轮次字面量。
 * - segmentId：本轮属于哪一段；只有主持人手动切包才开新段（顶栏轮次随之从 1 重计）。
 * - logicalRoundId：同一题被「换一个」后，替换题沿用同一个逻辑轮次 id，便于审计归组。
 * - displayRoundNo：段内第几轮；只有 completed 递增，swapped 复用，skipped 不递增。
 */
const roundAuditFields = {
  segmentId: z.string().optional(),
  logicalRoundId: z.string().optional(),
  displayRoundNo: z.number().int().min(0).optional(),
};

export const roundHistorySchema = z.object({
  id: z.string(),
  cardId: z.string(),
  packId: z.string(),
  participantIds: z.array(z.string()),
  status: z.enum(["completed", "swapped", "skipped"]),
  result: z.record(z.string(), z.unknown()).optional(),
  startedAt: z.string(),
  endedAt: z.string(),
  ...roundAuditFields,
});
export type RoundHistory = z.infer<typeof roundHistorySchema>;

export const activeRoundSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  packId: z.string(),
  participantIds: z.array(z.string()),
  startedAt: z.string(),
  ...roundAuditFields,
});
export type ActiveRound = z.infer<typeof activeRoundSchema>;

export const gameSessionSchema = z.object({
  schemaVersion: z.literal(SESSION_SCHEMA_VERSION),
  id: z.string(),
  status: z.enum(["generating", "active", "paused", "finished"]),
  mode: z.enum(["mixed", "single"]),
  config: sessionConfigSchema,
  deckSnapshot: z.array(gameCardSchema),
  usedCardIds: z.array(z.string()),
  rounds: z.array(roundHistorySchema),
  currentRound: activeRoundSchema.optional(),
  /** 当前玩法（局内切换只改这里，不重建 Session）。 */
  currentPackId: z.string().min(1),
  /**
   * 当前段 id（V1.5）：主持人手动切包才开新段，段内轮次从 1 重计；
   * 转瓶子链入/返回属于同一段（`PackTransitionCause`）。旧记录缺失时由读取路径补一个稳定值。
   */
  currentSegmentId: z.string().default(""),
  /**
   * 各玩法的局部状态，按 packId 分键（Plan §5.1 `packStates: Record<packId, state>` 的等价结构：
   * 字段名沿用 Spec §7 的 currentPackState）。切玩法只重置目标玩法那一格，其他玩法原样保留（GAP-02 / FR-035）。
   */
  currentPackState: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  /** 最近“换一个”拒绝的指纹，用于短期避免重复题面。 */
  recentRejectedFingerprints: z.array(z.string()).optional(),
  /**
   * V2.0 Relationship State（增量可选，旧 Session 原样可读）：
   * Signal/MATCH/关系状态不在旧轮次或历史行为中补算，旧 Session 无本字段即从空开始。
   * 校验走 `relationshipStateSchema`，类型直接取 `RelationshipState`（含 readonly 数组），
   * 避免 zod 推断把只读元组放宽成可变元组。
   */
  relationshipState: z.custom<RelationshipState>((value) => relationshipStateSchema.safeParse(value).success).optional(),
  /**
   * V2.0 当局参与者快照（pairGender 仅限当局，禁止回写 Player 档案）。
   * 旧 Session 缺失时读取路径补遍历 config.players 并置 pairGender=null。
   */
  participants: z.array(sessionParticipantSchema).optional(),
  /**
   * V2.0 Session 级编排态（B8）：软去重窗口、耗尽等待态与 Host 决策幂等账本。
   * 旧 Session 缺失即从初始档开始；无本字段不影响恢复。
   */
  v2Orchestration: z.custom<V2OrchestrationState>((value) => v2OrchestrationStateSchema.safeParse(value).success).optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  updatedAt: z.string(),
});
export type GameSession = z.infer<typeof gameSessionSchema>;

export const customGamePackSchema = z.object({
  schemaVersion: z.literal(1),
  definition: gamePackDefinitionSchema.extend({ source: z.literal("custom") }),
  cards: z.array(gameCardSchema.extend({ source: z.literal("custom") })),
  enabled: z.boolean(),
  updatedAt: z.string(),
});
export type CustomGamePack = z.infer<typeof customGamePackSchema>;

export const sessionSummarySchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  totalRounds: z.number().int().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  playerCount: z.number().int().min(2),
  packDistribution: z.record(z.string(), z.number().int().nonnegative()),
  endedAt: z.string(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
