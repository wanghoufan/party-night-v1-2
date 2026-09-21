import { gameCardSchema } from "@/lib/domain/schemas";
import { z } from "zod";

export const aiGameCardSchema = gameCardSchema.omit({ source: true }).extend({
  source: z.literal("ai").default("ai"),
});

export const aiDeckResponseSchema = z.object({
  cards: z.array(aiGameCardSchema),
  meta: z.object({ generatedCount: z.number().int().nonnegative(), provider: z.string() }).optional(),
});

export type AIDeckResponse = z.infer<typeof aiDeckResponseSchema>;
