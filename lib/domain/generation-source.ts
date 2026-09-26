import type { GameCard, GenerationSource } from "./schemas";

/**
 * 整局生成来源的唯一判定口径（Change B 补充＝V1.4 R-060 的二值语义）：
 * 只看**最终持久化 Deck**——存在任一 `source === "ai"` 的卡即 `ai`，否则 `local-fallback`。
 * - 全本地题库、seed + custom、纯 custom、Provider 请求失败、Provider 成功但 AI 卡被安全/去重/阈值处理掉，都算 `local-fallback`；
 * - custom 卡是中性来源，不改变判定；
 * - 判定的是「最终是否用了 AI 卡」，不是「请求是否成功」；只有 `ai` 算 AI 通过。
 *
 * Session 落库（`lib/engine/session-engine`）、后台补题重算（`app/game`）与 Matrix 判定
 * （`tests/mac/ai-matrix-full.ts`、`tests/phone/ai-matrix-phone.ts`）都复用本函数，禁各写一份。
 */
export function deckGenerationSource(cards: readonly GameCard[]): GenerationSource {
  return cards.some((card) => card.source === "ai") ? "ai" : "local-fallback";
}

/** Matrix / QA 判定 AI 通过的唯一谓词：字段必须机器可判，非 `ai`（含缺省/未知值）一律不算 AI PASS。 */
export function isAiGenerationSource(value: unknown): value is "ai" {
  return value === "ai";
}

/**
 * 一次性回退提示的触发口径（Change A 小改）：每局最多提示一次，只看「本局来源是否落到 local-fallback」。
 * - 开局即 `local-fallback`（AI 失败回退 / 本局直接走本地题库）→ 首次判定提示一次；
 * - `ai` → `local-fallback` 的过渡（AI 卡被换回本地）→ 提示一次；
 * - 全程 `ai`、已提示过、或本来就停在 `local-fallback`（无过渡）→ 不提示。
 * `previousSource` 由调用方在每次判定后回填；开局无上一态传 `undefined`。
 */
export function shouldAnnounceGenerationFallback(input: {
  previousSource?: GenerationSource;
  source?: GenerationSource;
  announced: boolean;
}): boolean {
  if (input.announced) return false;
  if (input.source !== "local-fallback") return false;
  return input.previousSource !== "local-fallback";
}

/** 回退提示主句：AI 确实尝试并失败时用它，明说当前牌堆来自本地题库、组局继续。 */
export const GENERATION_FALLBACK_NOTICE = "AI 连接失败，已切换本地题库，组局继续";
/** 无失败记录（本局本来就走本地题库）时的中性文案：不谎报 AI 失败。 */
export const LOCAL_DECK_NOTICE = "本局使用本地题库，组局继续";

/**
 * 回退提示文案：`reason`（由 `providerErrorMessage` 按错误码 + provider 名产出）有则附在主句后。
 * 必须是用户可读的一句，且永不包含 Key、Prompt 或任何凭据——本函数只做纯字符串拼接。
 */
export function generationFallbackNoticeText(reason?: string): string {
  const detail = reason?.trim();
  return detail ? `${GENERATION_FALLBACK_NOTICE} ${detail}` : LOCAL_DECK_NOTICE;
}
