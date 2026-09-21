import { NextResponse } from "next/server";
import { z } from "zod";
import { aiDeckResponseSchema } from "@/lib/ai/card-schema";
import { aiProviderProfileSchema } from "@/lib/ai/provider";
import { safeErrorMessage } from "@/lib/ai/redaction";
import { providerErrorCodeForException, providerErrorCodeForStatus } from "@/lib/ai/provider-errors";
import { buildDeckPrompt } from "@/lib/ai/prompt-builder";
import { callProvider, extractMessageContent } from "@/lib/ai/upstream";
import { sessionConfigSchema } from "@/lib/domain/schemas";
import { BUILTIN_GAME_PACKS } from "@/lib/game-packs/registry";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const noStore = { "Cache-Control": "no-store, max-age=0" };
const requestSchema = z.object({ profile: aiProviderProfileSchema, sessionConfig: sessionConfigSchema, targetCardCount: z.number().int().min(10).max(60), sessionId: z.string().min(1).max(100) });

export async function POST(request: Request) {
  try {
    const auth = request.headers.get("authorization");
    const requestKey = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : undefined;
    const envFallbackEnabled = process.env.NODE_ENV !== "production" && process.env.PARTY_NIGHT_ENABLE_ENV_AI_FALLBACK === "true";
    const apiKey = requestKey || (envFallbackEnabled ? process.env.PARTY_NIGHT_DEV_AI_API_KEY?.trim() : undefined);
    if (!apiKey) return NextResponse.json({ ok: false, code: "KEY_REQUIRED" }, { status: 401, headers: noStore });
    const input = requestSchema.parse(await request.json());
    const prompt = buildDeckPrompt(input.sessionConfig, input.targetCardCount, BUILTIN_GAME_PACKS.filter((pack) => input.sessionConfig.enabledPackIds.includes(pack.id)));
    let lastCode = "INVALID_OUTPUT";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await callProvider(input.profile, apiKey, {
        model: input.profile.modelId,
        messages: [{ role: "system", content: "输出严格 JSON。" }, { role: "user", content: prompt }],
        max_tokens: Math.max(4096, input.targetCardCount * 190), temperature: .85,
        ...(input.profile.type === "deepseek-official" ? { response_format: { type: "json_object" }, thinking: { type: "disabled" } } : {}),
      }, input.sessionId, request.signal);
      if (result.status < 200 || result.status >= 300) {
        const code = providerErrorCodeForStatus(result.status);
        if (code !== "UPSTREAM_FAILED") return NextResponse.json({ ok: false, code }, { status: 502, headers: noStore });
        lastCode = code;
        continue;
      }
      try {
        const parsed = aiDeckResponseSchema.parse(JSON.parse(extractMessageContent(result.body)));
        return NextResponse.json(parsed, { headers: noStore });
      } catch { lastCode = "INVALID_OUTPUT"; }
    }
    return NextResponse.json({ ok: false, code: lastCode }, { status: 422, headers: noStore });
  } catch (error) {
    const safe = safeErrorMessage(error);
    const code = providerErrorCodeForException(safe);
    return NextResponse.json({ ok: false, code }, { status: 400, headers: noStore });
  }
}
