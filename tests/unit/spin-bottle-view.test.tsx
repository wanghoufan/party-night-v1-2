import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SpinBottleView } from "@/components/game/SpinBottleView";
import type { Player } from "@/lib/domain/schemas";

const roster = (spec: Array<[string, string, boolean]>): Player[] =>
  spec.map(([id, displayName, active]) => ({ id, displayName, active, createdAt: "x", lastUsedAt: "x" }));

const table = () => roster([["p1", "Alex", true], ["p2", "Emma", true], ["p3", "Kai", true]]);

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

const spinButton = () => screen.getByRole("button", { name: "开始旋转" });

/** 主局传给转瓶子视图的上下文：落点已由主局定下并落库，视图只负责播动画与给去向。 */
const handlers = (overrides: Partial<Parameters<typeof SpinBottleView>[0]["spin"]> = {}) => ({
  players: table(),
  lastSelectedPlayerId: undefined,
  onSpin: vi.fn(() => table()[0]),
  onChain: vi.fn(),
  ...overrides,
});

/** 假定时器跑完旋转动画：每一步都让 React 重跑副作用。 */
function settleSpin(ms = 2000) {
  act(() => void vi.advanceTimersByTime(ms));
}

describe("SpinBottleView (T151)", () => {
  beforeEach(() => {
    mockReducedMotion(false);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts in the stable ready state with the whole table shown and no result yet", () => {
    render(<SpinBottleView spin={handlers()} />);
    expect(screen.getByText("转瓶子")).toBeInTheDocument();
    for (const name of ["Alex", "Emma", "Kai"]) expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.queryByText(/🎯/)).toBeNull();
    expect(screen.queryByRole("button", { name: "真心话" })).toBeNull();
  });

  it("decides the target first, then plays the pointing animation to that target", () => {
    const onSpin = vi.fn(() => table()[2]);
    render(<SpinBottleView spin={handlers({ onSpin })} />);

    fireEvent.click(spinButton());
    // 结果已经定下（主局已落库），但动画期间不揭晓
    expect(onSpin).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/🎯/)).toBeNull();
    expect(document.querySelector(".spin-bottle")).toHaveAttribute("data-phase", "spinning");
    // 动画指向的就是那个 target，而不是动画结束时再随机
    expect(document.querySelector(".spin-bottle__seat--on")).toHaveTextContent("Kai");

    settleSpin();
    expect(screen.getByText("🎯 Kai")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "开始旋转" })).toBeNull();
  });

  it("offers 真心话 / 大冒险 / 再转一次 on the result page and never asks for input", () => {
    const onChain = vi.fn();
    render(<SpinBottleView spin={handlers({ onChain })} />);
    fireEvent.click(spinButton());
    settleSpin();

    fireEvent.click(screen.getByRole("button", { name: "真心话" }));
    expect(onChain).toHaveBeenCalledWith("truth");
    fireEvent.click(screen.getByRole("button", { name: "大冒险" }));
    expect(onChain).toHaveBeenCalledWith("dare");

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("再转一次 spins again and reveals the freshly decided target", () => {
    const onSpin = vi.fn().mockReturnValueOnce(table()[0]).mockReturnValueOnce(table()[1]);
    render(<SpinBottleView spin={handlers({ onSpin })} />);

    fireEvent.click(spinButton());
    settleSpin();
    expect(screen.getByText("🎯 Alex")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "再转一次" }));
    settleSpin();
    expect(onSpin).toHaveBeenCalledTimes(2);
    expect(screen.getByText("🎯 Emma")).toBeInTheDocument();
  });

  it("skips the rotation entirely under reduced motion", () => {
    mockReducedMotion(true);
    render(<SpinBottleView spin={handlers()} />);
    fireEvent.click(spinButton());

    expect(screen.getByText("🎯 Alex")).toBeInTheDocument();
    expect(document.querySelector(".spin-bottle")).toHaveAttribute("data-phase", "result");
  });

  it("restores the persisted target after a refresh instead of replaying a half-finished spin", () => {
    render(<SpinBottleView spin={handlers({ lastSelectedPlayerId: "p2" })} />);
    expect(document.querySelector(".spin-bottle")).toHaveAttribute("data-phase", "result");
    expect(screen.getByText("🎯 Emma")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再转一次" })).toBeInTheDocument();
  });

  it("stays ready when there is nobody to point at", () => {
    render(<SpinBottleView spin={handlers({ onSpin: vi.fn(() => undefined) })} />);
    fireEvent.click(spinButton());
    expect(document.querySelector(".spin-bottle")).toHaveAttribute("data-phase", "ready");
    expect(screen.queryByText(/🎯/)).toBeNull();
  });
});
