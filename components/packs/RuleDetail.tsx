"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { RULE_CATEGORY_LABELS } from "@/lib/rules/catalog";
import type { RuleEntry } from "@/lib/rules/types";

/**
 * 规则详情（T180 / T181 / Plan §10.2）：顺序固定为
 * 标题+别名 → 道具/人数/类别 → 30 秒看懂 → 详细规则／牌义 → 常见变体 → 地区差异提示。
 * 线下玩法只作参考：不给“开始手机游戏”主 CTA，只保留返回（FR-033）。
 */
export function RuleDetail({ entry }: { entry: RuleEntry }) {
  return (
    <>
      <header className="screen-header">
        <Link href="/packs?tab=rules" aria-label="返回规则库"><Icon name="back" /></Link>
        <h1>{entry.title}</h1>
        <span />
      </header>
      {entry.aliases.length > 0 && <p className="rule-detail__aliases">又叫 {entry.aliases.join(" / ")}</p>}

      <dl className="rule-detail__meta" role="group" aria-label="规则信息">
        <div><dt>道具</dt><dd>{entry.props.length ? <ul>{entry.props.map((prop) => <li key={prop}>{prop}</li>)}</ul> : "无需道具"}</dd></div>
        <div><dt>人数</dt><dd>{entry.playerRange ?? "不限"}</dd></div>
        <div><dt>类别</dt><dd>{RULE_CATEGORY_LABELS[entry.category]}</dd></div>
      </dl>

      <section className="rule-detail__section" aria-label="30 秒看懂">
        <h2>30 秒看懂</h2>
        <p className="rule-detail__summary">{entry.quickSummary}</p>
      </section>

      <section className="rule-detail__section" aria-label="详细规则／牌义">
        <h2>详细规则／牌义</h2>
        <ol className="rule-detail__steps">
          {entry.steps.map((step, index) => (
            <li key={`${step.label ?? "step"}-${index}`}>
              {step.label && <span className="rule-detail__label">{step.label}</span>}
              <span>{step.detail}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="rule-detail__section" aria-label="常见变体">
        <h2>常见变体</h2>
        {entry.hasHouseRules && <p className="rule-detail__notice">规则可能因地区或酒局不同，开局前请同桌统一口径。</p>}
        <ul className="rule-detail__variants">
          {entry.variants.map((variant) => (
            <li key={variant.name}>
              <strong>{variant.name}{variant.region ? `（${variant.region}）` : ""}</strong>
              <span>{variant.detail}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
