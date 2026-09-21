"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { Player } from "@/lib/domain/schemas";
import { pickRandomPlayer, playerLabels } from "@/lib/tools/random-player";

/**
 * 随机点名（T158 / US7 / FR-022）：复用当前 Session 的玩家名单，纯本地随机，不联网、不调用 AI。
 * 再抽一个会避开上一次点到的人；只剩一名在场玩家时放宽，不空转。
 */
export function RandomPlayerTool({ players }: { players: Player[] }) {
  const labels = playerLabels(players);
  const [picked, setPicked] = useState<Player>();
  const pickedLabel = picked ? labels.get(picked.id) ?? picked.displayName : undefined;

  function draw() {
    setPicked(pickRandomPlayer(players, { avoidPlayerId: picked?.id }));
  }

  return (
    <section className="party-tool party-tool--player" aria-label="随机点名">
      <p className="party-tool__lead">{labels.size ? `${labels.size} 位在场玩家` : "还没有在场玩家"}</p>
      {pickedLabel
        ? <p className="party-tool__result" role="status">{pickedLabel}</p>
        : <p className="party-tool__empty">点一下，随机点一个人</p>}
      <div className="party-tool__actions">
        <Button type="button" disabled={!labels.size} onClick={draw}><Icon name="spark" />{picked ? "再抽一个" : "随机点名"}</Button>
      </div>
      {!labels.size && <p className="party-tool__note">还没有玩家，先去“今晚开局”把大家加进来</p>}
      <span className="party-tool__source">纯本地随机 · 不联网</span>
    </section>
  );
}
