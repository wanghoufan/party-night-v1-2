"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { NeonBackground } from "@/components/brand/NeonBackground";
import { PackSegmentedTabs, type PacksTabId } from "@/components/packs/PackSegmentedTabs";
import { RuleList } from "@/components/packs/RuleList";
import { PartyToolsSection } from "@/components/tools/PartyToolsSection";
import { BottomTabBar } from "@/components/ui/BottomTabBar";
import { Icon } from "@/components/ui/Icon";
import { Toggle } from "@/components/ui/Toggle";
import { packIconName } from "@/components/game/pack-icon";
import { BUILTIN_GAME_PACKS } from "@/lib/game-packs/registry";
import type { CustomGamePack } from "@/lib/domain/schemas";
import { gamePackRepository } from "@/lib/storage/game-pack-repository";
import { loadDisabledPackIds, setPackEnabled } from "@/lib/storage/pack-enablement";

export default function PacksPage() {
  return <Suspense fallback={<NeonBackground><main className="screen packs-screen"><p>正在读取游戏包…</p></main></NeonBackground>}><PacksPageContent /></Suspense>;
}

function PacksPageContent() {
  const [tab, setTab] = useState<PacksTabId>(useSearchParams().get("tab") === "rules" ? "rules" : "packs");
  const [custom, setCustom] = useState<CustomGamePack[]>([]);
  const [disabledPackIds, setDisabledPackIds] = useState<string[]>([]);
  useEffect(() => { void gamePackRepository.list().then(setCustom); }, []);
  useEffect(() => { void loadDisabledPackIds().then(setDisabledPackIds); }, []);
  async function toggle(pack: CustomGamePack, enabled: boolean) { const next = { ...pack, enabled, updatedAt: new Date().toISOString() }; await gamePackRepository.save(next); setCustom((items) => items.map((item) => item.definition.id === pack.definition.id ? next : item)); }
  async function toggleBuiltin(packId: string, enabled: boolean) { setDisabledPackIds(await setPackEnabled(packId, enabled)); }
  async function remove(id: string) { await gamePackRepository.delete(id); setCustom((items) => items.filter((item) => item.definition.id !== id)); }
  // 内置玩法也走同一套启用语义（T199 / FR-044）：禁用后首页核心卡保留但进入禁用态，主局切换面板也不再列出。
  // 禁用名单落在既有 preferences，不新增第二套存储。
  return <NeonBackground><main className="screen packs-screen"><header className="screen-header"><Link href="/" aria-label="返回首页"><Icon name="back" /></Link><h1>我的游戏包</h1><Link href="/packs/new" aria-label="新建游戏包"><Icon name="plus" /></Link></header><PackSegmentedTabs value={tab} onChange={setTab} />
    {tab === "packs" ? <><section><h2>内置玩法</h2><div className="pack-list">{BUILTIN_GAME_PACKS.map((pack) => { const enabled = !disabledPackIds.includes(pack.id); return <article key={pack.id}><Icon name={packIconName(pack.icon)} /><span><strong>{pack.name}</strong><small>{pack.supportedCardTypes.join(" · ")}</small></span><Toggle aria-label={`启用${pack.name}`} checked={enabled} onChange={(event) => void toggleBuiltin(pack.id, event.target.checked)} /></article>; })}</div></section><PartyToolsSection /><section><div className="pack-section-heading"><h2>自定义玩法</h2><Link href="/packs/new">＋ 新建</Link></div>{custom.length ? <div className="pack-list">{custom.map((pack) => <article key={pack.definition.id}><span className="pack-emoji">{pack.definition.icon}</span><Link href={`/packs/${pack.definition.id}`}><strong>{pack.definition.name}</strong><small>{pack.cards.length} 张题卡</small></Link><Toggle aria-label={`启用${pack.definition.name}`} checked={pack.enabled} onChange={(event) => void toggle(pack, event.target.checked)} /><button type="button" aria-label={`删除${pack.definition.name}`} onClick={() => void remove(pack.definition.id)}><Icon name="trash" /></button></article>)}</div> : <div className="empty-custom-pack"><Icon name="cube" /><h3>保存你们自己的梗</h3><p>创建本地游戏包，之后每一局都能加入混合模式。</p><Link className="button button--primary" href="/packs/new">创建第一个游戏包</Link></div>}</section></> : <section aria-label="规则"><RuleList /></section>}
  </main><BottomTabBar /></NeonBackground>;
}
