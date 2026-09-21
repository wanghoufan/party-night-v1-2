import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { SessionConfig } from "@/lib/domain/schemas";
import { requestGeneratedDeck } from "@/lib/ai/generate-deck";
import type { AIProviderProfile } from "@/lib/ai/provider";
import { redactUnknown, safeErrorMessage } from "@/lib/ai/redaction";

const KEY = "sk-CredentialBoundaryMustNotLeak123";
const ROOT = process.cwd();

const config: SessionConfig = {
  players: ["a", "b"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" })),
  relationship: "friends", vibes: ["funny"], intensity: 3, boundaries: DEFAULT_BOUNDARIES,
  enabledPackIds: ["truth-dare", "would-you-rather"], mode: "mixed",
};

const profile = { id: "p1", type: "deepseek-official", name: "DeepSeek", baseUrl: "https://api.deepseek.com", modelId: "deepseek-chat", protocol: "openai-chat-completions", isDefault: true, experimental: false, autoFallback: true, enabled: true, updatedAt: "x" } as AIProviderProfile;

const tsFilesUnder = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { recursive: true, encoding: "utf8" }).filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".d.ts"));
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");

afterEach(() => vi.unstubAllGlobals());

describe("AI credential boundary", () => {
  it("sends the full key only in the Authorization header, never in the body, URL or cache", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ cards: [] }) }));
    vi.stubGlobal("fetch", fetchMock);
    await requestGeneratedDeck({ profile, apiKey: KEY, sessionConfig: config, sessionId: "s1" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { method: string; cache: string; headers: Record<string, string>; body: string }];
    expect(url).toBe("/api/generate-session");
    expect(url).not.toContain(KEY);
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(init.body).not.toContain(KEY);
  });

  it("keeps the AI adapter layer free of any second key store", () => {
    for (const file of tsFilesUnder("lib/ai")) {
      const source = read(join("lib", "ai", file));
      expect(source, `${file} must not touch secret storage`).not.toMatch(/aiSecrets|aiCryptoKeys|indexedDB|localStorage|sessionStorage/);
      expect(source, `${file} must not own a storage layer`).not.toContain('@/lib/storage');
    }
  });

  it("keeps exactly one secret store: the encrypted provider repository", () => {
    const writers = tsFilesUnder("lib").filter((file) => /db\.(put|delete)\(\s*"ai(Secrets|CryptoKeys)"/.test(read(join("lib", file)))).map((file) => join("lib", file).replaceAll("\\", "/"));
    expect(writers).toEqual([join("lib", "storage", "ai-provider-repository.ts").replaceAll("\\", "/")]);
  });

  it("never caches the generation endpoint or its responses", () => {
    const route = read(join("app", "api", "generate-session", "route.ts"));
    expect(route).toContain("no-store");
    expect(route).toContain('export const dynamic = "force-dynamic"');
  });

  it("redacts keys out of provider error payloads and messages", () => {
    const payload = { error: { apiKey: KEY, authorization: `Bearer ${KEY}`, message: `upstream said ${KEY}` } };
    expect(JSON.stringify(redactUnknown(payload))).not.toContain(KEY);
    expect(safeErrorMessage(new Error(`fetch failed with ${KEY}`))).not.toContain(KEY);
  });
});
