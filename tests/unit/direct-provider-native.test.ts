import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 自包含直连的「原生传输」（Change B 返工）：
 * WebView 内优先走 Capacitor 原生 HTTP 绕过 CORS；不可用才回退 fetch。
 * 安全约束与 fetch 路径一致：Key 只进 Authorization 头（不进 URL/正文），
 * 禁止跨主机重定向（禁用自动跳转 + 手动同源校验），https 公网校验不变。
 */

const cap = vi.hoisted(() => ({ isNativePlatform: vi.fn(() => true) }));
const http = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@capacitor/core", () => ({ Capacitor: cap, CapacitorHttp: http }));

import { directChatCompletion, directErrorCode, isNativeHttpAvailable, testDirectConnection } from "@/lib/ai/direct-provider";
import type { AIProviderProfile } from "@/lib/ai/provider";

const KEY = "sk-native-transport-must-not-leak-999";
const deepseek = {
  id: "deepseek-official", type: "deepseek-official", name: "DeepSeek 官方", baseUrl: "https://api.deepseek.com", modelId: "deepseek-chat",
  protocol: "openai-chat-completions", isDefault: true, experimental: false, autoFallback: false, enabled: true, updatedAt: "x",
} as AIProviderProfile;
const opencode = {
  ...deepseek, id: "opencode-go", type: "opencode-go", name: "OpenCode Go", baseUrl: "https://opencode.ai/zen/go/v1",
  modelId: "deepseek-v4.1-flash", experimental: true, enabled: true,
} as AIProviderProfile;

const chat = { profile: deepseek, apiKey: KEY, messages: [{ role: "user" as const, content: "hi" }], maxTokens: 32 };

const okNative = (overrides: Record<string, unknown> = {}) => ({
  status: 200, headers: {}, url: "https://api.deepseek.com/chat/completions",
  data: { choices: [{ message: { content: '{"ok":true}' } }] }, ...overrides,
});
const lastNativeCall = () => http.request.mock.calls.at(-1)![0] as { url: string; method: string; headers: Record<string, string>; data: string; disableRedirects: boolean; connectTimeout: number; readTimeout: number };

