import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { PointingGameView } from "@/components/game/PointingGameView";
import type { GameCard } from "@/lib/domain/schemas";

const card: GameCard = {
  id: "seed-pointing-game-1",
  packId: "pointing-game",
  type: "pointing",
  content: "指一个你觉得今晚最有梗的人。",
  instruction: "倒数三秒，一起指向那个人",
  intensity: 2,
  tags: [],
  boundaryTags: [],
  minPlayers: 3,
  participantMode: "all",
  source: "builtin",
};

function mockReducedMotion(reduce: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

const view = (names = ["Alex", "Emma", "Kai"]) => render(<PointingGameView card={card} participantNames={names} />);

/** 假定时器逐秒推进：每走一秒都要让 React 重跑副作用，才会排下一个 tick。 */
function tick(times = 1) {
  for (let index = 0; index < times; index += 1) act(() => void vi.advanceTimersByTime(1000));
}

describe("PointingGameView", () => {
  beforeEach(() => {
    mockReducedMotion(false);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders the instruction card, pack label and pointer count", () => {
    view();
    expect(screen.getByText("指人游戏")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: card.content })).toBeInTheDocument();
    expect(screen.getByText(card.instruction!)).toBeInTheDocument();
    expect(screen.getByText(/3 人同时指/)).toBeInTheDocument();
  });

  it("waits for the host before counting down", () => {
    view();
    expect(screen.getByText("准备好了吗？")).toBeInTheDocument();
    expect(screen.queryByLabelText(/倒数/)).toBeNull();
    expect(screen.queryByLabelText("一起指")).toBeNull();
  });

  it("counts 3 → 2 → 1 and then shows the point prompt", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "准备好了" }));

    expect(screen.getByLabelText("倒数 3 秒")).toHaveTextContent("3");
    tick();
    expect(screen.getByLabelText("倒数 2 秒")).toHaveTextContent("2");
    tick();
    expect(screen.getByLabelText("倒数 1 秒")).toHaveTextContent("1");
    tick();
    expect(screen.getByLabelText("一起指")).toHaveTextContent("👉 指！");
    expect(screen.queryByLabelText(/倒数/)).toBeNull();
  });

  it("lets the host skip the countdown instead of waiting it out", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "准备好了" }));
    fireEvent.click(screen.getByRole("button", { name: /跳过倒数/ }));

    expect(screen.getByLabelText("一起指")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(5000));
    expect(screen.queryByLabelText(/倒数/)).toBeNull();
  });

  it("skips the animated countdown entirely under reduced motion", () => {
    mockReducedMotion(true);
    view();
    fireEvent.click(screen.getByRole("button", { name: "准备好了" }));

    expect(screen.getByLabelText("一起指")).toBeInTheDocument();
    expect(screen.queryByLabelText(/倒数/)).toBeNull();
  });

  it("never asks for votes or per-player answers to continue", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "准备好了" }));
    tick(3);

    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("button", { name: /投票|计票|加一票/ })).toBeNull();
    expect(screen.getByText(/不用统计票数/)).toBeInTheDocument();
  });

  it("restarts cleanly when the next card is dealt into the same view", () => {
    const { rerender } = view();
    fireEvent.click(screen.getByRole("button", { name: "准备好了" }));
    tick(3);
    expect(screen.getByLabelText("一起指")).toBeInTheDocument();

    // 主局按 `key={card.id}` 挂载 view，下一题到达时视图整体重来。
    rerender(<PointingGameView key="seed-pointing-game-2" card={{ ...card, id: "seed-pointing-game-2", content: "指一个最会照顾别人情绪的人。" }} participantNames={["Alex"]} />);
    expect(screen.getByText("准备好了吗？")).toBeInTheDocument();
    expect(screen.queryByLabelText("一起指")).toBeNull();
    expect(screen.getByRole("heading", { name: "指一个最会照顾别人情绪的人。" })).toBeInTheDocument();
  });

  it("keeps one primary at a time: 下一题/换一个 only appear after pointing", () => {
    const onComplete = vi.fn();
    const onSwap = vi.fn();
    render(<PointingGameView card={card} participantNames={["Alex"]} actions={{ onComplete, onSwap, onSkip: vi.fn() }} />);

    expect(screen.getByRole("button", { name: "准备好了" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /下一题/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "准备好了" }));
    expect(screen.getByRole("button", { name: /跳过倒数/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /下一题/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /跳过倒数/ }));
    fireEvent.click(screen.getByRole("button", { name: /下一题/ }));
    fireEvent.click(screen.getByRole("button", { name: /换一个/ }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onSwap).toHaveBeenCalledTimes(1);
  });
});
