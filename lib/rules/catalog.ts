import { fingerGuessingRule } from "./entries/finger-guessing";
import { fifteenTwentyRule } from "./entries/fifteen-twenty";
import { kingsCupRule } from "./entries/kings-cup";
import { liarsDiceRule } from "./entries/liars-dice";
import { missCardRule } from "./entries/miss-card";
import { numberBombRule } from "./entries/number-bomb";
import { sevenPassRule } from "./entries/seven-pass";
import { threeGardensRule } from "./entries/three-gardens";
import { ruleEntrySchema, type RuleCategory, type RuleEntry } from "./types";

/**
 * 规则库首批 8 条（T176 / Spec §8 / FR-030）。
 * 顺序即列表展示顺序；全部为“常见版本”，非官方规则，house rules 以 variants 呈现（FR-032）。
 */
export const RULE_CATALOG: RuleEntry[] = [
  missCardRule,
  kingsCupRule,
  threeGardensRule,
  sevenPassRule,
  fifteenTwentyRule,
  liarsDiceRule,
  numberBombRule,
  fingerGuessingRule,
];

export function getRuleEntry(id: string): RuleEntry | undefined {
  return RULE_CATALOG.find((entry) => entry.id === id);
}

/** 分类 chips 的中文标签（T179，与 RuleCategory 一一对应）。 */
export const RULE_CATEGORY_LABELS: Record<RuleCategory, string> = {
  cards: "扑克",
  dice: "骰子",
  gesture: "手势",
  "no-prop": "无道具",
  other: "其他",
};

/**
 * 列表搜索/分类过滤（T179）。纯本地字符串匹配，命中标题、别名、摘要、道具与步骤说明；
 * 搜不到就返回空数组，让 UI 走空状态——规则库绝不联网猜规则（T183 / Spec §9）。
 */
export function filterRuleEntries(
  query: string,
  category?: RuleCategory,
  entries: RuleEntry[] = RULE_CATALOG,
): RuleEntry[] {
  const keyword = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (category && entry.category !== category) return false;
    if (!keyword) return true;
    const haystack = [
      entry.title,
      ...entry.aliases,
      entry.quickSummary,
      ...entry.props,
      ...entry.steps.map((step) => `${step.label ?? ""} ${step.detail}`),
    ].join(" ").toLowerCase();
    return haystack.includes(keyword);
  });
}

export interface RuleCatalogIssue {
  entryId: string;
  field: string;
  message: string;
}

/**
 * 校验聚合结果：id 唯一、必填字段完整、house-rule 项必须给出变体（FR-031/FR-032）。
 * 只报告问题、不抛错，避免坏数据直接把规则页打挂；测试与开发期用它做断言。
 */
export function validateRuleCatalog(entries: RuleEntry[] = RULE_CATALOG): RuleCatalogIssue[] {
  const issues: RuleCatalogIssue[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (seen.has(entry.id)) {
      issues.push({ entryId: entry.id, field: "id", message: `duplicate rule id: ${entry.id}` });
    }
    seen.add(entry.id);

    const parsed = ruleEntrySchema.safeParse(entry);
    if (!parsed.success) {
      issues.push({ entryId: entry.id, field: "schema", message: `entry does not match RuleEntry schema: ${entry.id}` });
      continue;
    }

    if (!entry.title.trim()) issues.push({ entryId: entry.id, field: "title", message: "title is required" });
    if (!entry.quickSummary.trim()) {
      issues.push({ entryId: entry.id, field: "quickSummary", message: "quickSummary is required" });
    }
    if (entry.steps.length === 0) {
      issues.push({ entryId: entry.id, field: "steps", message: "at least one step is required" });
    }
    if (entry.hasHouseRules && entry.variants.length === 0) {
      issues.push({ entryId: entry.id, field: "variants", message: "house-rule entry must document at least one variant" });
    }
  }

  return issues;
}

/** 模块加载时的自检结果：开发期/测试断言为空即数据健康。 */
export const RULE_CATALOG_ISSUES: RuleCatalogIssue[] = validateRuleCatalog();
