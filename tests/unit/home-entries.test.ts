import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomGamePack, GameSession, Intensity, SessionConfig } from "@/lib/domain/schemas";

const mocks = vi.hoisted(() => ({ list: vi.fn(), getLatestUnfinished: vi.fn(), save: vi.fn(), loadDisabledPackIds: vi.fn() }));

vi.mock("@/lib/storage/game-pack-repository", () => ({ gamePackRepository: { list: mocks.list } }));
vi.mock("@/lib/storage/session-repository", () => ({ sessionRepository: { getLatestUnfinished: mocks.getLatestUnfinished, save: mocks.save } }));
vi.mock("@/lib/storage/pack-enablement", () => ({ loadDisabledPackIds: mocks.loadDisabledPackIds }));

import { resolvePackRoute } from "@/lib/engine/pack-entry";
import { BUILTIN_PACK_IDS } from "@/lib/domain/constants";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import { homePackCards } from "@/lib/game-packs/home-cards";
import { listManualPlayablePacks } from "@/lib/engine/pack-switcher";

const CONFIG: SessionConfig = {
  players: ["Alex", "Emma", "Kai"].map((displayName, index) => ({ id: `p${index + 1}`, displayName, active: true, createdAt: "x", lastUsedAt: "x" })),
  relationship: "friends",
  vibes: ["funny"],
  intensity: 3 as Intensity,
  boundaries: {
    noPhysicalContact: false, noAlcoholPenalty: true, noExPartners: false, noSexualHistory: false,
    noMoneyIncome: false, noPhonePrivacy: true, noPublicPosting: true, noStrangerContact: true,
    noPhotoVideo: false, noSocialAccounts: false, customText: "",
  },
  enabledPackIds: [...BUILTIN_PACK_IDS],
  mode: "single",
};

function session(status: GameSession["status"], currentPackId = "never-have"): GameSession {
  return {
    schemaVersion: 2, id: `session-${status}`, status, mode: "single", config: CONFIG,
    deckSnapshot: BUILTIN_SEED_CARDS.filter((card) => card.packId === "never-have"),
    usedCardIds: [], rounds: [], currentPackId, currentPackState: {}, recentRejectedFingerprints: [],
    startedAt: "x", updatedAt: "x",
  };
}

describe("homePackCards（V1.4 R-050 首页玩法卡）", () => {
  it("7 个真实内置玩法直出，顺序沿用 registry，第 4 格仍是动作卡「随机玩一个」", () => {
    const cards = homePackCards();

    expect(cards.map(({ pack }) => pack.id)).toEqual([...BUILTIN_PACK_IDS]);
    expect(cards.map(({ launcher }) => launcher)).toEqual([false, false, false, true, false, false, false, false]);
    expect(cards.filter(({ launcher }) => !launcher)).toHaveLength(7);
  });

  it("卡片不受游戏包开关影响：开关只圈 AI 组局候选（R-057），所以没有禁用态输入", () => {
    const ids = homePackCards().map(({ pack }) => pack.id);
    // 除动作卡外，首页玩法卡与「手工可玩集合」完全一致（同一个注册表，同一个顺序）
    expect(ids.filter((id) => id !== "ai-improv")).toEqual(listManualPlayablePacks().map((pack) => pack.id));
    expect(ids).toContain("spin-bottle");
    expect(ids).toContain("ai-improv");
  });
});

