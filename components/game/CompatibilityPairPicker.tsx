"use client";

import { Icon } from "@/components/ui/Icon";
import type { Player } from "@/lib/domain/schemas";
import type { CompatibilityState } from "@/lib/game-packs/compatibility-test";

export interface CompatibilityPairPickerProps {
  /** 本局玩家；只有 active 玩家可选，少于 2 人时玩法不可用。 */
  players: Player[];
  /** 当前配对（含显示名），用于标出已选两人。 */
  value?: { playerAId: string; playerBId: string };
  /** 点一名玩家：顺延配对（旧 B 变 A、新点变 B），点已选 B 边不变；分数/题数归零由调用方落库。 */
  onChange: (playerId: string) => void;
}

/**
 * 配对选择器（Plan 8.3 / US5 / T145）：默认从在场玩家中选两人，点第三个人即换配对。
 * 少于 2 名在场玩家时不给选择器，只说明不可用——不猜、不拿离场玩家凑数。
 */
export function CompatibilityPairPicker({ players, value, onChange }: CompatibilityPairPickerProps) {
  const active = players.filter((player) => player.active);
  if (active.length < 2) {
    return (
      <div className="compat-picker compat-picker--disabled" role="note">
        <Icon name="users" />
        <p>至少需要 2 名在场玩家才能开始默契测试</p>
      </div>
    );
  }

  return (
    <div className="compat-picker" role="group" aria-label="选择配对">
      <p className="compat-picker__hint">选两位玩家开始配对</p>
      <div className="compat-picker__roster">
        {active.map((player) => {
          const selected = player.id === value?.playerAId || player.id === value?.playerBId;
          return (
            <button
              className={`compat-picker__chip${selected ? " compat-picker__chip--on" : ""}`}
              type="button"
              key={player.id}
              aria-pressed={selected}
              onClick={() => onChange(player.id)}
            >
              {player.displayName}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 把 state 的 id 换成可读名字；名字缺失时沿用现有“玩家 N”占位约定。 */
export function pairNames(players: Player[], state?: CompatibilityState): { a: string; b: string } {
  const name = (id: string | undefined) => players.find((player) => player.id === id)?.displayName ?? "玩家";
  return { a: state ? name(state.playerAId) : "玩家 A", b: state ? name(state.playerBId) : "玩家 B" };
}
