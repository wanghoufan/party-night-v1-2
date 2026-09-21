import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { RandomGroupTool } from "@/components/tools/RandomGroupTool";
import { RandomPlayerTool } from "@/components/tools/RandomPlayerTool";
import type { Player } from "@/lib/domain/schemas";

const NAMES = ["Alex", "Emma", "Kai", "Mia", "Leo", "Zoe"];

const roster = (count: number, inactive: number[] = []): Player[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    displayName: NAMES[index] ?? `玩家 ${index + 1}`,
    active: !inactive.includes(index + 1),
    createdAt: "x",
    lastUsedAt: "x",
  }));

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 随机工具只通过 Math.random 取随机：测试里换成固定种子，结果可复现。 */
function stubRandom(seed = 20260921) {
  vi.spyOn(Math, "random").mockImplementation(mulberry32(seed));
}

const drawButton = () => screen.getByRole("button", { name: /随机点名|再抽一个/ });
const splitButton = () => screen.getByRole("button", { name: /开始分组|重新分组/ });
const groupItems = () => screen.getAllByRole("listitem").map((item) => item.textContent ?? "");

describe("RandomPlayerTool（T158 / US7）", () => {
  beforeEach(() => stubRandom());
  afterEach(() => vi.restoreAllMocks());

  it("进入时先给出可操作状态，不预选任何人", () => {
    render(<RandomPlayerTool players={roster(3)} />);
    expect(screen.getByLabelText("随机点名")).toBeInTheDocument();
    expect(drawButton()).toHaveTextContent("随机点名");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("纯本地随机 · 不联网")).toBeInTheDocument();
  });

  it("点名后显示结果，按钮变成“再抽一个”且连续两次不点同一人", () => {
    render(<RandomPlayerTool players={roster(4)} />);
    fireEvent.click(drawButton());
    const first = screen.getByRole("status").textContent!;
    expect(NAMES).toContain(first);
    expect(drawButton()).toHaveTextContent("再抽一个");

    for (let index = 0; index < 20; index += 1) {
      const before = screen.getByRole("status").textContent;
      fireEvent.click(drawButton());
      expect(screen.getByRole("status").textContent).not.toBe(before);
    }
  });

  it("暂离玩家永远不出现在结果里", () => {
    render(<RandomPlayerTool players={roster(4, [1, 3])} />);
    for (let index = 0; index < 20; index += 1) {
      fireEvent.click(drawButton());
      expect(["Emma", "Mia"]).toContain(screen.getByRole("status").textContent);
    }
  });

  it("没有玩家时禁用并提示先去组局加人", () => {
    render(<RandomPlayerTool players={[]} />);
    expect(drawButton()).toBeDisabled();
    expect(screen.getByText(/先去/)).toBeInTheDocument();
  });

  it("没有昵称的玩家用“玩家 N”占位", () => {
    render(<RandomPlayerTool players={[{ id: "p1", displayName: "   ", active: true, createdAt: "x", lastUsedAt: "x" }]} />);
    fireEvent.click(drawButton());
    expect(screen.getByRole("status")).toHaveTextContent("玩家 1");
  });
});

describe("RandomGroupTool（T158 / T159）", () => {
  beforeEach(() => stubRandom());
  afterEach(() => vi.restoreAllMocks());

  it("默认 2 组，点一下得到两组名单", () => {
    render(<RandomGroupTool players={roster(6)} />);
    expect(screen.getByLabelText("随机分组")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).toBeNull();
    fireEvent.click(splitButton());

    const items = groupItems();
    expect(items).toHaveLength(2);
    expect(items[0]).toContain("第 1 组");
    expect(items[1]).toContain("第 2 组");
    expect(items[0]).toContain("3 人");
  });

  it("可切到 3 组与两人一组，奇数余数落在最后一组", () => {
    render(<RandomGroupTool players={roster(5)} />);

    fireEvent.click(screen.getByRole("button", { name: "3 组" }));
    fireEvent.click(splitButton());
    expect(groupItems()).toHaveLength(3);
    expect(groupItems()[2]).toContain("1 人");

    fireEvent.click(screen.getByRole("button", { name: "两人一组" }));
    fireEvent.click(splitButton());
    const twoPerGroup = groupItems();
    expect(twoPerGroup).toHaveLength(3);
    expect(twoPerGroup.map((item) => item.includes("2 人"))).toEqual([true, true, false]);
  });

  it("暂离玩家不进名单，无昵称玩家用占位名", () => {
    render(<RandomGroupTool players={[{ id: "p1", displayName: "", active: true, createdAt: "x", lastUsedAt: "x" }, { id: "p2", displayName: "Emma", active: true, createdAt: "x", lastUsedAt: "x" }, { id: "p3", displayName: "Kai", active: false, createdAt: "x", lastUsedAt: "x" }]} />);
    fireEvent.click(splitButton());
    const items = groupItems();
    expect(items).toHaveLength(2);
    expect(items.join(" ")).toContain("玩家 1");
    expect(items.join(" ")).not.toContain("Kai");
  });

  it("不足 2 名在场玩家时禁用并说明原因", () => {
    render(<RandomGroupTool players={roster(3, [2, 3])} />);
    expect(splitButton()).toBeDisabled();
    expect(screen.getByText(/至少需要 2 名在场玩家/)).toBeInTheDocument();
  });

  it("工具不调用 AI：没有输入框，也没有任何网络结果区", () => {
    render(<RandomGroupTool players={roster(4)} />);
    fireEvent.click(splitButton());
    expect(screen.queryByRole("textbox")).toBeNull();
    const groups = screen.getByRole("list", { name: "分组结果" });
    expect(within(groups).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("纯本地随机 · 不联网")).toBeInTheDocument();
  });
});
