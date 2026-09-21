import { z } from "zod";
import { intensitySchema, type GamePackDefinition } from "@/lib/domain/schemas";

/** 二选一题卡契约（Plan 8.1）：A / VS / B 两个选项，尺度与标签继承 Session。 */
export const wouldYouRatherCardSchema = z.object({
  type: z.literal("would-you-rather"),
  optionA: z.string().min(1).max(120),
  optionB: z.string().min(1).max(120),
  intensity: intensitySchema,
  tags: z.array(z.string().max(30)).default([]),
});
export type WouldYouRatherCard = z.infer<typeof wouldYouRatherCardSchema>;

export const wouldYouRatherPack: GamePackDefinition = {
  id: "would-you-rather", name: "二选一", icon: "spark", enabledByDefault: true,
  mixable: true, minPlayers: 2, supportedCardTypes: ["would-you-rather"], weight: 1, source: "builtin",
  capability: {
    requiresAIContent: true, minPlayers: 2, supportsMixedMode: true,
    supportsLocalSeed: true, renderer: "binary-choice",
  },
};
