/**
 * B5 收口｜pack 契约人数下限（用户 V1.2 §三 blocking P1「非法玩法可进入」）。
 *
 * 唯一真源＝`getGamePack(packId).minPlayers`；卡自报 minPlayers 只能更严格不能更宽松：
 * 实际下限 = max(卡自报, pack 契约下限)。必须覆盖三条卡来源：
 *   ① 服务端 /api/generate-session   ② App buildPlayableDeck   ③ 本地 SSOT / seed 卡。
 * 服务端与 App 复用同一 `filterCards` 漏斗，不写第二套局部过滤。
 *
 * 回归钉子：2 人局 most-likely / pointing-game 必须滤光；2 人起的玩法不许被误伤。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/generate-session/route";
import { callProvider } from "@/lib/ai/upstream";
import { buildPlayableDeck } from "@/lib/ai/generate-deck";
import { effectiveMinPlayers, normalizeAICard, packMinPlayersFloor } from "@/lib/ai/normalize";
import { filterCards } from "@/lib/ai/safety-filter";
import { mainlineSsotCardsByPack } from "@/lib/v2-content/v2-card-bridge";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { GameCard, SessionConfig } from "@/lib/domain/schemas";

vi.mock("@/lib/ai/upstream", () => ({
  callProvider: vi.fn(),
  extractMessageContent: (body: unknown) => body as string,
}));

const callProviderMock = vi.mocked(callProvider);

const card = (overrides: Partial<GameCard> & Pick<GameCard, "id" | "packId">): GameCard => ({
  type: "vote", content: `安全题面 ${overrides.id}`, intensity: 3, tags: [], boundaryTags: [],
  minPlayers: 2, participantMode: "all", source: "ai", ...overrides,
});

/** 安全上下文：只放行 minPlayers / 强度 / 雷区三个口径，上下文统一用最高强度。 */
const context = (playerCount: number) => ({ boundaries: DEFAULT_BOUNDARIES, intensity: 5 as const, playerCount });

const sessionConfig = (playerCount: number, enabledPackIds: string[]): SessionConfig => ({
  players: Array.from({ length: playerCount }, (_, index) => ({
    id: `p${index + 1}`, displayName: `嘉宾${index + 1}`, active: true, createdAt: "x", lastUsedAt: "x",
  })),
  relationship: "朋友", vibes: ["欢乐"], intensity: 5, boundaries: DEFAULT_BOUNDARIES, enabledPackIds, mode: "single",
});

/** 生卡片字面量（未过 schema），用于构造模型自报 minPlayers 偏宽松的非法卡。 */
const rawMostLikely = (minPlayers: number, id = "ai-likely-loose") => ({
  id, packId: "most-likely", type: "vote", content: "谁最可能今晚最先睡着？", instruction: "倒数三秒，一起指向那个人",
  intensity: 3, tags: [], boundaryTags: [], minPlayers, participantMode: "all", source: "ai",
});

beforeEach(() => {
  callProviderMock.mockReset();
});