beforeEach(() => {
  cap.isNativePlatform.mockReturnValue(true);
  http.request.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("原生传输可用性判定", () => {
  it("原生平台 + 插件可调用 → 可用；网页/未原生 → 不可用", () => {
    expect(isNativeHttpAvailable()).toBe(true);
    cap.isNativePlatform.mockReturnValue(false);
    expect(isNativeHttpAvailable()).toBe(false);
  });

  it("原生平台但 request 不可用 → 回退判定为不可用", () => {
    const original = http.request;
    try {
      (http as { request: unknown }).request = undefined;
      expect(isNativeHttpAvailable()).toBe(false);
    } finally {
      (http as { request: unknown }).request = original;
    }
  });
});

describe("原生直连一次 chat/completions（Key 只在请求头）", () => {
  it("走 CapacitorHttp 而非 fetch，Key 不进 URL/正文，禁止自动跳转", async () => {
    http.request.mockResolvedValue(okNative());
    const fetchMock = vi.fn(async () => { throw new Error("fetch 不应被调用"); });
    vi.stubGlobal("fetch", fetchMock);

    const result = await directChatCompletion({ ...chat, temperature: 0, sessionId: "s1" });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ choices: expect.any(Array) });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(http.request).toHaveBeenCalledTimes(1);
    const call = lastNativeCall();
    expect(call.url).toBe("https://api.deepseek.com/chat/completions");
    expect(call.url).not.toContain(KEY);
    expect(call.method).toBe("POST");
    expect(call.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(call.data).not.toContain(KEY);
    expect(call.data).toContain("deepseek-chat");
    expect(call.disableRedirects).toBe(true);
    expect(call.connectTimeout).toBe(15_000);
    expect(call.readTimeout).toBe(15_000);
  });

  it("原生直连仍走 https 公网校验：http/私网地址在发请求前就被拦", async () => {
    for (const baseUrl of ["http://api.deepseek.com", "https://127.0.0.1"]) {
      const profile = { ...deepseek, baseUrl } as AIProviderProfile;
      await expect(directChatCompletion({ ...chat, profile })).rejects.toThrow(/provider-(url|host)-/);
    }
    expect(http.request).not.toHaveBeenCalled();
  });

  it("原生直连仍受预设地址锁定约束（跨主机预设直接拒绝）", async () => {
    const evil = { ...deepseek, baseUrl: "https://evil.example.com" } as AIProviderProfile;
    await expect(directChatCompletion({ ...chat, profile: evil })).rejects.toThrow("provider-preset-url-mismatch");
    expect(http.request).not.toHaveBeenCalled();
  });

  it("上游非 2xx 原样返回状态码，由调用方分类", async () => {
    http.request.mockResolvedValue(okNative({ status: 401, data: { error: "bad key" } }));
    await expect(directChatCompletion(chat)).resolves.toMatchObject({ status: 401 });
  });

  it("响应正文是字符串（非 json content-type）时按 JSON 解析", async () => {
    http.request.mockResolvedValue(okNative({ data: '{"choices":[{"message":{"content":"{}"}}]}' }));
    await expect(directChatCompletion(chat)).resolves.toMatchObject({ status: 200, body: { choices: [expect.anything()] } });
  });
});

describe("原生重定向安全（禁止跨主机带走 Key）", () => {
  it("响应落到其它主机 → 判失败（URL_REJECTED）", async () => {
    http.request.mockResolvedValue(okNative({ url: "https://evil.example.com/chat/completions" }));
    try {
      await directChatCompletion(chat);
      throw new Error("应该抛错");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      expect(message).toBe("provider-redirect-cross-host");
      expect(message).not.toContain(KEY);
      expect(directErrorCode(message)).toBe("URL_REJECTED");
    }
  });

  it("上游返回 3xx → 判失败（不允许跟随跳转）", async () => {
    http.request.mockResolvedValue(okNative({ status: 302, data: {} }));
    await expect(directChatCompletion(chat)).rejects.toThrow("provider-redirect-forbidden");
  });
});

describe("原生失败与超时映射", () => {
  it("原生网络失败抛 provider-network-error，错误信息不含 Key", async () => {
    http.request.mockRejectedValue(new Error("net::ERR_NAME_NOT_RESOLVED"));
    try {
      await directChatCompletion(chat);
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
    http.request.mockImplementation(() => new Promise(() => {}));
    const promise = directChatCompletion(chat);
    const assertion = expect(promise).rejects.toThrow("provider-timeout");
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });

  it("设置页测试连接：原生网络失败回 NETWORK_ERROR", async () => {
    http.request.mockRejectedValue(new Error("blocked"));
    await expect(testDirectConnection(deepseek, KEY, "settings-p")).resolves.toEqual({ ok: false, code: "NETWORK_ERROR" });
  });
});

describe("回退分支：非原生平台仍走 fetch", () => {
  it("网页/非原生环境不调用 CapacitorHttp，只用 fetch", async () => {
    cap.isNativePlatform.mockReturnValue(false);
    const fetchMock = vi.fn(async () => ({ status: 200, json: async () => ({ choices: [{ message: { content: "{}" } }] }) }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await directChatCompletion(chat);

    expect(result.status).toBe(200);
    expect(http.request).not.toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { redirect: string; headers: Record<string, string>; body: string }];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(init.redirect).toBe("error");
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(init.body).not.toContain(KEY);
  });

  it("OpenCode 预设同样优先原生，且带会话头", async () => {
    http.request.mockResolvedValue(okNative({ url: "https://opencode.ai/zen/go/v1/chat/completions" }));
    await directChatCompletion({ ...chat, profile: opencode, sessionId: "sess-oc" });
    const call = lastNativeCall();
    expect(call.url).toBe("https://opencode.ai/zen/go/v1/chat/completions");
    expect(call.headers["x-opencode-session"]).toBe("sess-oc");
    expect(call.url).not.toContain(KEY);
  });
});
