"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { Player } from "@/lib/domain/schemas";
import { playerLabels } from "@/lib/tools/random-player";
import { randomGroups } from "@/lib/tools/random-groups";

/** 分组方式（US7）：2 组 / 3 组 / 两人一组；人数差最多 1，余数落在最后一组。 */
const MODES = [
  { id: "2", label: "2 组" },
  { id: "3", label: "3 组" },
  { id: "two", label: "两人一组" },
] as const;
type GroupMode = (typeof MODES)[number]["id"];

/**
 * 随机分组（T158 / US7 / FR-023）：复用当前 Session 玩家名单，纯本地 shuffle + 均衡分配，不调用 AI。
 * 名单里直接带每组人数，奇数余数一眼可见，不需要额外解释。
 */
export function RandomGroupTool({ players }: { players: Player[] }) {
  const labels = playerLabels(players);
  const [mode, setMode] = useState<GroupMode>("2");
  const [groups, setGroups] = useState<Player[][]>();
  const enoughPlayers = labels.size >= 2;

  function split() {
    setGroups(mode === "two" ? randomGroups(players, { groupSize: 2 }) : randomGroups(players, { groups: Number(mode) }));
  }

  return (
    <section className="party-tool party-tool--groups" aria-label="随机分组">
      <p className="party-tool__lead">{labels.size ? `${labels.size} 位在场玩家` : "还没有在场玩家"}</p>
      <div className="party-tool__modes" role="group" aria-label="分组方式">
        {MODES.map((item) => (
          <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => setMode(item.id)}>{item.label}</button>
        ))}
      </div>
      {groups?.length ? (
        <ol className="party-tool__groups" aria-label="分组结果">
          {groups.map((group, index) => (
            <li key={index}>
              <strong>第 {index + 1} 组</strong>
              <span>{group.map((player) => labels.get(player.id) ?? player.displayName).join(" · ")}</span>
              <small>{group.length} 人</small>
            </li>
          ))}
        </ol>
      ) : <p className="party-tool__empty">选好组数，点一下就能分好</p>}
      <div className="party-tool__actions">
        <Button type="button" disabled={!enoughPlayers} onClick={split}><Icon name="users" />{groups?.length ? "重新分组" : "开始分组"}</Button>
      </div>
      {!enoughPlayers && <p className="party-tool__note">至少需要 2 名在场玩家</p>}
      <span className="party-tool__source">纯本地随机 · 不联网</span>
    </section>
  );
}
