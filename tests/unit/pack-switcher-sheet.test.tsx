import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PackSwitcherSheet } from "@/components/game/PackSwitcherSheet";
import { BUILTIN_GAME_PACKS } from "@/lib/game-packs/registry";

const packs = BUILTIN_GAME_PACKS.filter((pack) => ["never-have", "would-you-rather", "spin-bottle"].includes(pack.id));

const open = (props: Partial<Parameters<typeof PackSwitcherSheet>[0]> = {}) => {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(<PackSwitcherSheet open currentPackId="never-have" packs={packs} onSelect={onSelect} onClose={onClose} {...props} />);
  return { onSelect, onClose };
};

describe("PackSwitcherSheet", () => {
  it("renders only the candidates it is handed", () => {
    open();
    expect(screen.getByRole("dialog", { name: "切换玩法" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /二选一/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /转瓶子/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /谁最可能/ })).toBeNull();
  });

  it("marks the current pack and only the current pack", () => {
    open();
    const current = screen.getByRole("button", { name: /我从来没有/ });
    expect(current).toHaveAttribute("aria-current", "true");
    expect(current).toBeDisabled();
    expect(screen.getByRole("button", { name: /二选一/ })).not.toHaveAttribute("aria-current");
  });

  it("hands the tapped pack id to onSelect", () => {
    const { onSelect, onClose } = open();
    fireEvent.click(screen.getByRole("button", { name: /二选一/ }));
    expect(onSelect).toHaveBeenCalledWith("would-you-rather");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape and on backdrop tap", () => {
    const { onSelect, onClose } = open();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(document.querySelector(".sheet-backdrop")!);
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders nothing while closed", () => {
    open({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