describe("pack 契约人数下限（max(卡自报, pack 契约)）", () => {
  it("①归一层：most-likely 的 V1.0 content 卡不再信模型自报 minPlayers=2，抬到 pack 契约 3（文本清洗语义不变）", () => {
    const normalized = normalizeAICard(rawMostLikely(2));
    expect(normalized.minPlayers).toBe(3);
    expect(normalized.content).toBe("谁最可能今晚最先睡着？");
    expect(normalized.instruction).toBe("倒数三秒，一起指向那个人");
    expect(normalized.participantMode).toBe("all");
  });

  it("②卡自报更严格时保留（不写死成 3）：自报 4 保持 4", () => {
    expect(normalizeAICard(rawMostLikely(4)).minPlayers).toBe(4);
    expect(effectiveMinPlayers(card({ id: "m4", packId: "most-likely", minPlayers: 4 }))).toBe(4);
  });

  it("③共用漏斗 filterCards：卡自报偏宽松时按 pack 下限滤（most-likely@2 滤光、@3 保留）", () => {
    const loose = card({ id: "loose", packId: "most-likely", minPlayers: 2 });
    expect(effectiveMinPlayers(loose)).toBe(3);
    expect(filterCards([loose], context(2))).toHaveLength(0);
    expect(filterCards([loose], context(3))).toHaveLength(1);
  });

  it("④pointing-game@2 维持现状滤光、@3 保留（回归钉子）", () => {
    const pointing = card({ id: "pg", packId: "pointing-game", type: "pointing", minPlayers: 2 });
    expect(filterCards([pointing], context(2))).toHaveLength(0);
    expect(filterCards([pointing], context(3))).toHaveLength(1);
  });

  it("⑤2 人起玩法不误伤：compatibility-test / would-you-rather / truth-dare / never-have @2 仍合法", () => {
    const legalAtTwo = [
      card({ id: "compat", packId: "compatibility-test", type: "compatibility", participantMode: "pair" }),
      card({ id: "wyr", packId: "would-you-rather", type: "would-you-rather" }),
      card({ id: "truth", packId: "truth-dare", type: "truth" }),
      card({ id: "never", packId: "never-have", type: "statement" }),
    ];
    expect(filterCards(legalAtTwo, context(2))).toHaveLength(4);
    for (const item of legalAtTwo) expect(packMinPlayersFloor(item.packId)).toBe(2);
  });

  it("⑥同口径：同一份卡在服务端 route 与 App buildPlayableDeck 判定一致（非法 most-likely 两路都出局）", async () => {
    const clean = Array.from({ length: 10 }, (_, index) => ({
      id: `ai-truth-${index + 1}`, packId: "truth-dare", type: "truth", content: `安全真心话第 ${index + 1} 题`,
      instruction: "如实回答", intensity: 3, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "single", source: "ai",
    }));
    const raw = { cards: [...clean, rawMostLikely(2)], meta: { generatedCount: 11, provider: "test" } };
    const config = sessionConfig(2, ["truth-dare", "most-likely"]);

    callProviderMock.mockResolvedValueOnce({ status: 200, body: JSON.stringify(raw) });
    const response = await POST(new Request("http://localhost/api/generate-session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-key" },
      body: JSON.stringify({ profile: { id: "test-provider", type: "deepseek-official", name: "测试通道", baseUrl: "https://api.deepseek.com", modelId: "deepseek-flash", protocol: "openai-chat-completions", isDefault: true, experimental: false, autoFallback: false, enabled: true, updatedAt: "2026-01-01T00:00:00.000Z" }, sessionConfig: config, targetCardCount: 10, sessionId: "b5-session" }),
    }));
    const body = await response.json() as { cards: GameCard[]; meta: { filteredCount: number; retryCount: number } };

    const appDeck = buildPlayableDeck(raw, config, 40);

    // 服务端：10 张干净卡恰好填满 target → 不触发重试；非法 most-likely 被滤掉。
    expect(response.status).toBe(200);
    expect(body.cards).toHaveLength(10);
    expect(body.meta.filteredCount).toBe(1);
    expect(body.meta.retryCount).toBe(0);
    expect(body.cards.some((item) => item.packId === "most-likely")).toBe(false);
    expect(appDeck.some((item) => item.packId === "most-likely")).toBe(false);
    // 两路对同一批 AI 卡的判定结果一致（顺序也一致）。
    expect(appDeck.slice(0, 10).map((item) => item.id)).toEqual(body.cards.map((item) => item.id));
  });

  it("⑦本地 SSOT 卡（第三条来源）同样受 pack 下限约束：most-likely 全 >=3，2 人局滤光、3 人局有卡", () => {
    const local = [...mainlineSsotCardsByPack("most-likely")];
    expect(local.length).toBeGreaterThan(0);
    expect(local.every((item) => item.minPlayers >= 3)).toBe(true);
    expect(filterCards(local, context(2))).toHaveLength(0);
    expect(filterCards(local, context(3)).length).toBeGreaterThan(0);
  });

  it("⑧未知 packId 按现有兜底 2 处理，不崩", () => {
    const unknown = card({ id: "u", packId: "custom-unknown", minPlayers: 2 });
    expect(packMinPlayersFloor("custom-unknown")).toBe(2);
    expect(effectiveMinPlayers(unknown)).toBe(2);
    expect(filterCards([unknown], context(2))).toHaveLength(1);
    expect(normalizeAICard({ ...unknown }).minPlayers).toBe(2);
  });
});
