import { afterEach, describe, expect, it, vi } from "vitest";
import deckFixture from "../fixtures/ai-deck-v1.1-new-packs.json";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { GameCard, SessionConfig } from "@/lib/domain/schemas";
import { DECK_BATCH_CARD_TARGET, DECK_BATCH_RETRY_DELAY_MS, DECK_BATCH_TIMEOUT_MS, DIRECT_TIMEOUT_MS, directChatCompletion, directErrorCode, generateDeckDirect, resolveDirectEndpoint, testDirectConnection } from "@/lib/ai/direct-provider";
import { refillPackInBackground, requestDeckWithFallback, requestDeckWithFallbackResult } from "@/lib/ai/generate-deck";
import type { AIProviderProfile } from "@/lib/ai/provider";

/**
 * 自包含直连模式（Change A）：
 * 没有 /api 代理时，前端直接请求 Provider 的 chat/completions；Key 只在 Authorization 头，
 * 地址只允许 https 公网；失败抛错由调用方回退本地 seed，保证不断游。
 */
const KEY = "sk-direct-mode-must-not-leak-123";
const ALL_PACK_IDS = ["truth-dare", "most-likely", "never-have", "ai-improv", "would-you-rather", "pointing-game", "compatibility-test", "spin-bottle"];

const config: SessionConfig = {
  players: ["a", "b", "c", "d"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" })),
  relationship: "friends", vibes: ["wild"], intensity: 4, boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ALL_PACK_IDS, mode: "mixed",
};

const profile = {
  id: "p1", type: "deepseek-official", name: "DeepSeek", baseUrl: "https://api.deepseek.com", modelId: "deepseek-chat",
  protocol: "openai-chat-completions", isDefault: true, experimental: false, autoFallback: false, enabled: true, updatedAt: "x",
} as AIProviderProfile;

const request = { profile, apiKey: KEY, sessionConfig: config, sessionId: "session-1" };

const okResponse = () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(deckFixture) } }] }) });
const fetchCalls = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls as unknown as Array<[string, { method: string; cache: string; redirect: string; headers: Record<string, string>; body: string }]>;
const aiCard = (id: string, packId: string): GameCard => ({
  id, packId, type: packId, content: "旧题", intensity: 2, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "all", source: "ai",
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("直连地址校验（https 公网，禁本机/私网/凭据）", () => {
  it("拒绝非 https 地址", () => {
    expect(() => resolveDirectEndpoint("http://api.deepseek.com")).toThrow("provider-url-https-required");
  });
  it("拒绝本机、回环与私网字面量", () => {
    for (const baseUrl of ["https://localhost:11434", "https://127.0.0.1", "https://192.168.1.5", "https://169.254.1.1", "https://[::1]"]) {
      expect(() => resolveDirectEndpoint(baseUrl), baseUrl).toThrow("provider-host-forbidden");
    }
  });
  it("拒绝 URL 内嵌凭据与跨主机预设地址", async () => {
    expect(() => resolveDirectEndpoint("https://user:pass@api.deepseek.com")).toThrow("provider-url-credentials-forbidden");
    const evil = { ...profile, baseUrl: "https://evil.example.com" } as AIProviderProfile;
    await expect(directChatCompletion({ profile: evil, apiKey: KEY, messages: [{ role: "user", content: "hi" }], maxTokens: 8 })).rejects.toThrow("provider-preset-url-mismatch");
  });
});

describe("直连一次 chat/completions（Key 只在请求头）", () => {
  it("拼接 baseUrl/chat/completions，Key 不进 URL、不进正文、不进缓存", async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const result = await directChatCompletion({ profile, apiKey: KEY, messages: [{ role: "user", content: "hi" }], maxTokens: 32, temperature: 0, sessionId: "s1" });

    expect(result.status).toBe(200);
    const [url, init] = fetchCalls(fetchMock)[0]!;
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(url).not.toContain(KEY);
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(init.redirect).toBe("error");
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(init.body).not.toContain(KEY);
    expect(init.body).toContain("deepseek-chat");
  });

  it("上游非 2xx 原样返回状态码，由调用方分类", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 401, json: async () => ({ error: "bad key" }) })));
    await expect(directChatCompletion({ profile, apiKey: KEY, messages: [{ role: "user", content: "hi" }], maxTokens: 8 })).resolves.toMatchObject({ status: 401 });
  });

  it("网络失败抛 provider-network-error（错误信息不含 Key）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    try {
      await directChatCompletion({ profile, apiKey: KEY, messages: [{ role: "user", content: "hi" }], maxTokens: 8 });
      throw new Error("应该抛错");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      expect(message).toBe("provider-network-error");
      expect(message).not.toContain(KEY);
      expect(directErrorCode(message)).toBe("NETWORK_ERROR");
    }
  });

  it("15s 无响应主动超时并抛 provider-timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    })));
    const promise = directChatCompletion({ profile, apiKey: KEY, messages: [{ role: "user", content: "hi" }], maxTokens: 8 });
    const assertion = expect(promise).rejects.toThrow("provider-timeout");
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });
});

