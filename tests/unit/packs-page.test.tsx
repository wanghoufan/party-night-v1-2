import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { CustomGamePack, GameSession, Player } from "@/lib/domain/schemas";

const mocks = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), remove: vi.fn(), getLatestUnfinished: vi.fn() }));

vi.mock("@/lib/storage/game-pack-repository", () => ({ gamePackRepository: { list: mocks.list, save: mocks.save, delete: mocks.remove } }));
vi.mock("@/lib/storage/session-repository", () => ({ sessionRepository: { getLatestUnfinished: mocks.getLatestUnfinished } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/packs" }));

import PacksPage from "@/app/packs/page";
import { BUILTIN_GAME_PACKS } from "@/lib/game-packs/registry";

const CUSTOM: CustomGamePack = {
  schemaVersion: 1,
  definition: { id: "custom-1", name: "朋友梗合集", icon: "🎲", enabledByDefault: true, mixable: true, minPlayers: 2, supportedCardTypes: ["custom"], weight: 1, source: "custom" },
  cards: [
    { id: "c1", packId: "custom-1", type: "custom", content: "讲一个只有我们知道的梗", instruction: "", intensity: 2, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "all", source: "custom" },
    { id: "c2", packId: "custom-1", type: "custom", content: "给今晚起个代号", instruction: "", intensity: 2, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "all", source: "custom" },
  ],
  enabled: true,
  updatedAt: "2026-09-21T00:00:00.000Z",
};

function playersSession(count: number): GameSession {
  const now = new Date().toISOString();
  const players: Player[] = ["Alex", "Emma", "Kai", "Mia"].slice(0, count).map((displayName, index) => ({ id: `p${index + 1}`, displayName, active: true, createdAt: now, lastUsedAt: now }));
  return {
    schemaVersion: 2, id: "session-tools", status: "active", mode: "single",
    config: { players, relationship: "friends", vibes: ["funny"], intensity: 3, boundaries: { noPhysicalContact: false, noAlcoholPenalty: true, noExPartners: false, noSexualHistory: false, noMoneyIncome: false, noPhonePrivacy: true, noPublicPosting: true, noStrangerContact: true, noPhotoVideo: false, noSocialAccounts: false, customText: "" }, enabledPackIds: ["never-have"], mode: "single" },
    deckSnapshot: [], usedCardIds: [], rounds: [], currentPackId: "never-have", currentPackState: {}, recentRejectedFingerprints: [],
    startedAt: now, updatedAt: now,
  };
}

const segment = (name: "玩法" | "规则") => screen.getByRole("button", { name });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([CUSTOM]);
  mocks.save.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  mocks.getLatestUnfinished.mockResolvedValue(playersSession(4));
});

afterEach(() => vi.clearAllMocks());

describe("我的游戏包 · 玩法分区（T164/T165）", () => {
  it("默认进玩法：8 个内置玩法全列出，保持原有“已启用”状态标签", async () => {
    render(<PacksPage />);

    expect(screen.getByRole("heading", { name: "内置玩法" })).toBeInTheDocument();
    expect(BUILTIN_GAME_PACKS).toHaveLength(8);
    for (const pack of BUILTIN_GAME_PACKS) expect(screen.getByText(pack.name)).toBeInTheDocument();
    expect(screen.getAllByText("已启用")).toHaveLength(8);
    await waitFor(() => expect(screen.getByText(CUSTOM.definition.name)).toBeInTheDocument());
  });

  it("快捷工具是独立分区，工具行不带“已启用/开关”语义（T165）", async () => {
    render(<PacksPage />);

    const tools = await screen.findByRole("region", { name: "快捷工具" });
    expect(within(tools).getByRole("button", { name: /随机点名/ })).toBeInTheDocument();
    expect(within(tools).getByRole("button", { name: /随机分组/ })).toBeInTheDocument();
    expect(within(tools).queryByRole("checkbox")).toBeNull();
    expect(within(tools).queryByText(/已启用/)).toBeNull();
    expect(within(tools).getByText(/纯本地/)).toBeInTheDocument();
  });

  it("点工具在游戏包页内就地使用，复用本局玩家名单，不跳页", async () => {
    render(<PacksPage />);

    fireEvent.click(await screen.findByRole("button", { name: /随机点名/ }));
    const dialog = await screen.findByRole("dialog", { name: "快捷工具" });
    expect(within(dialog).getByLabelText("随机点名")).toHaveTextContent("4 位在场玩家");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("没有任何进行中的局时工具照常打开，只是没有名单可抽", async () => {
    mocks.getLatestUnfinished.mockResolvedValue(undefined);
    render(<PacksPage />);

    fireEvent.click(await screen.findByRole("button", { name: /随机点名/ }));
    const dialog = await screen.findByRole("dialog", { name: "快捷工具" });
    expect(within(dialog).getByLabelText("随机点名")).toHaveTextContent("还没有在场玩家");
  });

  it("自定义玩法的新建/启用/删除照旧（T164 保留自定义 CRUD）", async () => {
    render(<PacksPage />);
    const pack = await screen.findByText(CUSTOM.definition.name);
    expect(pack.closest("article")).toHaveTextContent("2 张题卡");
    expect(screen.getByRole("link", { name: "新建游戏包" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "＋ 新建" })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("启用朋友梗合集"));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect((mocks.save.mock.calls[0]![0] as CustomGamePack).enabled).toBe(false);

    fireEvent.click(screen.getByLabelText("删除朋友梗合集"));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("custom-1"));
    await waitFor(() => expect(screen.queryByText(CUSTOM.definition.name)).toBeNull());
  });
});

describe("我的游戏包 · 规则分区（T163）", () => {
  it("切到规则：玩法分区整体退场，规则内容占位不假装已上线", async () => {
    render(<PacksPage />);
    await screen.findByText(CUSTOM.definition.name);

    fireEvent.click(segment("规则"));
    expect(screen.getByRole("heading", { name: "规则库整理中" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "内置玩法" })).toBeNull();
    expect(screen.queryByText(CUSTOM.definition.name)).toBeNull();
    // 规则页不给“开始游戏”类主 CTA（US8 第 5 条）
    expect(screen.queryByRole("link", { name: /开始/ })).toBeNull();
  });

  it("切回玩法：内置玩法与自定义玩法原样回来", async () => {
    render(<PacksPage />);
    await screen.findByText(CUSTOM.definition.name);

    fireEvent.click(segment("规则"));
    fireEvent.click(segment("玩法"));

    expect(screen.getByRole("heading", { name: "内置玩法" })).toBeInTheDocument();
    expect(screen.getByText(CUSTOM.definition.name)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "规则库整理中" })).toBeNull();
  });

  it("分区切换只发生在游戏包页内，底部仍是原来 4 个 Tab", async () => {
    render(<PacksPage />);
    await screen.findByText(CUSTOM.definition.name);
    fireEvent.click(segment("规则"));
    expect(screen.getByRole("navigation", { name: "主导航" }).querySelectorAll("a")).toHaveLength(4);
  });
});
