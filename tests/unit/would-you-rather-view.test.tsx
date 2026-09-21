import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { WouldYouRatherView, splitWouldYouRather } from "@/components/game/WouldYouRatherView";
import type { GameCard } from "@/lib/domain/schemas";

function card(content = "奶茶加珍珠 VS 咖啡加双份糖", instruction = "一起倒数三秒，说出你的选择"): GameCard {
  return { id: "seed-would-you-rather-1", packId: "would-you-rather", type: "would-you-rather", content, instruction, intensity: 2, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "all", source: "builtin" };
}

const handlers = () => ({ onComplete: vi.fn(), onSwap: vi.fn(), onSkip: vi.fn() });

describe("splitWouldYouRather", () => {
  it("splits an A VS B 题面 into two options", () => {
    expect(splitWouldYouRather("奶茶加珍珠 VS 咖啡加双份糖")).toEqual(["奶茶加珍珠", "咖啡加双份糖"]);
  });

  it("uses the first separator and keeps the rest intact", () => {
    expect(splitWouldYouRather("A VS B VS C")).toEqual(["A", "B VS C"]);
  });

  it("falls back to a single option when the题面 has no separator", () => {
    expect(splitWouldYouRather("只有一个选项")).toEqual(["只有一个选项", ""]);
  });
});

describe("WouldYouRatherView", () => {
  it("shows both options around the VS divider and names the current card", () => {
    render(<WouldYouRatherView card={card()} participantNames={[]} actions={handlers()} />);
    expect(screen.getByText("奶茶加珍珠")).toBeInTheDocument();
    expect(screen.getByText("咖啡加双份糖")).toBeInTheDocument();
    expect(screen.getByText("VS")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "必须选一个" })).toBeInTheDocument();
    expect(document.querySelector(".would-you-rather")).toHaveAttribute("data-card-id", "seed-would-you-rather-1");
  });

  it("keeps one primary action (下一题) and one weak action (换一个)，没有跳过", () => {
    const actions = handlers();
    render(<WouldYouRatherView card={card()} participantNames={[]} actions={actions} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "跳过" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "下一题" }));
    expect(actions.onComplete).toHaveBeenCalledTimes(1);
    expect(actions.onSkip).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "换一个" }));
    expect(actions.onSwap).toHaveBeenCalledTimes(1);
  });

  it("plays a 3 · 2 · 1 hint and keeps the countdown digits hidden from assistive tech", () => {
    render(<WouldYouRatherView card={card()} participantNames={[]} actions={handlers()} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("3 · 2 · 1");
    const steps = status.querySelectorAll(".would-you-rather__count");
    expect([...steps].map((node) => node.textContent)).toEqual(["3", "2", "1"]);
    expect([...steps].every((node) => node.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(status.querySelector(".would-you-rather__hint")).toHaveTextContent("3 · 2 · 1 一起说");
  });

  it("renders the题面 only, without actions, when the host passes none", () => {
    render(<WouldYouRatherView card={card()} participantNames={[]} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows the card instruction and where the card came from", () => {
    render(<WouldYouRatherView card={card("A VS B", "不愿意可无惩罚跳过")} participantNames={[]} actions={handlers()} />);
    expect(screen.getByText("不愿意可无惩罚跳过")).toBeInTheDocument();
    expect(screen.getByText("本地题库")).toBeInTheDocument();
  });

  it("labels AI cards separately", () => {
    render(<WouldYouRatherView card={{ ...card("A VS B"), source: "ai" }} participantNames={[]} actions={handlers()} />);
    expect(screen.getByText("AI 生成")).toBeInTheDocument();
  });
});
