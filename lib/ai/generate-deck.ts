import { aiDeckResponseSchema } from "./card-schema";
import { filterCards } from "./safety-filter";
import { dedupeCards } from "./normalize";
import type { AIProviderProfile } from "./provider";
import type { GameCard, SessionConfig } from "@/lib/domain/schemas";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";

/** 每个玩法在局内要保住的可玩卡下限；低于它就立即用 seed 补位，保证现场不卡。 */
export const PACK_PLAYABLE_THRESHOLD = 3;

export interface GeneratedDeckRequest {
  profile: AIProviderProfile;
  apiKey: string;
  sessionConfig: SessionConfig;
  sessionId: string;
  targetCardCount?: number;
  customCards?: GameCard[];
}

const safetyContext = (config: SessionConfig) => ({
  boundaries: config.boundaries,
  intensity: config.intensity,
  playerCount: config.players.filter((player) => player.active).length,
});

const playable = (cards: GameCard[], config: SessionConfig) => filterCards(cards, safetyContext(config));

export function buildPlayableDeck(raw: unknown, config: SessionConfig, targetCount = 40, customCards: GameCard[] = []): GameCard[] {
  const parsed = aiDeckResponseSchema.safeParse(raw);
  const aiCards = parsed.success ? parsed.data.cards : [];
  const allowedAI = playable(aiCards.filter((card) => config.enabledPackIds.includes(card.packId)), config);
  const seeds = playable(BUILTIN_SEED_CARDS.filter((card) => config.enabledPackIds.includes(card.packId)), config);
  const allowedCustom = playable(customCards.filter((card) => config.enabledPackIds.includes(card.packId)), config);
  return dedupeCards([...allowedAI, ...allowedCustom, ...seeds]).slice(0, targetCount);
}

export async function requestGeneratedDeck(input: GeneratedDeckRequest): Promise<GameCard[]> {
  const targetCardCount = input.targetCardCount ?? 40;
  const response = await fetch("/api/generate-session", {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}` },
    body: JSON.stringify({ profile: input.profile, sessionConfig: input.sessionConfig, targetCardCount, sessionId: input.sessionId }),
  });
  if (!response.ok) throw new Error((await response.json() as { code?: string }).code ?? "GENERATION_FAILED");
  const deck = buildPlayableDeck(await response.json(), input.sessionConfig, targetCardCount, input.customCards);
  if (deck.length < 10) throw new Error("INSUFFICIENT_CARDS");
  return deck;
}

/** Provider 生成失败（断网/鉴权/上游异常）时回退到本地 seed：新增 AI 玩法断网也能开局。 */
export async function requestDeckWithFallback(input: GeneratedDeckRequest, request: typeof requestGeneratedDeck = requestGeneratedDeck): Promise<GameCard[]> {
  try { return await request(input); }
  catch { return localSeedDeck(input.sessionConfig, input.customCards ?? []); }
}

export function localSeedDeck(config: SessionConfig, customCards: GameCard[] = []): GameCard[] {
  return buildPlayableDeck({ cards: [] }, config, 40, customCards);
}

/** 目标玩法还剩多少张可玩卡：属于该玩法、未被用过、且过安全/尺度/人数过滤。 */
export function countPlayablePackCards(deck: GameCard[], config: SessionConfig, packId: string, usedCardIds: string[] = []): number {
  return playable(deck.filter((card) => card.packId === packId && !usedCardIds.includes(card.id)), config).length;
}

/** pack-specific seed 补位：同步、离线可用；按 id/题面去重，只补目标玩法。 */
export function refillPackFromSeeds(deck: GameCard[], config: SessionConfig, packId: string): GameCard[] {
  const seeds = playable(BUILTIN_SEED_CARDS.filter((card) => card.packId === packId), config);
  return dedupeCards([...deck, ...seeds]);
}

/**
 * 目标玩法可用卡低于阈值时立即用 seed 补位，保证不卡现场；已达阈值则原样返回（added 为 0）。
 * 网络 refill 只是增强，见 refillPackInBackground。
 */
export function ensurePackPlayable(
  deck: GameCard[], config: SessionConfig, packId: string, usedCardIds: string[] = [], threshold = PACK_PLAYABLE_THRESHOLD,
): { deck: GameCard[]; added: number } {
  if (countPlayablePackCards(deck, config, packId, usedCardIds) >= threshold) return { deck, added: 0 };
  const refilled = refillPackFromSeeds(deck, config, packId);
  return { deck: refilled, added: refilled.length - deck.length };
}

export interface BackgroundRefillInput extends Omit<GeneratedDeckRequest, "targetCardCount"> {
  deck: GameCard[];
  packId: string;
  targetCardCount?: number;
  /** 测试注入；默认走真实 requestGeneratedDeck。 */
  request?: typeof requestGeneratedDeck;
}

/** 后台 refill：尽力而为、永不抛错；断网或 Provider 失败就原样返回，绝不影响现场。 */
export async function refillPackInBackground(input: BackgroundRefillInput): Promise<GameCard[]> {
  const request = input.request ?? requestGeneratedDeck;
  try {
    const incoming = await request({ profile: input.profile, apiKey: input.apiKey, sessionConfig: input.sessionConfig, sessionId: input.sessionId, targetCardCount: input.targetCardCount ?? 20, customCards: input.customCards });
    return dedupeCards([...input.deck, ...playable(incoming.filter((card) => card.packId === input.packId), input.sessionConfig)]);
  } catch { return input.deck; }
}
