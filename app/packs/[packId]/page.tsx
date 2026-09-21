"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { NeonBackground } from "@/components/brand/NeonBackground";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { CustomGamePack, GameCard, Intensity } from "@/lib/domain/schemas";
import { gamePackRepository } from "@/lib/storage/game-pack-repository";
import { createId } from "@/lib/utils/create-id";

function blankPack(): CustomGamePack { const id = `custom-${createId()}`; return { schemaVersion: 1, definition: { id, name: "我的游戏包", icon: "🎲", enabledByDefault: true, mixable: true, minPlayers: 2, supportedCardTypes: ["custom"], weight: 1, source: "custom" }, cards: [], enabled: true, updatedAt: new Date().toISOString() }; }
function blankCard(packId: string): CustomGamePack["cards"][number] { return { id: createId(), packId, type: "custom", content: "", instruction: "", intensity: 2, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "all", source: "custom" }; }

export default function PackEditorPage() {
  const router = useRouter();
  const id = String(useParams().packId);
  const [pack, setPack] = useState<CustomGamePack>();
  useEffect(() => { if (id === "new") void Promise.resolve(blankPack()).then(setPack); else void gamePackRepository.get(id).then((value) => value ? setPack(value) : router.replace("/packs")); }, [id, router]);
  async function save() { if (!pack || !pack.definition.name.trim() || pack.cards.some((card) => !card.content.trim())) return; const next = { ...pack, updatedAt: new Date().toISOString() }; await gamePackRepository.save(next); router.replace("/packs"); }
  function addCard() { if (pack) setPack({ ...pack, cards: [...pack.cards, blankCard(pack.definition.id)] }); }
  if (!pack) return <NeonBackground><main className="screen"><p>正在读取游戏包…</p></main></NeonBackground>;
  return <NeonBackground><main className="screen pack-editor"><header className="screen-header"><Link href="/packs" aria-label="返回游戏包"><Icon name="back" /></Link><h1>{id === "new" ? "新建游戏包" : "编辑游戏包"}</h1><span /></header><section className="pack-meta"><label><span>图标</span><input className="pack-icon-input" value={pack.definition.icon} maxLength={2} onChange={(event) => setPack({ ...pack, definition: { ...pack.definition, icon: event.target.value } })} /></label><label><span>名称</span><input value={pack.definition.name} maxLength={40} onChange={(event) => setPack({ ...pack, definition: { ...pack.definition, name: event.target.value } })} /></label></section><section className="card-editor-list"><div className="pack-section-heading"><h2>题卡</h2><button type="button" onClick={addCard}>＋ 添加题卡</button></div>{pack.cards.map((card, index) => <article key={card.id}><header><strong>题卡 {index + 1}</strong><button type="button" aria-label="删除题卡" onClick={() => setPack({ ...pack, cards: pack.cards.filter((item) => item.id !== card.id) })}><Icon name="trash" /></button></header><textarea value={card.content} placeholder="输入题目内容" onChange={(event) => setPack({ ...pack, cards: pack.cards.map((item) => item.id === card.id ? { ...item, content: event.target.value } : item) })} /><div><label>强度 <select value={card.intensity} onChange={(event) => setPack({ ...pack, cards: pack.cards.map((item) => item.id === card.id ? { ...item, intensity: Number(event.target.value) as Intensity } : item) })}>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>参与者 <select value={card.participantMode} onChange={(event) => setPack({ ...pack, cards: pack.cards.map((item) => item.id === card.id ? { ...item, participantMode: event.target.value as GameCard["participantMode"] } : item) })}><option value="all">所有人</option><option value="single">单人</option><option value="pair">双人</option><option value="none">无需指定</option></select></label></div></article>)}</section><Button className="sticky-cta" type="button" disabled={!pack.cards.length || pack.cards.some((card) => !card.content.trim())} onClick={() => void save()}>保存游戏包</Button></main></NeonBackground>;
}
