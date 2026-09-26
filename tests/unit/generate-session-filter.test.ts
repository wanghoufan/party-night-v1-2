/**
 * 服务端雷卡过滤 + 补齐重试（Change C）· route.ts 单测（mock provider，不发真实请求）
 * 口径：filterCards 全量口径与 App buildPlayableDeck（lib/ai/generate-deck.ts）完全一致。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/generate-session/route";
import { callProvider } from "@/lib/ai/upstream";

vi.mock("@/lib/ai/upstream", () => ({
  callProvider: vi.fn(),
  extractMessageContent: (body: unknown) => body as string,
}));

const callProviderMock = vi.mocked(callProvider);

const profile = {
  id: "test-provider",
  type: "deepseek-official" as const,
  name: "测试通道",
  baseUrl: "https://api.deepseek.com",
  modelId: "deepseek-flash",
  protocol: "openai-chat-completions" as const,
  isDefault: true,
  experimental: false,
  autoFallback: false,
  enabled: true,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const requestBody = (targetCardCount = 10) => ({
  profile,
  sessionConfig: {
    players: [
      { id: "p1", displayName: "嘉宾1", active: true, createdAt: "x", lastUsedAt: "x" },
      { id: "p2", displayName: "嘉宾2", active: true, createdAt: "x", lastUsedAt: "x" },
    ],
    relationship: "朋友",
    vibes: ["欢乐"],
    intensity: 5,
    boundaries: {
      noPhysicalContact: true, noAlcoholPenalty: false, noExPartners: false, noSexualHistory: false,
      noMoneyIncome: false, noPhonePrivacy: false, noPublicPosting: false, noStrangerContact: false,
      noPhotoVideo: false, noSocialAccounts: false, customText: "",
    },
    enabledPackIds: ["truth-dare"],
    mode: "single" as const,
  },
  targetCardCount,
  sessionId: "test-session",
});

const card = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, packId: "truth-dare", type: "truth", content: `安全题目${id}`, instruction: "如实回答",
  intensity: 3, tags: [], boundaryTags: [] as string[], minPlayers: 2, participantMode: "single", source: "ai",
  ...overrides,
});

const mockResponse = (payload: unknown) => ({ status: 200, body: JSON.stringify(payload) });

const post = async (targetCardCount = 10) =>
  POST(new Request("http://localhost/api/generate-session", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-key" },
    body: JSON.stringify(requestBody(targetCardCount)),
  }));

beforeEach(() => {
  callProviderMock.mockReset();
});

describe("generate-session 服务端雷卡过滤", () => {
  it("①雷卡被滤：boundaryTags 命中已开雷区 + 红线卡的卡不出现在响应里，meta.filteredCount 如实", async () => {
    const boundaryCard = card("bd-1", { content: "给大家一个大大的拥抱", boundaryTags: ["physical-contact"] });
    const redlineCard = card("rl-1", { content: "输的人被强迫灌酒一杯" });
    // 12 张进、2 张被滤、kept=10=target → 不触发补齐重试（retryCount=0 口径）
    const cleanCards = Array.from({ length: 10 }, (_, i) => card(`ok-${i + 1}`));
    callProviderMock.mockResolvedValueOnce(mockResponse({
      cards: [...cleanCards, boundaryCard, redlineCard],
      meta: { generatedCount: 12, provider: "deepseek" },
    }));

    const response = await post();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.cards).toHaveLength(10);
    expect(body.cards.map((item: { id: string }) => item.id)).not.toContain("bd-1");
    expect(body.cards.map((item: { id: string }) => item.id)).not.toContain("rl-1");
    expect(JSON.stringify(body)).not.toContain("强迫灌酒");
    expect(body.meta.filteredCount).toBe(2);
    expect(body.meta.retryCount).toBe(0);
    expect(callProviderMock).toHaveBeenCalledTimes(1);
    expect(body.generationSource).toBe("ai");
  });

  it("②首跑滤后不足→触发 1 次重试补齐，按 id 去重合并到 targetCardCount", async () => {
    const blocked = card("bd-1", { content: "直接吻一下左边的人", boundaryTags: ["physical-contact"] });
    const cleanCards = Array.from({ length: 9 }, (_, i) => card(`ok-${i + 1}`));
    callProviderMock
      .mockResolvedValueOnce(mockResponse({ cards: [...cleanCards, blocked], meta: { generatedCount: 10, provider: "deepseek" } }))
      .mockResolvedValueOnce(mockResponse({
        // 重试批次：1 张与首跑重复 id（应被去重掉）+ 1 张新卡（补齐到 10）
        cards: [card("ok-1", { content: "安全题目ok-1的另一种问法" }), card("ok-10")],
        meta: { generatedCount: 2, provider: "deepseek" },
      }));

    const response = await post();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(callProviderMock).toHaveBeenCalledTimes(2);
    // 重试 prompt 必须告知被剔除数量
    const retryPrompt = (callProviderMock.mock.calls[1]![2] as { messages: { content: string }[] }).messages[1]!.content;
    expect(retryPrompt).toContain("1 张卡因命中已开启雷区或安全红线被剔除");
    expect(body.cards).toHaveLength(10);
    expect(body.cards.filter((item: { id: string }) => item.id === "ok-1")).toHaveLength(1);
    expect(body.meta.filteredCount).toBe(1);
    expect(body.meta.retryCount).toBe(1);
    expect(body.generationSource).toBe("ai");
  });

  it("③重试后仍不足→如实返回已得卡，meta.filteredCount/retryCount 如实记录", async () => {
    const cleanCards = Array.from({ length: 3 }, (_, i) => card(`ok-${i + 1}`));
    callProviderMock
      .mockResolvedValueOnce(mockResponse({ cards: cleanCards, meta: { generatedCount: 3, provider: "deepseek" } }))
      .mockResolvedValueOnce(mockResponse({
        // 重试批次全军覆没：唯一一张卡也命中雷区
        cards: [card("bd-2", { content: "互相按摩肩膀五分钟", boundaryTags: ["physical-contact"] })],
        meta: { generatedCount: 1, provider: "deepseek" },
      }));

    const response = await post();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(callProviderMock).toHaveBeenCalledTimes(2);
    expect(body.cards).toHaveLength(3);
    expect(body.cards.map((item: { id: string }) => item.id)).toEqual(["ok-1", "ok-2", "ok-3"]);
    // 首跑 3 张全干净（filteredCount 0）+ 重试 1 张被滤（+1）→ 共 1
    expect(body.meta.filteredCount).toBe(1);
    expect(body.meta.retryCount).toBe(1);
    expect(body.generationSource).toBe("ai");
  });

  it("④首跑滤1张→重试合并后超过目标数→响应恰好在 targetCardCount，meta.generatedCount 如实", async () => {
    const blocked = card("bd-1", { content: "直接吻一下左边的人", boundaryTags: ["physical-contact"] });
    const cleanCards = Array.from({ length: 9 }, (_, i) => card(`ok-${i + 1}`));
    callProviderMock
      .mockResolvedValueOnce(mockResponse({ cards: [...cleanCards, blocked], meta: { generatedCount: 10, provider: "deepseek" } }))
      .mockResolvedValueOnce(mockResponse({
        // 重试批次全部新卡：合并后 9 + 5 = 14 张 > 10，必须截到 10
        cards: Array.from({ length: 5 }, (_, i) => card(`new-${i + 1}`)),
        meta: { generatedCount: 5, provider: "deepseek" },
      }));

    const response = await post();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(callProviderMock).toHaveBeenCalledTimes(2);
    expect(body.cards).toHaveLength(10);
    expect(body.cards.map((item: { id: string }) => item.id)).toEqual(["ok-1", "ok-2", "ok-3", "ok-4", "ok-5", "ok-6", "ok-7", "ok-8", "ok-9", "new-1"]);
    // meta.generatedCount 必须是最终 kept 数量，不是首跑 meta 里的旧值
    expect(body.meta.generatedCount).toBe(10);
    expect(body.meta.filteredCount).toBe(1);
    expect(body.meta.retryCount).toBe(1);
    expect(body.generationSource).toBe("ai");
  });
});
