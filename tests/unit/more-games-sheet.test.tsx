import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navigation.push }) }));

import { MoreGamesSheet } from "@/components/game/MoreGamesSheet";

const entry = () => screen.getByRole("button", { name: /更多玩法/ });

async function openSheet() {
  render(<MoreGamesSheet />);
  fireEvent.click(entry());
  return await screen.findByRole("dialog", { name: "更多玩法" });
}

describe("MoreGamesSheet（T161 US1：4 新玩法 + 2 工具）", () => {
  afterEach(() => vi.clearAllMocks());

  it("默认只显示一条低侵入入口，不展开任何面板", () => {
    render(<MoreGamesSheet />);
    expect(entry()).toBeInTheDocument();
    expect(entry()).toHaveTextContent("更多玩法");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("展开后列出 4 个新玩法与 2 个快捷工具", async () => {
    const sheet = await openSheet();
    for (const name of [/二选一/, /指人游戏/, /默契测试/, /转瓶子/]) expect(within(sheet).getByRole("button", { name })).toBeInTheDocument();
    for (const name of [/随机点名/, /随机分组/]) expect(within(sheet).getByRole("button", { name })).toBeInTheDocument();
    // 核心 4 玩法不进这里（首页 2×2 已是它们的原位）
    expect(within(sheet).queryByRole("button", { name: /真心话大冒险/ })).toBeNull();
  });

  it("点新玩法走共用入口：没有进行中的局时进 quick setup", async () => {
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: /指人游戏/ }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/setup?pack=pointing-game"));
  });

  it("点工具在同一个面板内打开，不跳页、不新增 Tab", async () => {
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: /随机点名/ }));

    const tool = await screen.findByLabelText("随机点名");
    expect(tool).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "返回玩法列表" }));
    expect(await screen.findByRole("button", { name: /随机分组/ })).toBeInTheDocument();
  });

  it("随机分组工具同样在面板内可用", async () => {
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: /随机分组/ }));
    expect(await screen.findByLabelText("随机分组")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始分组" })).toBeInTheDocument();
  });

  it("Escape 与背景点击都能关掉面板", async () => {
    await openSheet();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(entry());
    expect(await screen.findByRole("dialog", { name: "更多玩法" })).toBeInTheDocument();
    fireEvent.mouseDown(document.querySelector(".sheet-backdrop")!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("关掉再打开时回到玩法列表，不停留在上次的工具页", async () => {
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: /随机分组/ }));
    expect(await screen.findByLabelText("随机分组")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(entry());
    expect(await screen.findByRole("button", { name: /随机点名/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("随机分组")).toBeNull();
  });
});
