import { NextResponse } from "next/server";
import { aiProviderProfileSchema } from "@/lib/ai/provider";
import { callProvider } from "@/lib/ai/upstream";
import { safeErrorMessage } from "@/lib/ai/redaction";
import { providerErrorCodeForException, providerErrorCodeForStatus } from "@/lib/ai/provider-errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const requestSchema = z.object({ profile: aiProviderProfileSchema, sessionId: z.string().min(1).max(100) });
const noStore = { "Cache-Control": "no-store, max-age=0" };

function bearer(request: Request): string | undefined {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : undefined;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const apiKey = bearer(request);
    if (!apiKey) return NextResponse.json({ ok: false, code: "KEY_REQUIRED" }, { status: 401, headers: noStore });
    const { profile, sessionId } = requestSchema.parse(await request.json());
    const result = await callProvider(profile, apiKey, {
      model: profile.modelId,
      messages: [{ role: "user", content: "只回复 JSON：{\"ok\":true}" }],
      max_tokens: 32,
      temperature: 0,
      ...(profile.type === "deepseek-official" ? { response_format: { type: "json_object" }, thinking: { type: "disabled" } } : {}),
    }, sessionId, request.signal);
    if (result.status < 200 || result.status >= 300) {
      const code = providerErrorCodeForStatus(result.status);
      return NextResponse.json({ ok: false, code }, { status: 502, headers: noStore });
    }
    return NextResponse.json({ ok: true, latencyMs: Date.now() - startedAt }, { headers: noStore });
  } catch (error) {
    const safe = safeErrorMessage(error);
    const code = providerErrorCodeForException(safe);
    return NextResponse.json({ ok: false, code }, { status: 400, headers: noStore });
  }
}
