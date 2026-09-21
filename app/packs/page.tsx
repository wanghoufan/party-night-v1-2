"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NeonBackground } from "@/components/brand/NeonBackground";
import { BottomTabBar } from "@/components/ui/BottomTabBar";
import { Icon } from "@/components/ui/Icon";
import { Toggle } from "@/components/ui/Toggle";
import { BUILTIN_GAME_PACKS } from "@/lib/game-packs/registry";
import type { CustomGamePack } from "@/lib/domain/schemas";
import { gamePackRepository } from "@/lib/storage/game-pack-repository";

export default function PacksPage() {
  const [custom, setCustom] = useState<CustomGamePack[]>([]);
  useEffect(() => { void gamePackRepository.list().then(setCustom); }, []);
  async function toggle(pack: CustomGamePack, enabled: boolean) { const next = { ...pack, enabled, updatedAt: new Date().toISOString() }; await gamePackRepository.save(next); setCustom((items) => items.map((item) => item.definition.id === pack.definition.id ? next : item)); }
  async function remove(id: string) { await gamePackRepository.delete(id); setCustom((items) => items.filter((item) => item.definition.id !== id)); }
  return <NeonBackground><main className="screen packs-screen"><header className="screen-header"><Link href="/" aria-label="返回首页"><Icon name="back" /></Link><h1>我的游戏包</h1><Link href="/packs/new" aria-label="新建游戏包"><Icon name="plus" /></Link></header><section><h2>内置玩法</h2><div className="pack-list">{BUILTIN_GAME_PACKS.map((pack) => <article key={pack.id}><Icon name={pack.icon === "people" ? "users" : pack.icon as "heart" | "glass" | "spark"} /><span><strong>{pack.name}</strong><small>{pack.supportedCardTypes.join(" · ")}</small></span><span className="tag">已启用</span></article>)}</div></section><section><div className="pack-section-heading"><h2>自定义玩法</h2><Link href="/packs/new">＋ 新建</Link></div>{custom.length ? <div className="pack-list">{custom.map((pack) => <article key={pack.definition.id}><span className="pack-emoji">{pack.definition.icon}</span><Link href={`/packs/${pack.definition.id}`}><strong>{pack.definition.name}</strong><small>{pack.cards.length} 张题卡</small></Link><Toggle aria-label={`启用${pack.definition.name}`} checked={pack.enabled} onChange={(event) => void toggle(pack, event.target.checked)} /><button type="button" aria-label={`删除${pack.definition.name}`} onClick={() => void remove(pack.definition.id)}><Icon name="trash" /></button></article>)}</div> : <div className="empty-custom-pack"><Icon name="cube" /><h3>保存你们自己的梗</h3><p>创建本地游戏包，之后每一局都能加入混合模式。</p><Link className="button button--primary" href="/packs/new">创建第一个游戏包</Link></div>}</section></main><BottomTabBar /></NeonBackground>;
}
