import { NextResponse } from "next/server";
import { z } from "zod";
import { aiDeckResponseSchema } from "@/lib/ai/card-schema";
import { aiProviderProfileSchema } from "@/lib/ai/provider";
import { safeErrorMessage } from "@/lib/ai/redaction";
import { providerErrorCodeForException, providerErrorCodeForStatus } from "@/lib/ai/provider-errors";
import { buildDeckPrompt } from "@/lib/ai/prompt-builder";
import { callProvider, extractMessageContent } from "@/lib/ai/upstream";
import { filterCards } from "@/lib/ai/safety-filter";
import { sessionConfigSchema } from "@/lib/domain/schemas";
import { deckGenerationSource } from "@/lib/domain/generation-source";
import { BUILTIN_GAME_PACKS } from "@/lib/game-packs/registry";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const noStore = { "Cache-Control": "no-store, max-age=0" };
const requestSchema = z.object({ profile: aiProviderProfileSchema, sessionConfig: sessionConfigSchema, targetCardCount: z.number().int().min(10).max(60), sessionId: z.string().min(1).max(100) });

type DeckData = z.infer<typeof aiDeckResponseSchema>;

export async function POST(request: Request) {
  try {
    const auth = request.headers.get("authorization");
    const requestKey = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : undefined;
    const envFallbackEnabled = process.env.NODE_ENV !== "production" && process.env.PARTY_NIGHT_ENABLE_ENV_AI_FALLBACK === "true";
    const apiKey = requestKey || (envFallbackEnabled ? process.env.PARTY_NIGHT_DEV_AI_API_KEY?.trim() : undefined);
    if (!apiKey) return NextResponse.json({ ok: false, code: "KEY_REQUIRED" }, { status: 401, headers: noStore });
    const input = requestSchema.parse(await request.json());
    const prompt = buildDeckPrompt(input.sessionConfig, input.targetCardCount, BUILTIN_GAME_PACKS.filter((pack) => input.sessionConfig.enabledPackIds.includes(pack.id)));
    // 与 App buildPlayableDeck 完全同口径的过滤上下文（lib/ai/generate-deck.ts safetyContext：只计 active 玩家）。
    const safetyContext = {
      boundaries: input.sessionConfig.boundaries,
      intensity: input.sessionConfig.intensity,
      playerCount: input.sessionConfig.players.filter((player) => player.active).length,
    };
    const generateOnce = async (userPrompt: string): Promise<{ ok: true; data: DeckData } | { ok: false; code: string }> => {
      const result = await callProvider(input.profile, apiKey, {
        model: input.profile.modelId,
        messages: [{ role: "system", content: "输出严格 JSON。" }, { role: "user", content: userPrompt }],
        max_tokens: Math.max(8192, input.targetCardCount * 320), temperature: .85,
        ...(input.profile.type === "deepseek-official" ? { response_format: { type: "json_object" }, thinking: { type: "disabled" } } : {}),
      }, input.sessionId, request.signal);
      if (result.status < 200 || result.status >= 300) return { ok: false, code: providerErrorCodeForStatus(result.status) };
      try {
        const parsed = aiDeckResponseSchema.safeParse(JSON.parse(extractMessageContent(result.body)));
        if (!parsed.success) {
          const summary = parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".")}:${issue.code}`).join(",");
          console.error(`[generate-session] schema issues: ${summary}`);
          return { ok: false, code: "INVALID_OUTPUT" };
        }
        return { ok: true, data: parsed.data };
      } catch {
        return { ok: false, code: "INVALID_OUTPUT" };
      }
    };

    let lastCode = "INVALID_OUTPUT";
    let outcome: DeckData | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await generateOnce(prompt);
      if (!result.ok) {
        if (result.code !== "UPSTREAM_FAILED") return NextResponse.json({ ok: false, code: result.code }, { status: 502, headers: noStore });
        lastCode = result.code;
        continue;
      }
      outcome = result.data;
      break;
    }
    if (!outcome) {
      console.error(`[generate-session] failed code=${lastCode}`);
      return NextResponse.json({ ok: false, code: lastCode }, { status: 422, headers: noStore });
    }

    // Change C 服务端雷卡过滤：与 App buildPlayableDeck（lib/ai/generate-deck.ts playable）完全同口径，
    // 复用 filterCards 全量口径（雷区 boundaryTags + customText + 红线硬规则 + 强度 + minPlayers/maxPlayers），
    // 保证服务端返回的每一张卡 App 最终都可用，不做第二套局部过滤实现。
    let kept = filterCards(outcome.cards, safetyContext);
    let filteredCount = outcome.cards.length - kept.length;
    let retryCount = 0;
    if (kept.length < input.targetCardCount) {
      // 补齐重试一次：新 prompt 明确告知被剔除数量，让模型避开雷区/红线主题重出完整卡组；
      // 与已得卡按 id 去重合并，仍不足则如实返回（不静默补本地卡——generationSource 必须保持 ai 口径）。
      retryCount = 1;
      const retryPrompt = `${prompt}\n\n补充要求：上一次产出中有 ${filteredCount} 张卡因命中已开启雷区或安全红线被剔除，请严格避开这些主题，重新生成完整卡组。`;
      const retry = await generateOnce(retryPrompt);
      if (retry.ok) {
        const retryKept = filterCards(retry.data.cards, safetyContext);
        filteredCount += retry.data.cards.length - retryKept.length;
        const seen = new Set(kept.map((card) => card.id));
        kept = [...kept, ...retryKept.filter((card) => !seen.has(card.id))];
      }
    }
    // 合并补齐重试后 kept 可能超过 targetCardCount：截到目标数（与 App buildPlayableDeck 同口径），
    // meta.generatedCount 如实反映最终 kept 数量（不沿用首跑 outcome.meta 里的旧值）。
    kept = kept.slice(0, input.targetCardCount);
    const meta = { ...(outcome.meta ?? { generatedCount: kept.length, provider: input.profile.id }), generatedCount: kept.length, filteredCount, retryCount };
    return NextResponse.json({ cards: kept, meta, generationSource: deckGenerationSource(kept) }, { headers: noStore });
  } catch (error) {
    const safe = safeErrorMessage(error);
    const code = providerErrorCodeForException(safe);
    console.error(`[generate-session] failed code=${code}`, error);
    return NextResponse.json({ ok: false, code }, { status: 400, headers: noStore });
  }
}
