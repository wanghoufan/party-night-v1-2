"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import type { Player } from "@/lib/domain/schemas";
import { sessionRepository } from "@/lib/storage/session-repository";
import { PARTY_TOOLS, PartyToolPanel, type PartyToolId } from "./PartyToolPanel";

/**
 * 游戏包玩法页的“快捷工具”分区（T165 / US7）：随机点名、随机分组。
 * 工具没有启用/禁用语义，所以这里是“打开即用”的行，不给 Toggle、不打“已启用”标签；
 * 打开时才读当前 Session 的玩家名单（与首页“更多玩法”同一行为），不新增底部 Tab、不跳页。
 */
export function PartyToolsSection() {
  const [tool, setTool] = useState<PartyToolId>();
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    if (!tool) return;
    void sessionRepository.getLatestUnfinished().then((session) => setPlayers(session?.config.players ?? []));
  }, [tool]);

  useEffect(() => {
    if (!tool) return;
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") setTool(undefined); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tool]);

  return (
    <section aria-label="快捷工具">
      <div className="pack-section-heading"><h2>快捷工具</h2><span className="pack-tools__badge">纯本地 · 不联网</span></div>
      <div className="pack-tools">
        {PARTY_TOOLS.map((item) => (
          <button type="button" key={item.id} onClick={() => setTool(item.id)}>
            <Icon name={item.icon} />
            <span><strong>{item.name}</strong><small>{item.note}</small></span>
            <Icon name="chevron" />
          </button>
        ))}
      </div>
      {tool && createPortal(
        <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setTool(undefined)}>
          <section className="sheet" role="dialog" aria-modal="true" aria-label="快捷工具">
            <PartyToolPanel tool={tool} players={players} onBack={() => setTool(undefined)} />
          </section>
        </div>, document.body,
      )}
    </section>
  );
}