describe("设置页测试连接（自包含直连）", () => {
  it("成功时回 ok 与延迟", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse()));
    const result = await testDirectConnection(profile, KEY, "settings-p1");
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("鉴权失败时回 AUTH_FAILED", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 401, json: async () => ({}) })));
    await expect(testDirectConnection(profile, KEY, "settings-p1")).resolves.toEqual({ ok: false, code: "AUTH_FAILED" });
  });

  it("网络失败时回 NETWORK_ERROR", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(testDirectConnection(profile, KEY, "settings-p1")).resolves.toEqual({ ok: false, code: "NETWORK_ERROR" });
  });
});

describe("自包含生成：直连优先，失败回退本地 seed", () => {
  it("直连成功则用 AI 卡（不发 /api）", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_CONTAINED", "1");
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const deck = await requestDeckWithFallback(request);
    expect(deck.some((card) => card.id === "ai-wyr-1")).toBe(true);
    expect(fetchCalls(fetchMock)[0]![0]).toBe("https://api.deepseek.com/chat/completions");
  });

  it("直连报错则回退本地 seed，且从不打 /api（每批失败重试 1 次仍败）", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_CONTAINED", "1");
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    vi.stubGlobal("fetch", fetchMock);
    const promise = requestDeckWithFallback(request);
    await vi.advanceTimersByTimeAsync(10_000);
    const deck = await promise;
    expect(deck.length).toBeGreaterThanOrEqual(20);
    expect(deck.every((card) => card.source === "builtin")).toBe(true);
    expect(fetchCalls(fetchMock).every(([url]) => url !== "/api/generate-session")).toBe(true);
  });

  it("直连返回非法正文：4 批各重试 1 次仍失败后回退本地 seed", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_CONTAINED", "1");
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "不是 JSON" } }] }) }));
    vi.stubGlobal("fetch", fetchMock);
    const promise = requestDeckWithFallback(request);
    await vi.advanceTimersByTimeAsync(10_000);
    const deck = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(deck.every((card) => card.source === "builtin")).toBe(true);
  });

  it("直连超时则回退本地 seed（每批 45s×2 次尝试 + 1s 重试间隔，4 批 sequential 共 364s）", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_SELF_CONTAINED", "1");
    const fetchMock = vi.fn((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const promise = requestDeckWithFallback(request);
    await vi.advanceTimersByTimeAsync(364_000);
    const deck = await promise;
    expect(deck.length).toBeGreaterThanOrEqual(20);
    expect(deck.every((card) => card.source === "builtin")).toBe(true);
    // 重试发生：4 批 × (首次 + 重试 1 次) = 8 次
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it("服务器模式（非自包含）仍只走 /api，不发起直连", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_CONTAINED", "0");
    // 服务器模式的 /api/generate-session 直接返回已解析的牌堆（不是 chat-completion 包装）。
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => deckFixture }));
    vi.stubGlobal("fetch", fetchMock);
    const deck = await requestDeckWithFallback(request);
    expect(fetchCalls(fetchMock)[0]![0]).toBe("/api/generate-session");
    expect(deck.some((card) => card.id === "ai-wyr-1")).toBe(true);
  });
});

