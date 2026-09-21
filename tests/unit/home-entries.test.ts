import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomGamePack, GameSession, Intensity, SessionConfig } from "@/lib/domain/schemas";

const mocks = vi.hoisted(() => ({ list: vi.fn(), getLatestUnfinished: vi.fn(), save: vi.fn(), loadDisabledPackIds: vi.fn() }));

vi.mock("@/lib/storage/game-pack-repository", () => ({ gamePackRepository: { list: mocks.list } }));
vi.mock("@/lib/storage/session-repository", () => ({ sessionRepository: { getLatestUnfinished: mocks.getLatestUnfinished, save: mocks.save } }));
vi.mock("@/lib/storage/pack-enablement", () => ({ loadDisabledPackIds: mocks.loadDisabledPackIds }));

import { resolvePackRoute } from "@/lib/engine/pack-entry";
import { BUILTIN_PACK_IDS } from "@/lib/domain/constants";
import { corePackCards } from "@/lib/game-packs/home-cards";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";

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

describe("corePackCards（T160 首页 2×2 核心卡）", () => {
  it("只放原来的 4 个核心玩法，顺序与设计稿一致", () => {
    const cards = corePackCards([...BUILTIN_PACK_IDS]);
    expect(cards.map(({ pack }) => pack.id)).toEqual(["truth-dare", "most-likely", "never-have", "ai-improv"]);
    expect(cards.every(({ disabled }) => !disabled)).toBe(true);
  });

  it("新玩法不进核心卡（它们走“更多玩法”入口）", () => {
    const ids = corePackCards([...BUILTIN_PACK_IDS]).map(({ pack }) => pack.id);
    for (const id of ["would-you-rather", "pointing-game", "compatibility-test", "spin-bottle"]) expect(ids).not.toContain(id);
  });

  it("玩法被禁用时卡片保留位置，但标记为不可直接开局", () => {
    const cards = corePackCards(["truth-dare", "most-likely", "never-have"]);
    expect(cards.map(({ pack }) => pack.id)).toEqual(["truth-dare", "most-likely", "never-have", "ai-improv"]);
    expect(cards.find(({ pack }) => pack.id === "ai-improv")!.disabled).toBe(true);
    expect(cards.filter(({ disabled }) => disabled)).toHaveLength(1);
  });
});

describe("resolvePackRoute（T160 首页/更多玩法共用入口）", () => {
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

  it("被禁用的玩法（FR-044）不从这里启动，只引导回游戏包", async () => {
    mocks.loadDisabledPackIds.mockResolvedValue(["ai-improv"]);
    mocks.getLatestUnfinished.mockResolvedValue(session("active"));

    await expect(resolvePackRoute("ai-improv")).resolves.toBe("/packs");
    expect(mocks.save).not.toHaveBeenCalled();
    // 同一个禁用名单下，其他玩法照常可进
    await expect(resolvePackRoute("would-you-rather")).resolves.toBe("/game?session=session-active");
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

  it("只从启用集合里挑：禁用项与启动器自己都不会被选中", async () => {
    mocks.loadDisabledPackIds.mockResolvedValue(["truth-dare", "most-likely", "never-have"]);
    mocks.getLatestUnfinished.mockResolvedValue(undefined);
    await expect(resolvePackRoute("ai-improv", () => 0)).resolves.toBe("/setup?pack=would-you-rather");
  });

  it("没有可玩的真实玩法时停在游戏包页，不静默选一个已退役玩法", async () => {
    mocks.loadDisabledPackIds.mockResolvedValue(BUILTIN_PACK_IDS.filter((id) => id !== "ai-improv"));
    mocks.getLatestUnfinished.mockResolvedValue(undefined);
    await expect(resolvePackRoute("ai-improv", () => 0)).resolves.toBe("/packs");
  });
});
