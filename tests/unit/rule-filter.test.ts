import { describe, expect, it } from "vitest";
import { RULE_CATALOG, RULE_CATEGORY_LABELS, filterRuleEntries } from "@/lib/rules/catalog";

/** V1.1 Phase 14 / T179 + T183：规则库搜索与分类过滤（纯函数，本地、无 AI）。 */
describe("规则库搜索/分类过滤（T179/T183）", () => {
  it("空查询、不限分类时返回全部 8 条", () => {
    expect(filterRuleEntries("")).toHaveLength(8);
    expect(filterRuleEntries("   ")).toHaveLength(8);
  });

  it("按标题命中", () => {
    expect(filterRuleEntries("小姐牌").map((entry) => entry.id)).toEqual(["miss-card"]);
  });

  it("按别名命中（金陵十三钗 → 小姐牌）", () => {
    expect(filterRuleEntries("金陵十三钗").map((entry) => entry.id)).toEqual(["miss-card"]);
    expect(filterRuleEntries("大话骰").map((entry) => entry.id)).toEqual(["liars-dice"]);
  });

  it("按 30 秒摘要命中", () => {
    for (const entry of RULE_CATALOG) {
      const keyword = entry.quickSummary.slice(0, 4);
      expect(filterRuleEntries(keyword).map((item) => item.id), `${entry.id} 应能被摘要关键词命中`).toContain(entry.id);
    }
  });

  it("忽略大小写与首尾空格", () => {
    expect(filterRuleEntries("  king's cup  ").map((entry) => entry.id)).toContain("kings-cup");
    expect(filterRuleEntries("RING OF FIRE").map((entry) => entry.id)).toContain("kings-cup");
  });

  it("搜不到时返回空数组，不猜规则", () => {
    expect(filterRuleEntries("绝不存在的玩法xyz")).toEqual([]);
  });

  it("分类过滤只留该类的规则", () => {
    expect(filterRuleEntries("", "cards").map((entry) => entry.id)).toEqual(["miss-card", "kings-cup"]);
    expect(filterRuleEntries("", "dice").map((entry) => entry.id)).toEqual(["liars-dice"]);
    expect(filterRuleEntries("", "gesture").map((entry) => entry.id)).toEqual(["fifteen-twenty", "finger-guessing"]);
    expect(filterRuleEntries("", "no-prop")).toHaveLength(3);
    expect(filterRuleEntries("", "other")).toEqual([]);
  });

  it("分类与查询同时生效", () => {
    expect(filterRuleEntries("十五二十", "gesture").map((entry) => entry.id)).toEqual(["fifteen-twenty"]);
    expect(filterRuleEntries("十五二十", "cards")).toEqual([]);
  });

  it("提供全部 5 个分类的中文标签", () => {
    expect(RULE_CATEGORY_LABELS).toEqual({ cards: "扑克", dice: "骰子", gesture: "手势", "no-prop": "无道具", other: "其他" });
  });
});
