"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NeonBackground } from "@/components/brand/NeonBackground";
import { PackSegmentedTabs, type PacksTabId } from "@/components/packs/PackSegmentedTabs";
import { PartyToolsSection } from "@/components/tools/PartyToolsSection";
import { BottomTabBar } from "@/components/ui/BottomTabBar";
import { Icon } from "@/components/ui/Icon";
import { Toggle } from "@/components/ui/Toggle";
import { packIconName } from "@/components/game/pack-icon";
import { BUILTIN_GAME_PACKS } from "@/lib/game-packs/registry";
import type { CustomGamePack } from "@/lib/domain/schemas";
import { gamePackRepository } from "@/lib/storage/game-pack-repository";

export default function PacksPage() {
  const [tab, setTab] = useState<PacksTabId>("packs");
  const [custom, setCustom] = useState<CustomGamePack[]>([]);
  useEffect(() => { void gamePackRepository.list().then(setCustom); }, []);
  async function toggle(pack: CustomGamePack, enabled: boolean) { const next = { ...pack, enabled, updatedAt: new Date().toISOString() }; await gamePackRepository.save(next); setCustom((items) => items.map((item) => item.definition.id === pack.definition.id ? next : item)); }
  async function remove(id: string) { await gamePackRepository.delete(id); setCustom((items) => items.filter((item) => item.definition.id !== id)); }
  // 内置玩法的启用状态沿用现有 registry 语义（内置恒启用，禁用内置属 FR-044/T199 的后续任务），
  // 所以内置行继续标「已启用」，只有自定义玩法带 Toggle；本轮不新增第二套内置禁用存储。
  return <NeonBackground><main className="screen packs-screen"><header className="screen-header"><Link href="/" aria-label="返回首页"><Icon name="back" /></Link><h1>我的游戏包</h1><Link href="/packs/new" aria-label="新建游戏包"><Icon name="plus" /></Link></header><PackSegmentedTabs value={tab} onChange={setTab} />
    {tab === "packs" ? <><section><h2>内置玩法</h2><div className="pack-list">{BUILTIN_GAME_PACKS.map((pack) => <article key={pack.id}><Icon name={packIconName(pack.icon)} /><span><strong>{pack.name}</strong><small>{pack.supportedCardTypes.join(" · ")}</small></span><span className="tag">已启用</span></article>)}</div></section><PartyToolsSection /><section><div className="pack-section-heading"><h2>自定义玩法</h2><Link href="/packs/new">＋ 新建</Link></div>{custom.length ? <div className="pack-list">{custom.map((pack) => <article key={pack.definition.id}><span className="pack-emoji">{pack.definition.icon}</span><Link href={`/packs/${pack.definition.id}`}><strong>{pack.definition.name}</strong><small>{pack.cards.length} 张题卡</small></Link><Toggle aria-label={`启用${pack.definition.name}`} checked={pack.enabled} onChange={(event) => void toggle(pack, event.target.checked)} /><button type="button" aria-label={`删除${pack.definition.name}`} onClick={() => void remove(pack.definition.id)}><Icon name="trash" /></button></article>)}</div> : <div className="empty-custom-pack"><Icon name="cube" /><h3>保存你们自己的梗</h3><p>创建本地游戏包，之后每一局都能加入混合模式。</p><Link className="button button--primary" href="/packs/new">创建第一个游戏包</Link></div>}</section></> : <RulesPane />}
  </main><BottomTabBar /></NeonBackground>;
}

/**
 * 规则分区（T163 占位）：规则库内容由 US8 后续任务填充，这里只保证分区存在且不假装已上线，
 * 因此不给“开始游戏”主 CTA，也不塞任何编造的规则文本。
 */
function RulesPane() {
  return <section aria-label="规则"><div className="empty-custom-pack"><Icon name="cube" /><h3>规则库整理中</h3><p>小姐牌、King&apos;s Cup、逛三园、逢七过这些线下玩法会按“30 秒看懂”整理在这里，只作参考，不强行搬到手机上。</p></div></section>;
}