describe("自包含后台补题：与整局生成共用同一条直连链（Change B 补充）", () => {
  it("直连成功：只并入目标玩法的 AI 卡，且从不打 /api", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_CONTAINED", "1");
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const deck = await refillPackInBackground({ deck: [], profile, apiKey: KEY, sessionConfig: config, sessionId: "session-1", packId: "would-you-rather" });
    expect(fetchCalls(fetchMock)[0]![0]).toBe("https://api.deepseek.com/chat/completions");
    expect(deck.some((card) => card.id === "ai-wyr-1" && card.source === "ai")).toBe(true);
    expect(deck.every((card) => card.packId === "would-you-rather")).toBe(true);
    expect(fetchCalls(fetchMock).every(([url]) => url !== "/api/generate-session")).toBe(true);
  });

  it("直连失败：原样返回、不抛错、不掺入任何卡，也不打 /api", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_CONTAINED", "1");
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    vi.stubGlobal("fetch", fetchMock);
    const original = [aiCard("w1", "would-you-rather")];
    const promise = refillPackInBackground({ deck: original, profile, apiKey: KEY, sessionConfig: config, sessionId: "session-1", packId: "would-you-rather" });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(promise).resolves.toEqual(original);
    expect(fetchCalls(fetchMock).every(([url]) => url !== "/api/generate-session")).toBe(true);
  });

  it("服务器模式补题仍只走 /api，不发起直连", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_CONTAINED", "0");
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => deckFixture }));
    vi.stubGlobal("fetch", fetchMock);
    const deck = await refillPackInBackground({ deck: [], profile, apiKey: KEY, sessionConfig: config, sessionId: "session-1", packId: "would-you-rather" });
    expect(fetchCalls(fetchMock)[0]![0]).toBe("/api/generate-session");
    expect(deck.some((card) => card.id === "ai-wyr-1")).toBe(true);
  });
});

describe("Change A 小改：回退牌堆带回一句可展示的失败原因码", () => {
  it("直连成功：不带回退码", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_CONTAINED", "1");
    vi.stubGlobal("fetch", vi.fn(async () => okResponse()));
    const result = await requestDeckWithFallbackResult(request);
    expect(result.fallbackCode).toBeUndefined();
    expect(result.cards.some((card) => card.id === "ai-wyr-1")).toBe(true);
  });

  it("直连网络失败：回退码按同一张表归一为 NETWORK_ERROR", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_CONTAINED", "1");
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const promise = requestDeckWithFallbackResult(request);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;
    expect(result.cards.every((card) => card.source === "builtin")).toBe(true);
    expect(result.fallbackCode).toBe("NETWORK_ERROR");
  });

  it("直连超时：回退码归一为 TIMEOUT（每批 45s×2 次尝试 + 1s 重试间隔，4 批共 364s）", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_SELF_CONTAINED", "1");
    const fetchMock = vi.fn((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const promise = requestDeckWithFallbackResult(request);
    await vi.advanceTimersByTimeAsync(364_000);
    const result = await promise;
    expect(result.fallbackCode).toBe("TIMEOUT");
    // 重试发生：4 批 × (首次 + 重试 1 次) = 8 次
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it("服务器模式：上游错误码原样透传（不被误判成 REQUEST_FAILED）", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_CONTAINED", "0");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ code: "AUTH_FAILED" }) })));
    const result = await requestDeckWithFallbackResult(request);
    expect(result.fallbackCode).toBe("AUTH_FAILED");
  });

  it("结果版与旧签名行为一致：卡片与 requestDeckWithFallback 相同", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_CONTAINED", "0");
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => deckFixture }));
    vi.stubGlobal("fetch", fetchMock);
    const legacy = await requestDeckWithFallback(request);
    const result = await requestDeckWithFallbackResult(request);
    expect(result.cards.map((card) => card.id)).toEqual(legacy.map((card) => card.id));
  });
});

