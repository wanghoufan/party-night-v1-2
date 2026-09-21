"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { NeonBackground } from "@/components/brand/NeonBackground";
import { RuleDetail } from "@/components/packs/RuleDetail";
import { BottomTabBar } from "@/components/ui/BottomTabBar";
import { getRuleEntry } from "@/lib/rules/catalog";

/** 规则详情路由（T180 / Plan §4：packs/rules/[ruleId]）。目录是静态 typed catalog，纯本地渲染。 */
export default function RuleDetailPage() {
  const entry = getRuleEntry(String(useParams().ruleId));

  return (
    <NeonBackground>
      <main className="screen rule-detail">
        {entry
          ? <RuleDetail entry={entry} />
          : <div className="empty-custom-pack"><h3>没有这条规则</h3><p>它可能已经改名或不在首批 8 条里。</p><Link href="/packs?tab=rules">回到规则库</Link></div>}
      </main>
      <BottomTabBar />
    </NeonBackground>
  );
}
