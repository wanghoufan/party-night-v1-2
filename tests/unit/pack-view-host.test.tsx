import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PackViewHost, packViewOwnsActions } from "@/components/game/PackViewHost";
import type { GameCard } from "@/lib/domain/schemas";

const base: Omit<GameCard, "id" | "packId" | "type" | "content"> = { intensity: 2, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "all", source: "builtin" };

const wyrCard: GameCard = { ...base, id: "w1", packId: "would-you-rather", type: "would-you-rather", content: "奶茶加珍珠 VS 咖啡加双份糖" };
const truthCard: GameCard = { ...base, id: "t1", packId: "truth-dare", type: "truth", content: "最近一次让你笑到停不下来的事是什么？" };
const pointingCard: GameCard = { ...base, id: "p1", packId: "pointing-game", type: "pointing", content: "指一个你觉得今晚最有梗的人。", minPlayers: 3 };
const compatCard: GameCard = { ...base, id: "c1", packId: "compatibility-test", type: "compatibility", content: "对方最讨厌的食物是什么？", participantMode: "pair" };

const players = [{ id: "alex", displayName: "Alex", active: true, createdAt: "x", lastUsedAt: "x" }, { id: "emma", displayName: "Emma", active: true, createdAt: "x", lastUsedAt: "x" }];

const actions = () => ({ onComplete: vi.fn(), onSwap: vi.fn(), onSkip: vi.fn() });

describe("PackViewHost", () => {
  it("renders the binary-choice view for 二选一 and wires the shared engine actions", () => {
    const handlers = actions();
    render(<PackViewHost packId="would-you-rather" card={wyrCard} participantNames={[]} actions={handlers} />);
    expect(screen.getByText("奶茶加珍珠")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一题" }));
    fireEvent.click(screen.getByRole("button", { name: "换一个" }));
    expect(handlers.onComplete).toHaveBeenCalledTimes(1);
    expect(handlers.onSwap).toHaveBeenCalledTimes(1);
  });

  it("keeps the generic card view for the default renderer", () => {
    render(<PackViewHost packId="truth-dare" card={truthCard} participantNames={["玩家 1", "玩家 2"]} actions={actions()} />);
    expect(screen.getByRole("heading", { name: truthCard.content })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下一题" })).toBeNull();
  });

  it("renders the pointing view for 指人游戏 and wires the shared engine actions", () => {
    const handlers = actions();
    render(<PackViewHost packId="pointing-game" card={pointingCard} participantNames={["玩家 1", "玩家 2", "玩家 3"]} actions={handlers} />);
    expect(screen.getByText("指人游戏")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "准备好了" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "准备好了" }));
    fireEvent.click(screen.getByRole("button", { name: /跳过倒数/ }));
    fireEvent.click(screen.getByRole("button", { name: "下一题" }));
    expect(handlers.onComplete).toHaveBeenCalledTimes(1);
  });

  it("renders the compatibility view for 默契测试 with pair context and shared actions", () => {
    const handlers = actions();
    const onAnswer = vi.fn();
    const onComplete = handlers.onComplete;
    render(
      <PackViewHost
        packId="compatibility-test"
        card={compatCard}
        participantNames={["Alex", "Emma"]}
        actions={handlers}
        compatibility={{ players, pair: { playerAId: "alex", playerBId: "emma", names: { a: "Alex", b: "Emma" }, state: { playerAId: "alex", playerBId: "emma", score: 2, rounds: 3 } }, onChangePair: vi.fn(), onAnswer }}
      />,
    );
    expect(screen.getByText("默契测试")).toBeInTheDocument();
    expect(screen.getByText(/Alex × Emma/)).toBeInTheDocument();
    expect(screen.getByText(/默契 2\/3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "一样 ❤️" }));
    expect(onAnswer).toHaveBeenCalledWith("same");
    fireEvent.click(screen.getByRole("button", { name: "下一题" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("renders the spin view for 转瓶子 without needing a card, and wires its own actions", () => {
    // reduced-motion：跳过旋转表演，落点立即揭晓（动画过程由 spin-bottle-view.test.tsx 覆盖），
    // 这样这里只验证 host 把视图和它自己的动作接上了。
    const original = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({ matches: query.includes("prefers-reduced-motion"), media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }),
    });
    try {
      const onSpin = vi.fn(() => players[0]);
      const onChain = vi.fn();
      render(<PackViewHost packId="spin-bottle" participantNames={[]} spin={{ players, onSpin, onChain }} />);
      expect(screen.getByText("转瓶子")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "开始旋转" }));
      expect(onSpin).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "真心话" }));
      expect(onChain).toHaveBeenCalledWith("truth");
    } finally {
      Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: original });
    }
  });

  it("falls back to the generic card view for unknown packs", () => {
    render(<PackViewHost packId="custom-unknown" card={truthCard} participantNames={[]} actions={actions()} />);
    expect(screen.getByRole("heading", { name: truthCard.content })).toBeInTheDocument();
  });
});

describe("packViewOwnsActions", () => {
  it("reports which renderers carry their own action bar", () => {
    expect(packViewOwnsActions("would-you-rather")).toBe(true);
    expect(packViewOwnsActions("pointing-game")).toBe(true);
    expect(packViewOwnsActions("compatibility-test")).toBe(true);
    expect(packViewOwnsActions("spin-bottle")).toBe(true);
    expect(packViewOwnsActions("truth-dare")).toBe(false);
    expect(packViewOwnsActions("custom-unknown")).toBe(false);
  });
});
