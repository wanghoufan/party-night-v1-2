import { z } from "zod";
import { intensitySchema, type GamePackDefinition } from "@/lib/domain/schemas";

/** 指人游戏题卡契约（Plan 8.2）：一句直接指令；倒计时与结果统计属 UI 层。 */
export const pointingCardSchema = z.object({
  type: z.literal("pointing"),
  prompt: z.string().min(1).max(200),
  intensity: intensitySchema,
  tags: z.array(z.string().max(30)).default([]),
});
export type PointingCard = z.infer<typeof pointingCardSchema>;

export const pointingGamePack: GamePackDefinition = {
  id: "pointing-game", name: "指人游戏", icon: "users", enabledByDefault: true,
  mixable: true, minPlayers: 3, supportedCardTypes: ["pointing"], weight: 1, source: "builtin",
  capability: {
    requiresAIContent: true, minPlayers: 3, supportsMixedMode: true,
    supportsLocalSeed: true, renderer: "pointing",
  },
};
