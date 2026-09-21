import { z } from "zod";

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

export const packRendererSchema = z.enum(["card", "binary-choice", "pointing", "compatibility", "spin"]);
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

export const roundHistorySchema = z.object({
  id: z.string(),
  cardId: z.string(),
  packId: z.string(),
  participantIds: z.array(z.string()),
  status: z.enum(["completed", "swapped", "skipped"]),
  result: z.record(z.string(), z.unknown()).optional(),
  startedAt: z.string(),
  endedAt: z.string(),
});
export type RoundHistory = z.infer<typeof roundHistorySchema>;

export const activeRoundSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  packId: z.string(),
  participantIds: z.array(z.string()),
  startedAt: z.string(),
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
  /** 当前玩法的局部状态（如默契测试的 pair/score），随 Session 一起恢复。 */
  currentPackState: z.record(z.string(), z.unknown()).optional(),
  /** 最近“换一个”拒绝的指纹，用于短期避免重复题面。 */
  recentRejectedFingerprints: z.array(z.string()).optional(),
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
