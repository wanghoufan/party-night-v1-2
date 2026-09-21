import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PackSegmentedTabs } from "@/components/packs/PackSegmentedTabs";

describe("PackSegmentedTabs（T163：我的游戏包 玩法/规则 二级切换）", () => {
  it("只放两个分区，不新增底部 Tab 之外的第三个", () => {
    render(<PackSegmentedTabs value="packs" onChange={() => {}} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["玩法", "规则"]);
  });

  it("当前分区用 aria-pressed 标出，默认是玩法", () => {
    render(<PackSegmentedTabs value="packs" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "玩法" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "规则" })).toHaveAttribute("aria-pressed", "false");
  });

  it("点规则回传 rules，点玩法回传 packs", () => {
    const onChange = vi.fn();
    const { rerender } = render(<PackSegmentedTabs value="packs" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "规则" }));
    expect(onChange).toHaveBeenLastCalledWith("rules");

    rerender(<PackSegmentedTabs value="rules" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "玩法" }));
    expect(onChange).toHaveBeenLastCalledWith("packs");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("已在该分区时点自己不重复回传", () => {
    const onChange = vi.fn();
    render(<PackSegmentedTabs value="rules" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "规则" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
