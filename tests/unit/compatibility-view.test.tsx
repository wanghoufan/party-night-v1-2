import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CompatibilityPairPicker } from "@/components/game/CompatibilityPairPicker";
import { CompatibilityView } from "@/components/game/CompatibilityView";
import type { GameCard, Player } from "@/lib/domain/schemas";

const card: GameCard = {
  id: "seed-compatibility-test-1",
  packId: "compatibility-test",
  type: "compatibility",
  content: "我们第一次见面时，对方穿的是什么颜色？",
  instruction: "两人同时回答，看是否一样",
  intensity: 1,
  tags: [],
  boundaryTags: [],
  minPlayers: 2,
  participantMode: "pair",
  source: "builtin",
};

const roster = (spec: Array<[string, string, boolean]>): Player[] =>
  spec.map(([id, displayName, active]) => ({ id, displayName, active, createdAt: "x", lastUsedAt: "x" }));

const pair = {
  playerAId: "alex", playerBId: "emma",
  names: { a: "Alex", b: "Emma" },
  state: { playerAId: "alex", playerBId: "emma", score: 4, rounds: 5 },
};

const actions = () => ({ onComplete: vi.fn(), onSwap: vi.fn(), onSkip: vi.fn() });

const rosterTwo = () => roster([["alex", "Alex", true], ["emma", "Emma", true]]);

/** 主局传给默契测试视图的配对上下文（players + pair + 回调），与 PackViewProps.compatibility 同形。 */
const compat = (overrides: Partial<{ onAnswer: ReturnType<typeof vi.fn>; onChangePair: ReturnType<typeof vi.fn>; pair: typeof pair | undefined; players: Player[] }> = {}) => ({
  players: overrides.players ?? rosterTwo(),
  pair: "pair" in overrides ? overrides.pair : pair,
  onChangePair: overrides.onChangePair ?? vi.fn(),
  onAnswer: overrides.onAnswer ?? vi.fn(),
});

describe("CompatibilityPairPicker (T145)", () => {
  it("defaults to the first two active players and lists them as choices", () => {
    render(<CompatibilityPairPicker players={roster([["alex", "Alex", true], ["emma", "Emma", true], ["kai", "Kai", true]])} value={pair} onChange={vi.fn()} />);
    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.getByText("Emma")).toBeInTheDocument();
    expect(screen.getByText("Kai")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Alex/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Emma/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("excludes inactive players from the selectable roster", () => {
    render(<CompatibilityPairPicker players={roster([["alex", "Alex", true], ["emma", "Emma", true], ["kai", "Kai", false]])} value={pair} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Kai/ })).toBeNull();
  });

  it("reports the disabled state when fewer than two active players remain", () => {
    render(<CompatibilityPairPicker players={roster([["alex", "Alex", true], ["emma", "Emma", false]])} value={pair} onChange={vi.fn()} />);
    expect(screen.getByText(/至少需要 2 名在场玩家/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Alex/ })).toBeNull();
  });

  it("emits the new pair when the host taps a third player to swap one side", () => {
    const onChange = vi.fn();
    render(<CompatibilityPairPicker players={roster([["alex", "Alex", true], ["emma", "Emma", true], ["kai", "Kai", true]])} value={pair} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Kai/ }));
    expect(onChange).toHaveBeenCalledWith("kai");
  });
});

describe("CompatibilityView (T146)", () => {
  it("shows the pair,默契 score/rounds and question before the host judges", () => {
    render(<CompatibilityView card={card} participantNames={[]} compatibility={compat()} />);
    expect(screen.getByText("默契测试")).toBeInTheDocument();
    expect(screen.getByText(/Alex × Emma/)).toBeInTheDocument();
    expect(screen.getByText(/默契 4\/5/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: card.content })).toBeInTheDocument();
    expect(screen.getByText("3 · 2 · 1 同时回答")).toBeInTheDocument();
  });

  it("offers only 一样/不一样 as the host judgement, one primary at a time", () => {
    render(<CompatibilityView card={card} participantNames={[]} compatibility={compat()} />);
    expect(screen.getByRole("button", { name: "一样 ❤️" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "不一样 😂" })).toBeInTheDocument();
    // 单机同桌口头回答：没有任何秘密输入控件
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("calls back with same/different and lets the host jump in without the countdown", () => {
    const onAnswer = vi.fn();
    render(<CompatibilityView card={card} participantNames={[]} compatibility={compat({ onAnswer })} />);
    fireEvent.click(screen.getByRole("button", { name: "一样 ❤️" }));
    expect(onAnswer).toHaveBeenCalledWith("same");
    fireEvent.click(screen.getByRole("button", { name: "不一样 😂" }));
    expect(onAnswer).toHaveBeenCalledWith("different");
  });

  it("wires 下一题/换一个 through the shared engine actions", () => {
    const handlers = actions();
    render(<CompatibilityView card={card} participantNames={[]} compatibility={compat()} actions={handlers} />);
    fireEvent.click(screen.getByRole("button", { name: "下一题" }));
    fireEvent.click(screen.getByRole("button", { name: "换一个" }));
    expect(handlers.onComplete).toHaveBeenCalledTimes(1);
    expect(handlers.onSwap).toHaveBeenCalledTimes(1);
  });

  it("falls back to the picker copy when there is no pair yet", () => {
    render(<CompatibilityView card={card} participantNames={[]} compatibility={compat({ pair: undefined })} />);
    expect(screen.getByText(/先选两位玩家/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "一样 ❤️" })).toBeDisabled();
  });
});
