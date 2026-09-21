"use client";

import { Icon } from "@/components/ui/Icon";
import type { Player } from "@/lib/domain/schemas";
import { createId } from "@/lib/utils/create-id";
import { sanitizePlayerName, UNTRUSTED_TEXT_LIMITS } from "@/lib/security/untrusted-text";

export function PlayerPicker({ players, onChange }: { players: Player[]; onChange: (players: Player[]) => void }) {
  function resize(delta: number) {
    const count = Math.max(2, Math.min(12, players.length + delta));
    if (count < players.length) onChange(players.slice(0, count));
    else onChange([...players, ...Array.from({ length: count - players.length }, (_, index) => { const n = players.length + index + 1; const time = new Date().toISOString(); return { id: createId(), displayName: `玩家 ${n}`, active: true, createdAt: time, lastUsedAt: time }; })]);
  }
  return <section className="setup-section"><h2>有多少人一起玩？</h2><div className="stepper"><button type="button" aria-label="减少玩家" onClick={() => resize(-1)}><Icon name="minus" /></button><strong>{players.length}<small>人</small></strong><button type="button" aria-label="增加玩家" onClick={() => resize(1)}><Icon name="plus" /></button></div><div className="player-names">{players.map((player, index) => <label key={player.id}><span>{index + 1}</span><input aria-label={`玩家 ${index + 1} 昵称`} value={player.displayName} maxLength={UNTRUSTED_TEXT_LIMITS.playerName} onChange={(event) => onChange(players.map((item) => item.id === player.id ? { ...item, displayName: sanitizePlayerName(event.target.value, `玩家 ${index + 1}`) } : item))} /></label>)}</div></section>;
}
