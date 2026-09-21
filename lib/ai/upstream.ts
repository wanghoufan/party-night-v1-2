import type { AIProviderProfile } from "./provider";
import { getOpenCodeHeaders } from "./presets";
import { requestJsonPinned } from "./server-request";
import { resolveSafeEndpoint } from "@/lib/security/ssrf-guard";

const OFFICIAL_BASES: Record<string, string> = {
  "deepseek-official": "https://api.deepseek.com",
  "opencode-go": "https://opencode.ai/zen/go/v1",
};

export async function callProvider(profile: AIProviderProfile, apiKey: string, payload: object, sessionId: string, signal?: AbortSignal): Promise<{ status: number; body: unknown }> {
  const expected = OFFICIAL_BASES[profile.type];
  if (expected && new URL(profile.baseUrl).origin + new URL(profile.baseUrl).pathname.replace(/\/$/, "") !== new URL(expected).origin + new URL(expected).pathname.replace(/\/$/, "")) {
    throw new Error("provider-preset-url-mismatch");
  }
  if (profile.type === "opencode-go" && (!profile.experimental || !profile.enabled || profile.autoFallback)) throw new Error("opencode-explicit-enable-required");
  const endpoint = await resolveSafeEndpoint(profile.baseUrl, profile.type === "custom-openai");
  return requestJsonPinned(endpoint, "chat/completions", {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(profile.type === "opencode-go" ? getOpenCodeHeaders(sessionId) : {}),
    },
    body: JSON.stringify(payload), signal,
  });
}

export function extractMessageContent(body: unknown): string {
  if (!body || typeof body !== "object") throw new Error("provider-invalid-response");
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices.length) throw new Error("provider-empty-response");
  const content = (choices[0] as { message?: { content?: unknown } })?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("provider-empty-response");
  return content;
}
