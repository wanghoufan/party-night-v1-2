import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { RuleList } from "@/components/packs/RuleList";
import { RULE_CATALOG } from "@/lib/rules/catalog";

/** V1.1 Phase 14 / T179 + T183：规则分区列表 UI。 */
describe("RuleList（T179：搜索 + 规则卡片 + 可选分类 chips）", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("规则库不得联网"))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("默认列出首批 8 条规则，每条都可点进详情", () => {
    render(<RuleList />);

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(RULE_CATALOG.map((entry) => `/packs/rules/${entry.id}`));
    for (const entry of RULE_CATALOG) expect(screen.getByText(entry.title)).toBeInTheDocument();
  });

  it("搜索框按标题/别名过滤列表", () => {
    render(<RuleList />);

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索规则" }), { target: { value: "大话骰" } });

    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /吹牛骰子/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /小姐牌/ })).toBeNull();
  });

  it("分类 chips 可筛选，且用 aria-pressed 标出当前分类", () => {
    render(<RuleList />);

    const chips = screen.getByRole("group", { name: "规则分类" });
    expect(within(chips).getByRole("button", { name: "全部" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(chips).getByRole("button", { name: "扑克" }));

    expect(within(chips).getByRole("button", { name: "扑克" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /数字炸弹/ })).toBeNull();
  });

  it("搜不到时显示空状态，且不调用 AI/网络（T183）", () => {
    render(<RuleList />);

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索规则" }), { target: { value: "绝不存在的玩法xyz" } });

    expect(screen.getByRole("heading", { name: "没有找到规则" })).toBeInTheDocument();
    expect(screen.getByText(/不联网猜规则/)).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("清空搜索后列表恢复", () => {
    render(<RuleList />);

    const search = screen.getByRole("searchbox", { name: "搜索规则" });
    fireEvent.change(search, { target: { value: "绝不存在的玩法xyz" } });
    fireEvent.change(search, { target: { value: "" } });

    expect(screen.queryByRole("heading", { name: "没有找到规则" })).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(8);
  });
});
