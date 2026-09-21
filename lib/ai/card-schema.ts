import { gameCardSchema } from "@/lib/domain/schemas";
import { z } from "zod";
import { normalizeAICard } from "./normalize";

export const aiGameCardSchema = gameCardSchema.omit({ source: true }).extend({
  source: z.literal("ai").default("ai"),
});

/** 新玩法结构化卡的公共部分：V1.0 的 content 换成各玩法专属字段（Plan 8.1-8.3）。 */
const aiStructuredCardBase = aiGameCardSchema.omit({ content: true }).extend({
  minPlayers: z.number().int().min(2).default(2),
  participantMode: gameCardSchema.shape.participantMode.default("all"),
});

export const aiWouldYouRatherCardSchema = aiStructuredCardBase.extend({
  type: z.literal("would-you-rather"),
  optionA: z.string().min(1).max(120),
  optionB: z.string().min(1).max(120),
});

export const aiPointingCardSchema = aiStructuredCardBase.extend({
  type: z.literal("pointing"),
  prompt: z.string().min(1).max(200),
});

const aiCompatibilityCardBase = aiStructuredCardBase.extend({
  type: z.literal("compatibility"),
  prompt: z.string().min(1).max(200),
});

/** answerMode 为 choice 时必须带 2-4 个选项，其余模式不要求。 */
export const aiCompatibilityCardSchema = z.union([
  aiCompatibilityCardBase.extend({ answerMode: z.literal("choice"), options: z.array(z.string().min(1).max(80)).min(2).max(4) }),
  aiCompatibilityCardBase.extend({ answerMode: z.enum(["open", "binary"]).default("open") }),
]);

export const aiStructuredCardSchema = z.union([aiWouldYouRatherCardSchema, aiPointingCardSchema, aiCompatibilityCardSchema]);

/**
 * 单张 AI 卡：接受 V1.0 通用卡或新玩法结构化卡，统一归一化成可入库的 GameCard，
 * 让下游 renderer 只面对一种卡结构（content），V1.0 四包行为不变。
 */
export const aiDeckCardSchema = z.union([aiStructuredCardSchema, aiGameCardSchema]).transform((card) => normalizeAICard(card as unknown as Record<string, unknown>));

export const aiDeckResponseSchema = z.object({
  cards: z.array(aiDeckCardSchema),
  meta: z.object({ generatedCount: z.number().int().nonnegative(), provider: z.string() }).optional(),
});

export type AIDeckResponse = z.infer<typeof aiDeckResponseSchema>;