describe("resolvePackRoute（首页玩法卡共用入口）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue([] as CustomGamePack[]);
    mocks.save.mockResolvedValue(undefined);
    mocks.loadDisabledPackIds.mockResolvedValue([] as string[]);
  });

  it("没有进行中的局时复用既有 quick setup，不新建第二套向导", async () => {
    mocks.getLatestUnfinished.mockResolvedValue(undefined);
    await expect(resolvePackRoute("would-you-rather")).resolves.toBe("/setup?pack=would-you-rather");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("生成中的局直接回生成页，不重开设置", async () => {
    mocks.getLatestUnfinished.mockResolvedValue(session("generating"));
    await expect(resolvePackRoute("would-you-rather")).resolves.toBe("/generating?session=session-generating");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("有进行中的局时在同一 Session 内切换玩法并落库", async () => {
    mocks.getLatestUnfinished.mockResolvedValue(session("active"));
    await expect(resolvePackRoute("would-you-rather")).resolves.toBe("/game?session=session-active");
    expect(mocks.save).toHaveBeenCalledTimes(1);
    const saved = mocks.save.mock.calls[0]![0] as GameSession;
    expect(saved.id).toBe("session-active");
    expect(saved.currentPackId).toBe("would-you-rather");
    expect(saved.config).toEqual(CONFIG);
  });

  it("已经在这个玩法上时不重复落库，直接回主局", async () => {
    mocks.getLatestUnfinished.mockResolvedValue(session("active", "would-you-rather"));
    await expect(resolvePackRoute("would-you-rather")).resolves.toBe("/game?session=session-active");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("暂停中的局也回到主局，而不是重新组局", async () => {
    mocks.getLatestUnfinished.mockResolvedValue(session("paused"));
    await expect(resolvePackRoute("spin-bottle")).resolves.toBe("/game?session=session-paused");
  });

  it("被游戏包关掉 AI 组局的玩法照样能单玩（开关只圈组局，R-057）", async () => {
    mocks.loadDisabledPackIds.mockResolvedValue(["spin-bottle"]);
    mocks.getLatestUnfinished.mockResolvedValue(session("active"));

    await expect(resolvePackRoute("spin-bottle")).resolves.toBe("/game?session=session-active");
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect((mocks.save.mock.calls[0]![0] as GameSession).currentPackId).toBe("spin-bottle");
  });

  it("注册表里找不到的玩法不从这里启动，只引导回游戏包", async () => {
    mocks.list.mockResolvedValue([{
      schemaVersion: 1, enabled: false, updatedAt: "2026-01-01T00:00:00.000Z", cards: [],
      definition: { id: "custom-off", name: "已停用自定义", icon: "🎲", enabledByDefault: true, mixable: true, minPlayers: 2, supportedCardTypes: ["custom"], weight: 1, source: "custom" },
    }]);
    mocks.getLatestUnfinished.mockResolvedValue(session("active"));

    await expect(resolvePackRoute("custom-off")).resolves.toBe("/packs");
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

/** V1.4 R-052：第 4 格「随机玩一个」复用既有入口——有局换玩法、没局复用 quick setup，随机源可注入。 */
describe("resolvePackRoute · 随机玩一个", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue([] as CustomGamePack[]);
    mocks.save.mockResolvedValue(undefined);
    mocks.loadDisabledPackIds.mockResolvedValue([] as string[]);
  });

  it("没有进行中的局时随机预选一个真实玩法，走同一条 quick setup", async () => {
    mocks.getLatestUnfinished.mockResolvedValue(undefined);
    await expect(resolvePackRoute("ai-improv", () => 0)).resolves.toBe("/setup?pack=truth-dare");
    await expect(resolvePackRoute("ai-improv", () => 0.999999)).resolves.toBe("/setup?pack=spin-bottle");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("有进行中的局时在同一 Session 内换成随机玩法，Session/config/历史保持不变", async () => {
    mocks.getLatestUnfinished.mockResolvedValue(session("active"));

    await expect(resolvePackRoute("ai-improv", () => 0)).resolves.toBe("/game?session=session-active");
    expect(mocks.save).toHaveBeenCalledTimes(1);
    const saved = mocks.save.mock.calls[0]![0] as GameSession;
    expect(saved.id).toBe("session-active");
    expect(saved.config).toEqual(CONFIG);
    expect([...saved.rounds, ...(saved.currentRound ? [saved.currentRound] : [])].every((item) => item.packId !== "ai-improv")).toBe(true);
    expect(saved.currentPackId).toBe("truth-dare");
  });

  it("随机池是全部真实玩法：被关掉 AI 组局的玩法照样可能被抽到，启动器自己不会", async () => {
    mocks.loadDisabledPackIds.mockResolvedValue(["truth-dare", "most-likely", "never-have"]);
    mocks.getLatestUnfinished.mockResolvedValue(undefined);
    await expect(resolvePackRoute("ai-improv", () => 0)).resolves.toBe("/setup?pack=truth-dare");
  });

  it("自定义玩法开着时也进随机池，排在规范序列最后", async () => {
    mocks.list.mockResolvedValue([{
      schemaVersion: 1, enabled: true, updatedAt: "2026-01-01T00:00:00.000Z", cards: [],
      definition: { id: "custom-1", name: "朋友梗", icon: "🎲", enabledByDefault: true, mixable: true, minPlayers: 2, supportedCardTypes: ["custom"], weight: 1, source: "custom" },
    }]);
    mocks.getLatestUnfinished.mockResolvedValue(undefined);
    await expect(resolvePackRoute("ai-improv", () => 0.999999)).resolves.toBe("/setup?pack=custom-1");
  });
});
