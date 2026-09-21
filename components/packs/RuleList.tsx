"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Tag } from "@/components/ui/Tag";
import { RULE_CATEGORY_LABELS, RULE_CATALOG, filterRuleEntries } from "@/lib/rules/catalog";
import type { RuleCategory, RuleEntry } from "@/lib/rules/types";

const CATEGORY_ORDER: RuleCategory[] = ["cards", "dice", "gesture", "no-prop", "other"];

/**
 * 游戏包内的规则分区（T179 / US8）：搜索 + 可选分类 chips + 规则卡片。
 * 全部数据来自本地 typed catalog，搜索纯字符串匹配，不联网、不调 AI（T183）。
 */
export function RuleList({ entries = RULE_CATALOG }: { entries?: RuleEntry[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<RuleCategory>();
  const visible = useMemo(() => filterRuleEntries(query, category, entries), [query, category, entries]);
  const categories = useMemo(
    () => CATEGORY_ORDER.filter((item) => entries.some((entry) => entry.category === item)),
    [entries],
  );

  return (
    <>
      <section aria-label="搜索规则">
        <label className="rule-search">
          <Icon name="search" />
          <input
            type="search"
            aria-label="搜索规则"
            placeholder="搜玩法名、别名或关键词"
            value={query}
            maxLength={40}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="rule-chips" role="group" aria-label="规则分类">
          <button type="button" aria-pressed={!category} onClick={() => setCategory(undefined)}>全部</button>
          {categories.map((item) => (
            <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(category === item ? undefined : item)}>
              {RULE_CATEGORY_LABELS[item]}
            </button>
          ))}
        </div>
      </section>
      {visible.length
        ? <div className="rule-list">{visible.map((entry) => <RuleCard key={entry.id} entry={entry} />)}</div>
        : <div className="empty-custom-pack"><Icon name="cube" /><h3>没有找到规则</h3><p>换个名字或清掉分类试试。规则库只收常见线下玩法，不联网猜规则。</p></div>}
    </>
  );
}

function RuleCard({ entry }: { entry: RuleEntry }) {
  return (
    <Link className="rule-card" href={`/packs/rules/${entry.id}`}>
      <span className="rule-card__head">
        <strong>{entry.title}</strong>
        <Tag>{RULE_CATEGORY_LABELS[entry.category]}</Tag>
      </span>
      {entry.aliases.length > 0 && <small>又叫 {entry.aliases.join(" / ")}</small>}
      <p>{entry.quickSummary}</p>
      <span className="rule-card__meta">
        {entry.playerRange && <span>{entry.playerRange}</span>}
        {entry.hasHouseRules && <span className="rule-card__variant">常见变体</span>}
      </span>
      <Icon name="chevron" />
    </Link>
  );
}
