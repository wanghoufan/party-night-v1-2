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
import { isRandomLauncherPackId } from "@/lib/game-packs/random-launcher";
import type { CustomGamePack } from "@/lib/domain/schemas";
import { gamePackRepository } from "@/lib/storage/game-pack-repository";
import { LAST_PACK_MESSAGE, loadDisabledPackIds, setPackPlayability } from "@/lib/storage/pack-enablement";

export default function PacksPage() {
  return <Suspense fallback={<NeonBackground><main className="screen packs-screen"><p>正在读取游戏包…</p></main></NeonBackground>}><PacksPageContent /></Suspense>;
}

function PacksPageContent() {
  const [tab, setTab] = useState<PacksTabId>(useSearchParams().get("tab") === "rules" ? "rules" : "packs");
  const [custom, setCustom] = useState<CustomGamePack[]>([]);
  const [disabledPackIds, setDisabledPackIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  useEffect(() => { void gamePackRepository.list().then(setCustom); }, []);
  useEffect(() => { void loadDisabledPackIds().then(setDisabledPackIds); }, []);
  // 内置与自定义走同一条开关命令（R-054/R-055）：基于最新持久化状态先算 next 集合，
  // 关掉最后一个玩法时整笔拒绝——库里一个字节都不改，开关保持原值并给可见提示。
  async function applyToggle(packId: string, enabled: boolean) {
    const result = await setPackPlayability(packId, enabled);
    if (!result.ok) { setNotice(LAST_PACK_MESSAGE); return; }
    setNotice("");
    setDisabledPackIds(result.disabledPackIds);
    setCustom(await gamePackRepository.list());
  }
  async function remove(id: string) { await gamePackRepository.delete(id); setCustom((items) => items.filter((item) => item.definition.id !== id)); }
  return <NeonBackground><main className="screen packs-screen">
    <header className="screen-header"><Link href="/" aria-label="返回首页"><Icon name="back" /></Link><h1>我的游戏包</h1><Link href="/packs/new" aria-label="新建游戏包"><Icon name="plus" /></Link></header>
    <PackSegmentedTabs value={tab} onChange={setTab} />
    {notice && <p className="pack-notice" role="alert">{notice}</p>}
    {tab === "packs" ? <>
      <section>
        <h2>内置玩法</h2>
        {/* 开关的语义是「关掉就不加入 AI 组局」：只改变混合出题候选，首页单玩与主局切换照旧可玩（R-057）。 */}
        <p className="pack-section-note">开关只决定它是否加入 AI 组局；关掉后首页单玩与主局切换里照样能选到它。</p>
        <div className="pack-list">{BUILTIN_GAME_PACKS.map((pack) => { const launcher = isRandomLauncherPackId(pack.id); const enabled = !disabledPackIds.includes(pack.id); return <article key={pack.id}><Icon name={packIconName(pack.icon)} /><span><strong>{pack.name}</strong><small>{launcher ? "动作入口 · 不加入 AI 组局" : "关闭则不加入 AI 组局"}</small></span>{launcher ? null : <Toggle aria-label={`启用${pack.name}`} checked={enabled} onChange={(event) => void applyToggle(pack.id, event.target.checked)} />}</article>; })}</div>
      </section>
      <PartyToolsSection />
      <section>
        <div className="pack-section-heading"><h2>自定义玩法</h2><Link href="/packs/new">＋ 新建</Link></div>
        {custom.length ? <div className="pack-list">{custom.map((pack) => <article key={pack.definition.id}><span className="pack-emoji">{pack.definition.icon}</span><Link href={`/packs/${pack.definition.id}`}><strong>{pack.definition.name}</strong><small>{pack.cards.length} 张题卡</small></Link><Toggle aria-label={`启用${pack.definition.name}`} checked={pack.enabled} onChange={(event) => void applyToggle(pack.definition.id, event.target.checked)} /><button type="button" aria-label={`删除${pack.definition.name}`} onClick={() => void remove(pack.definition.id)}><Icon name="trash" /></button></article>)}</div> : <div className="empty-custom-pack"><Icon name="cube" /><h3>保存你们自己的梗</h3><p>创建本地游戏包，之后每一局都能加入混合模式。</p><Link className="button button--primary" href="/packs/new">创建第一个游戏包</Link></div>}
      </section>
    </> : <section aria-label="规则"><RuleList /></section>}
  </main><BottomTabBar /></NeonBackground>;
}