describe("Change C：整局生成分块（4 批 × 10 sequential，生成超时与测试超时分离）", () => {
  it("常量分离：测试 15s、生成单批 45s、每批 10 张、重试间隔 1s", () => {
    expect(DIRECT_TIMEOUT_MS).toBe(15_000);
    expect(DECK_BATCH_TIMEOUT_MS).toBe(45_000);
    expect(DECK_BATCH_CARD_TARGET).toBe(10);
    expect(DECK_BATCH_RETRY_DELAY_MS).toBe(1_000);
  });

  it("分块成功：4 批 sequential 各出 10 张并并入，牌堆含 AI 卡", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_CONTAINED", "1");
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const result = await requestDeckWithFallbackResult(request);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.fallbackCode).toBeUndefined();
    expect(result.partialCode).toBeUndefined();
    expect(result.cards.some((card) => card.id === "ai-wyr-1")).toBe(true);
    // 每批 prompt 只出 10 张（分块小请求，替代旧单次 12800-token 大请求）
    expect(JSON.parse(fetchCalls(fetchMock)[0]![1].body).messages[1].content).toContain("生成 10 张");
  });

  it("部分成功：首批成功、其余重试后仍失败，已成功批次保留且 partialCode 带回失败原因", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_CONTAINED", "1");
    vi.useFakeTimers();
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) return okResponse();
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    const progress: Array<{ doneBatches: number; totalBatches: number; cardsSoFar: number; lastError?: string }> = [];
    const promise = requestDeckWithFallbackResult({ ...request, onProgress: (p) => progress.push({ ...p }) });
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;
    // 首批 1 次成功；后 3 批各（首次 + 重试 1 次）= 7 次
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(result.cards.some((card) => card.id === "ai-wyr-1" && card.source === "ai")).toBe(true);
    expect(result.fallbackCode).toBeUndefined();
    expect(result.partialCode).toBe("NETWORK_ERROR");
    // 进度回调每批一次：首批成功 lastError 缺省，之后每批都带失败原因
    expect(progress.map((p) => p.doneBatches)).toEqual([1, 2, 3, 4]);
    expect(progress[0]!.cardsSoFar).toBeGreaterThan(0);
    expect(progress[0]!.lastError).toBeUndefined();
    expect(progress[3]!.lastError).toBe("provider-network-error");
  });

  it("全失败：4 批各重试 1 次全挂才回退本地 seed，fallbackCode 取首个失败原因", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_CONTAINED", "1");
    vi.useFakeTimers();
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      // 第 1 批首次与重试各抛一次网络错（call 1-2），该批最终原因 = provider-network-error →
      // 归一 NETWORK_ERROR；第 2-4 批（call 3-8）上游 401，也全挂才回退。
      if (call <= 2) throw new TypeError("Failed to fetch");
      return { ok: false, status: 401, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const progress: Array<{ doneBatches: number; totalBatches: number; cardsSoFar: number }> = [];
    const promise = requestDeckWithFallbackResult({ ...request, onProgress: (p) => progress.push({ ...p }) });
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;
    // 重试发生：4 批 × (首次 + 重试 1 次) = 8 次
    expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(result.cards.every((card) => card.source === "builtin")).toBe(true);
    expect(result.fallbackCode).toBe("NETWORK_ERROR");
    expect(result.partialCode).toBeUndefined();
    expect(progress.map((p) => p.cardsSoFar)).toEqual([0, 0, 0, 0]);
  });

  it("超时分离：生成在 15s 时仍在等（单批 45s），364s（4 批各 45s×2 次尝试 + 1s 重试间隔）后 4 批全超时才回退", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_SELF_CONTAINED", "1");
    const fetchMock = vi.fn((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const promise = requestDeckWithFallbackResult(request);
    await vi.advanceTimersByTimeAsync(15_000);
    let settled = false;
    void promise.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    // 4 批 × (45s×2 次尝试 + 1s 重试间隔) = 364s
    await vi.advanceTimersByTimeAsync(349_000);
    const result = await promise;
    expect(result.fallbackCode).toBe("TIMEOUT");
    // 重试发生：4 批 × (首次 + 重试 1 次) = 8 次
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it("超时分离：测试连接仍走 15s 小请求口径", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    })));
    const promise = testDirectConnection(profile, KEY, "settings-p1");
    const assertion = expect(promise).resolves.toMatchObject({ ok: false, code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });

  it("generateDeckDirect：全部批次失败抛首个错误，任一批成功即并入返回 batchErrors", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_CONTAINED", "1");
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const failing = generateDeckDirect(request);
    // 先挂 rejects 断言再推时间：批重试后 promise 会在 advance 期间 reject，后挂 handler 会被记成 unhandled rejection
    const assertion = expect(failing).rejects.toThrow("provider-network-error");
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;

    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      // 前 3 批首次与重试各失败一次（6 次），第 4 批首次即成功
      if (call <= 6) throw new TypeError("Failed to fetch");
      return okResponse();
    }));
    const succeeding = generateDeckDirect(request);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await succeeding;
    expect(result.batchErrors).toHaveLength(3);
    expect(result.batchErrors.every((code) => code === "provider-network-error")).toBe(true);
    const parsed = result.data as { cards: unknown[] };
    expect(parsed.cards.length).toBeGreaterThan(0);
  });
});

