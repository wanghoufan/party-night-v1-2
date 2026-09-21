import { describe, expect, it } from "vitest";
import { aiDeckResponseSchema } from "@/lib/ai/card-schema";

const validCard = { id: "ai-1", packId: "truth-dare", type: "truth", content: "说一件今天的开心事", intensity: 1, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "all", source: "ai" };

describe("AI deck output schema", () => {
  it("接受结构化 cards 数组", () => expect(aiDeckResponseSchema.parse({ cards: [validCard] }).cards).toHaveLength(1));
  it.each([
    null,
    { cards: "not-an-array" },
    { cards: [{ ...validCard, intensity: 9 }] },
    { cards: [{ ...validCard, content: "" }] },
  ])("拒绝非法 payload %#", (payload) => expect(aiDeckResponseSchema.safeParse(payload).success).toBe(false));
});
