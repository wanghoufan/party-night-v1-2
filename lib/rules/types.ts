import { z } from "zod";

/**
 * 规则库数据契约（Spec §7 RuleEntry / Plan §10 Rule Library，FR-029–033）。
 * 首批 8 条以 typed catalog 形式内联，离线可用、可审查、无需后端。
 */

export const ruleCategorySchema = z.enum(["cards", "dice", "gesture", "no-prop", "other"]);
export type RuleCategory = z.infer<typeof ruleCategorySchema>;

/** 一步规则：可选步骤/牌面标签 + 说明。牌类游戏的每个牌面就是一个 step。 */
export const ruleStepSchema = z.object({
  label: z.string().min(1).max(20).optional(),
  detail: z.string().min(1).max(200),
});
export type RuleStep = z.infer<typeof ruleStepSchema>;

/** 常见变体：house rule / 地域差异的口径说明，不是官方规则。 */
export const ruleVariantSchema = z.object({
  name: z.string().min(1).max(30),
  region: z.string().min(1).max(20).optional(),
  detail: z.string().min(1).max(200),
});
export type RuleVariant = z.infer<typeof ruleVariantSchema>;

export const ruleEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(40),
  aliases: z.array(z.string().min(1).max(30)).default([]),
  category: ruleCategorySchema,
  props: z.array(z.string().min(1).max(20)),
  playerRange: z.string().min(1).max(20).optional(),
  quickSummary: z.string().min(1).max(120),
  steps: z.array(ruleStepSchema).min(1),
  variants: z.array(ruleVariantSchema).default([]),
  hasHouseRules: z.boolean().default(false),
});
export type RuleEntry = z.infer<typeof ruleEntrySchema>;

/** 条目定义入口：解析 + 补默认值，保证 catalog 里每条都字段完整。 */
export function defineRuleEntry(entry: z.input<typeof ruleEntrySchema>): RuleEntry {
  return ruleEntrySchema.parse(entry);
}
