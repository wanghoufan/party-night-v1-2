import { RuleDetailView } from "@/components/packs/RuleDetailView";
import { RULE_CATALOG } from "@/lib/rules/catalog";

/**
 * 规则详情路由（T180 / Plan §4：packs/rules/[ruleId]）。
 * B-1 自包含 Release：规则目录是静态 typed catalog，全部条目在这里预渲染（generateStaticParams），
 * 静态导出下 WebView 内的客户端跳转才能拿到对应的 RSC 载荷；dynamicParams=false 与 output: export 兼容。
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return RULE_CATALOG.map((entry) => ({ ruleId: entry.id }));
}

export default function RuleDetailPage() {
  return <RuleDetailView />;
}
