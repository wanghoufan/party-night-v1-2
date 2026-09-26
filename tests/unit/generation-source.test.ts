import { describe, expect, it } from "vitest";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import { GENERATION_FALLBACK_NOTICE, LOCAL_DECK_NOTICE, deckGenerationSource, generationFallbackNoticeText, isAiGenerationSource, shouldAnnounceGenerationFallback } from "@/lib/domain/generation-source";
import { providerErrorMessage } from "@/lib/ai/provider-errors";
import { gameSessionSchema, type GameCard, type SessionConfig } from "@/lib/domain/schemas";
import { activateSession, createSession } from "@/lib/engine/session-engine";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import { sessionRepository } from "@/lib/storage/session-repository";

/**
 * Change B 补充：整局生成来源 `generationSource`（ai | local-fallback）。
 * 判定只看最终牌堆是否采用 AI 卡；Session 落库、Matrix 判定共用同一口径（禁双实现）。
 */
const config: SessionConfig = {
  players: ["a", "b", "c"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" })),
  relationship: "friends", vibes: ["funny"], intensity: 3, boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ["truth-dare", "would-you-rather"], mode: "mixed",
};

const card = (source: GameCard["source"], id: string): GameCard => ({
  id, packId: "would-you-rather", type: "would-you-rather", content: "A VS B", intensity: 2,
  tags: [], boundaryTags: [], minPlayers: 2, participantMode: "all", source,
});

describe("deckGenerationSource：只有采用 AI 卡才算 ai", () => {
  it("空牌堆 / 全本地 / 纯自定义一律 local-fallback", () => {
    expect(deckGenerationSource([])).toBe("local-fallback");
    expect(deckGenerationSource(BUILTIN_SEED_CARDS)).toBe("local-fallback");
    expect(deckGenerationSource([card("custom", "c1"), card("builtin", "b1")])).toBe("local-fallback");
  });

  it("混入任一 AI 卡即为 ai；custom 是中性来源，不改变判定", () => {
    expect(deckGenerationSource([card("custom", "c1"), card("ai", "a1"), card("builtin", "b1")])).toBe("ai");
    expect(deckGenerationSource([card("builtin", "b1"), card("ai", "a1")])).toBe("ai");
  });

  it("isAiGenerationSource：只有 ai 为真（缺省/未知值都不算 AI PASS）", () => {
    expect(isAiGenerationSource("ai")).toBe(true);
    for (const value of ["local-fallback", "provider", "fallback", "", null, undefined, 1, {}]) {
      expect(isAiGenerationSource(value), String(value)).toBe(false);
    }
  });
});

describe("generationSource 落库", () => {
  it("activateSession 按最终牌堆写入来源，且整条 Session 过 schema", () => {
    const ai = activateSession(createSession(config), [card("builtin", "b1"), card("ai", "a1")]);
    expect(ai.generationSource).toBe("ai");
    expect(ai.status).toBe("active");
    expect(gameSessionSchema.parse(ai).generationSource).toBe("ai");

    const local = activateSession(createSession(config), BUILTIN_SEED_CARDS);
    expect(local.generationSource).toBe("local-fallback");
  });

  it("createSession 带牌堆即有来源；无牌堆（generating）允许缺省", () => {
    expect(createSession(config, BUILTIN_SEED_CARDS).generationSource).toBe("local-fallback");
    expect(createSession(config).generationSource).toBeUndefined();
  });

  it("仓库往返保留 generationSource，且只存枚举、不夹带 Provider/Key/Prompt", async () => {
    const session = activateSession(createSession(config), [card("ai", "a1")]);
    await sessionRepository.save(session);
    const stored = await sessionRepository.get(session.id);
    expect(stored?.generationSource).toBe("ai");
    const serialized = JSON.stringify(stored);
    expect(serialized).not.toContain("deepseek");
    expect(serialized).not.toContain("sk-");
    expect(serialized).not.toContain("Bearer");
    await sessionRepository.delete(session.id);
  });
});

describe("Matrix 判定契约：以 generationSource 字段为准", () => {
  /** 模拟 `/api/generate-session` 与 harness 读取的形状：字段由服务端按最终牌堆判定后下发。 */
  const responseBody = (cards: GameCard[]) => ({ cards, generationSource: deckGenerationSource(cards) });

  it("AI 牌堆 → Matrix 判 ai（AI PASS）；本地回退牌堆 → 判非 ai", () => {
    expect(isAiGenerationSource(responseBody([card("ai", "a1")]).generationSource)).toBe(true);
    expect(isAiGenerationSource(responseBody(BUILTIN_SEED_CARDS).generationSource)).toBe(false);
  });

  it("字段缺失（旧记录）不算 AI PASS", () => {
    expect(isAiGenerationSource(({} as { generationSource?: unknown }).generationSource)).toBe(false);
  });
});

/**
 * Change A 小改：局内一次性回退提示（game 页）。
 * 触发只看「来源是否落到 local-fallback」，且每局最多一次；文案不得夹带任何 Key/凭据。
 */
describe("回退提示触发条件：每局最多一次", () => {
  it("ai → local-fallback 过渡触发", () => {
    expect(shouldAnnounceGenerationFallback({ previousSource: "ai", source: "local-fallback", announced: false })).toBe(true);
  });

  it("全 ai 不触发（含开局即 ai）", () => {
    expect(shouldAnnounceGenerationFallback({ source: "ai", announced: false })).toBe(false);
    expect(shouldAnnounceGenerationFallback({ previousSource: "ai", source: "ai", announced: false })).toBe(false);
  });

  it("全本地开局（开局即 local-fallback）触发一次，重复判定不再触发", () => {
    expect(shouldAnnounceGenerationFallback({ source: "local-fallback", announced: false })).toBe(true);
    expect(shouldAnnounceGenerationFallback({ previousSource: "local-fallback", source: "local-fallback", announced: false })).toBe(false);
    expect(shouldAnnounceGenerationFallback({ previousSource: "ai", source: "local-fallback", announced: true })).toBe(false);
    expect(shouldAnnounceGenerationFallback({ source: "local-fallback", announced: true })).toBe(false);
  });

  it("来源字段缺省（恢复中）不触发", () => {
    expect(shouldAnnounceGenerationFallback({ announced: false })).toBe(false);
    expect(shouldAnnounceGenerationFallback({ previousSource: "ai", announced: false })).toBe(false);
  });
});

describe("回退提示文案：有原因说原因，无原因不谎报 AI 失败，且不夹带凭据", () => {
  it("AI 失败：主句 + 一句 provider 原因（provider 名动态化）", () => {
    const text = generationFallbackNoticeText(providerErrorMessage("NETWORK_ERROR", "OpenCode Go"));
    expect(text.startsWith(GENERATION_FALLBACK_NOTICE)).toBe(true);
    expect(text).toContain("OpenCode Go");
    expect(text).not.toContain("sk-");
    expect(text).not.toContain("Bearer");
  });

  it("无失败记录（本局本来就走本地题库）：中性文案，不谎报 AI 失败", () => {
    expect(generationFallbackNoticeText()).toBe(LOCAL_DECK_NOTICE);
    expect(generationFallbackNoticeText("   ")).toBe(LOCAL_DECK_NOTICE);
    expect(generationFallbackNoticeText()).not.toContain("AI 连接失败");
  });
});

describe("generationFallback 落库：只存 provider 名与错误码，不含任何凭据", () => {
  it("过 schema 且持久化往返不夹带 Key/Token", async () => {
    const session = {
      ...activateSession(createSession(config), BUILTIN_SEED_CARDS),
      generationFallback: { providerName: "DeepSeek", code: "NETWORK_ERROR", at: "2026-09-26T00:00:00.000Z" },
    };
    const parsed = gameSessionSchema.parse(session);
    expect(parsed.generationFallback).toEqual({ providerName: "DeepSeek", code: "NETWORK_ERROR", at: "2026-09-26T00:00:00.000Z" });
    await sessionRepository.save(parsed);
    const stored = await sessionRepository.get(parsed.id);
    const serialized = JSON.stringify(stored);
    expect(serialized).not.toContain("sk-");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("Authorization");
    await sessionRepository.delete(parsed.id);
  });
});
