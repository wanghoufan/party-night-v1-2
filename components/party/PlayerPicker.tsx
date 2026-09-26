"use client";

import { Icon } from "@/components/ui/Icon";
import type { Player } from "@/lib/domain/schemas";
import { createId } from "@/lib/utils/create-id";
import { sanitizePlayerName, UNTRUSTED_TEXT_LIMITS } from "@/lib/security/untrusted-text";
import type { PairGenderInput } from "@/lib/v2-relationship/v2-participants";

/**
 * 当局性别三态（D4=A）：男 / 女 / 不填（默认）。
 * 只为本局路由服务，不回写 Player 档案；「不填」等价 null，系统不猜。
 */
const GENDER_OPTIONS: ReadonlyArray<{ value: "male" | "female" | null; label: string }> = [
  { value: "male", label: "男" },
  { value: "female", label: "女" },
  { value: null, label: "不填" },
];

export function PlayerPicker({
  players,
  onChange,
  genders,
  onGendersChange,
}: {
  players: Player[];
  onChange: (players: Player[]) => void;
  genders: PairGenderInput;
  onGendersChange: (genders: PairGenderInput) => void;
}) {
  function resize(delta: number) {
    const count = Math.max(2, Math.min(12, players.length + delta));
    if (count < players.length) {
      const removed = players.slice(count).map((player) => player.id);
      onGendersChange(Object.fromEntries(Object.entries(genders).filter(([id]) => !removed.includes(id))));
      onChange(players.slice(0, count));
    } else onChange([...players, ...Array.from({ length: count - players.length }, (_, index) => { const n = players.length + index + 1; const time = new Date().toISOString(); return { id: createId(), displayName: `玩家 ${n}`, active: true, createdAt: time, lastUsedAt: time }; })]);
  }
  return <section className="setup-section"><h2>有多少人一起玩？</h2><div className="stepper"><button type="button" aria-label="减少玩家" onClick={() => resize(-1)}><Icon name="minus" /></button><strong>{players.length}<small>人</small></strong><button type="button" aria-label="增加玩家" onClick={() => resize(1)}><Icon name="plus" /></button></div><p className="gender-hint">性别只用于本局配对，不保存到玩家档案；不填也能玩。</p><div className="player-names">{players.map((player, index) => <div className="player-row" key={player.id}><label><span>{index + 1}</span><input aria-label={`玩家 ${index + 1} 昵称`} value={player.displayName} maxLength={UNTRUSTED_TEXT_LIMITS.playerName} onChange={(event) => onChange(players.map((item) => item.id === player.id ? { ...item, displayName: sanitizePlayerName(event.target.value, `玩家 ${index + 1}`) } : item))} /></label><div className="gender-picker" role="group" aria-label={`玩家 ${index + 1} 性别（可留空）`}>{GENDER_OPTIONS.map((option) => <button key={option.label} type="button" aria-pressed={(genders[player.id] ?? null) === option.value} className={(genders[player.id] ?? null) === option.value ? "is-selected" : undefined} onClick={() => onGendersChange({ ...genders, [player.id]: option.value })}>{option.label}</button>)}</div></div>)}</div></section>;
}
