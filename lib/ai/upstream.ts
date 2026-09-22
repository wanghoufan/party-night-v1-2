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
  const first = choices[0] as { message?: { content?: unknown; reasoning_content?: unknown } };
  let content = first?.message?.content;
  // 部分中转渠道把正文放 reasoning_content，或返回 content 数组段
  if (typeof content !== "string" || !content.trim()) {
    if (typeof first?.message?.reasoning_content === "string" && first.message.reasoning_content.trim()) {
      content = first.message.reasoning_content;
    } else if (Array.isArray(content)) {
      content = content.map((part) => typeof part === "string" ? part : typeof (part as { text?: unknown })?.text === "string" ? (part as { text: string }).text : "").join("");
    }
  }
  if (typeof content !== "string" || !content.trim()) throw new Error("provider-empty-response");
  // 诊断：只记录形状（长度/键名/结束原因），不记录题面内容与 Key
  try {
    const msg = (choices[0] as { message?: Record<string, unknown>; finish_reason?: unknown }) ?? {};
    console.error(`[generate-session] upstream shape keys=${Object.keys(msg.message ?? {}).join(",")} finish=${String((choices[0] as { finish_reason?: unknown })?.finish_reason)} len=${content.length} head=${content.slice(0, 100)}`);
  } catch { /* 诊断失败不影响主流程 */ }
  // 剥 markdown 围栏：```json ... ``` 或 ``` ... ```
  const fenced = content.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return (fenced?.[1] ?? content).trim();
}
