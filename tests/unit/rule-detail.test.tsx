import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { RuleDetail } from "@/components/packs/RuleDetail";
import { getRuleEntry } from "@/lib/rules/catalog";

const missCard = getRuleEntry("miss-card")!;
const sevenPass = getRuleEntry("seven-pass")!;

/** V1.1 Phase 14 / T180 + T181：规则详情 UI 合同（Plan §10.2 固定顺序）。 */
describe("RuleDetail（T180：标题别名/道具/人数/30 秒看懂/详细规则/常见变体）", () => {
  it("先给标题与别名", () => {
    render(<RuleDetail entry={missCard} />);

    expect(screen.getByRole("heading", { level: 1, name: missCard.title })).toBeInTheDocument();
    const aliases = screen.getByText(/又叫/);
    for (const alias of missCard.aliases) expect(aliases).toHaveTextContent(alias);
  });

  it("给出道具、人数与类别", () => {
    render(<RuleDetail entry={missCard} />);

    const meta = screen.getByRole("group", { name: "规则信息" });
    expect(within(meta).getByText("道具")).toBeInTheDocument();
    expect(within(meta).getByText("人数")).toBeInTheDocument();
    expect(within(meta).getByText("类别")).toBeInTheDocument();
    expect(within(meta).getByText(missCard.playerRange!)).toBeInTheDocument();
    expect(within(meta).getByText("扑克")).toBeInTheDocument();
    for (const prop of missCard.props) expect(within(meta).getByText(prop)).toBeInTheDocument();
  });

  it("有“30 秒看懂”一段，直接给一句话规则", () => {
    render(<RuleDetail entry={missCard} />);

    const section = screen.getByRole("region", { name: "30 秒看懂" });
    expect(within(section).getByText(missCard.quickSummary)).toBeInTheDocument();
  });

  it("详细规则/牌义逐步列出，带牌面标签", () => {
    render(<RuleDetail entry={missCard} />);

    const section = screen.getByRole("region", { name: "详细规则／牌义" });
    const items = within(section).getAllByRole("listitem");
    expect(items).toHaveLength(missCard.steps.length);
    expect(within(section).getByText("小姐牌：抽到者成为“小姐”", { exact: false })).toBeInTheDocument();
    expect(within(items[0]!).getByText("A")).toBeInTheDocument();
  });

  it("列出常见变体，并标出地区/house rules 提示（FR-032）", () => {
    render(<RuleDetail entry={missCard} />);

    const section = screen.getByRole("region", { name: "常见变体" });
    expect(within(section).getAllByRole("listitem")).toHaveLength(missCard.variants.length);
    expect(within(section).getByText(missCard.variants[0]!.name, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/因地区|因地区或酒局|各地区|house rule/i)).toBeInTheDocument();
  });

  it("没有 house rules 的玩法不硬贴地区提示", () => {
    render(<RuleDetail entry={sevenPass} />);

    expect(screen.queryByText(/因地区或酒局不同/)).toBeNull();
    expect(screen.getByRole("region", { name: "常见变体" })).toBeInTheDocument();
  });

  it("不给“开始手机游戏”主 CTA，只留返回（T181 / FR-033）", () => {
    render(<RuleDetail entry={missCard} />);

    expect(screen.queryByRole("link", { name: /开始/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /开始/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /玩一局|进游戏|加入主局/ })).toBeNull();
    expect(screen.getByRole("link", { name: "返回规则库" })).toHaveAttribute("href", "/packs?tab=rules");
  });
});