describe("Change C 修复：分块 maxTokens 对齐服务端口径 + 批失败重试 1 次", () => {
  it("分块 maxTokens 对齐服务端口径：10 卡批请求的 max_tokens=8192（8192 起步 + 640/卡）", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_CONTAINED", "1");
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    await generateDeckDirect(request);
    const payload = JSON.parse(fetchCalls(fetchMock)[0]![1].body) as { max_tokens: number };
    expect(payload.max_tokens).toBe(8192);
  });

  it("批失败重试：第 1 次返回截断 JSON、间隔 1s 重试成功 → 批成功且 batchErrors 为空", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_CONTAINED", "1");
    vi.useFakeTimers();
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      // 模拟 max_tokens 截断：content 是不完整 JSON（Unterminated string）
      if (call === 1) return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"cards":[{"id":"trunc' } }] }) };
      return okResponse();
    });
    vi.stubGlobal("fetch", fetchMock);
    const promise = generateDeckDirect({ ...request, targetCardCount: 10 });
    await vi.advanceTimersByTimeAsync(DECK_BATCH_RETRY_DELAY_MS);
    const result = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.batchErrors).toEqual([]);
    const parsed = result.data as { cards: unknown[] };
    expect(parsed.cards.length).toBeGreaterThan(0);
  });

  it("批失败重试耗尽：两批连续截断且重试仍截断 → batchErrors 记录、其余批继续、全部失败才抛", async () => {
    vi.stubEnv("NEXT_PUBLIC_SELF_CONTAINED", "1");
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"cards":[{"id":"trunc' } }] }) }));
    vi.stubGlobal("fetch", fetchMock);
    const promise = generateDeckDirect({ ...request, targetCardCount: 20 });
    // 先挂 rejects 断言再推时间（同上：避免 advance 期间 reject 被记成 unhandled rejection）
    const assertion = expect(promise).rejects.toThrow(/Unterminated string in JSON/);
    await vi.advanceTimersByTimeAsync(4 * DECK_BATCH_RETRY_DELAY_MS);
    // 第 1 批重试耗尽后第 2 批仍继续执行（其余批继续）；2 批全失败才抛
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
