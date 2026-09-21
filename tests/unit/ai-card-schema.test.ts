import { describe, expect, it } from "vitest";
import { aiDeckResponseSchema } from "@/lib/ai/card-schema";

const validCard = { id: "ai-1", packId: "truth-dare", type: "truth", content: "说一件今天的开心事", intensity: 1, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "all", source: "ai" };

const sarebbe = { id: "ai-wyr-1", packId: "would-you-rather", type: "would-you-rather", optionA: "凌晨三点吃火锅", optionB: "清晨六点看日出", intensity: 2, tags: ["funny"] };
const pointing = { id: "ai-point-1", packId: "pointing-game", type: "pointing", prompt: "指一个你觉得今晚最有梗的人。", intensity: 2 };
const compatibility = { id: "ai-compat-1", packId: "compatibility-test", type: "compatibility", prompt: "对方最讨厌的食物是什么？", answerMode: "open", intensity: 1 };

const parseCards = (cards: unknown[]) => aiDeckResponseSchema.parse({ cards }).cards;

describe("AI deck output schema", () => {
  it("接受结构化 cards 数组", () => expect(aiDeckResponseSchema.parse({ cards: [validCard] }).cards).toHaveLength(1));
  it.each([
    null,
    { cards: "not-an-array" },
    { cards: [{ ...validCard, intensity: 9 }] },
    { cards: [{ ...validCard, content: "" }] },
  ])("拒绝非法 payload %#", (payload) => expect(aiDeckResponseSchema.safeParse(payload).success).toBe(false));
});

describe("new AI card types", () => {
  it("keeps V1.0 content cards untouched", () => {
    expect(parseCards([validCard])[0]).toEqual(validCard);
  });

  it("turns a would-you-rather card into an A VS B playable card", () => {
    expect(parseCards([sarebbe])[0]).toMatchObject({
      id: "ai-wyr-1", packId: "would-you-rather", type: "would-you-rather",
      content: "凌晨三点吃火锅 VS 清晨六点看日出", participantMode: "all", minPlayers: 2,
      tags: ["funny"], source: "ai",
    });
  });

  it("normalizes pointing and compatibility cards onto the pack renderer contract", () => {
    const [point, compat] = parseCards([pointing, compatibility]);
    expect(point).toMatchObject({ type: "pointing", content: "指一个你觉得今晚最有梗的人。", participantMode: "all", minPlayers: 3, source: "ai" });
    expect(compat).toMatchObject({ type: "compatibility", content: "对方最讨厌的食物是什么？", participantMode: "pair", minPlayers: 2, source: "ai" });
    expect(point.instruction).toBeTruthy();
    expect(compat.instruction).toBeTruthy();
  });

  it("fills the pack minPlayers even when the model under-reports it", () => {
    expect(parseCards([{ ...pointing, minPlayers: 2 }])[0].minPlayers).toBe(3);
  });

  it("accepts a compatibility choice card with options", () => {
    const card = { ...compatibility, answerMode: "choice", options: ["一样", "不一样"] };
    expect(parseCards([card])[0].content).toBe("对方最讨厌的食物是什么？");
  });

  it("rejects structured cards missing their required fields", () => {
    expect(aiDeckResponseSchema.safeParse({ cards: [{ ...sarebbe, optionB: undefined }] }).success).toBe(false);
    expect(aiDeckResponseSchema.safeParse({ cards: [{ ...sarebbe, optionA: "" }] }).success).toBe(false);
    expect(aiDeckResponseSchema.safeParse({ cards: [{ ...pointing, prompt: undefined }] }).success).toBe(false);
    expect(aiDeckResponseSchema.safeParse({ cards: [{ ...compatibility, prompt: "" }] }).success).toBe(false);
    expect(aiDeckResponseSchema.safeParse({ cards: [{ ...compatibility, answerMode: "choice" }] }).success).toBe(false);
    expect(aiDeckResponseSchema.safeParse({ cards: [{ ...compatibility, answerMode: "choice", options: ["只有一个"] }] }).success).toBe(false);
  });

  it("caps option and prompt length so external content cannot blow up the card", () => {
    expect(aiDeckResponseSchema.safeParse({ cards: [{ ...sarebbe, optionA: "长".repeat(121) }] }).success).toBe(false);
    expect(aiDeckResponseSchema.safeParse({ cards: [{ ...pointing, prompt: "长".repeat(201) }] }).success).toBe(false);
  });
});
