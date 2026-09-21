import type { Player } from "@/lib/domain/schemas";
import { Icon } from "@/components/ui/Icon";
import { Toggle } from "@/components/ui/Toggle";
import { createId } from "@/lib/utils/create-id";
import { sanitizePlayerName, UNTRUSTED_TEXT_LIMITS } from "@/lib/security/untrusted-text";

export function PlayerManager({ players, onChange }: { players: Player[]; onChange: (players: Player[]) => void }) {
  function add() { const timestamp = new Date().toISOString(); onChange([...players, { id: createId(), displayName: `玩家 ${players.length + 1}`, active: true, createdAt: timestamp, lastUsedAt: timestamp }]); }
  return <section className="player-manager"><h3>玩家管理</h3>{players.map((player, index) => <label key={player.id}><input value={player.displayName} maxLength={UNTRUSTED_TEXT_LIMITS.playerName} aria-label="玩家昵称" onChange={(event) => { const displayName = sanitizePlayerName(event.target.value, `玩家 ${index + 1}`); onChange(players.map((item) => item.id === player.id ? { ...item, displayName } : item)); }} /><span>{player.active ? "在场" : "暂离"}</span><Toggle aria-label={`${player.displayName}在场状态`} checked={player.active} onChange={(event) => onChange(players.map((item) => item.id === player.id ? { ...item, active: event.target.checked } : item))} /></label>)}<button type="button" onClick={add}><Icon name="plus" />新增玩家</button></section>;
}
