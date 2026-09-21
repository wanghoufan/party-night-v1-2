"use client";

import { Icon } from "@/components/ui/Icon";
import type { Player } from "@/lib/domain/schemas";
import { RandomGroupTool } from "./RandomGroupTool";
import { RandomPlayerTool } from "./RandomPlayerTool";

export type PartyToolId = "random-player" | "random-groups";

/** 快捷工具清单的唯一来源：首页“更多玩法”与游戏包玩法页共用（T159/T165），避免两处各写一份。 */
export const PARTY_TOOLS: ReadonlyArray<{ id: PartyToolId; name: string; note: string; icon: "spark" | "users" }> = [
  { id: "random-player", name: "随机点名", note: "抽一个人", icon: "spark" },
  { id: "random-groups", name: "随机分组", note: "2 组 / 3 组", icon: "users" },
];

export function partyToolName(id: PartyToolId): string {
  return PARTY_TOOLS.find((item) => item.id === id)!.name;
}

/**
 * 工具本体 + 返回条（T158/T165）：首页“更多玩法”面板与游戏包玩法页共用同一份实现。
 * 工具复用当前 Session 的玩家名单，纯本地随机、不联网、不调用 AI。
 */
export function PartyToolPanel({ tool, players, onBack }: { tool: PartyToolId; players: Player[]; onBack: () => void }) {
  return (
    <>
      <div className="sheet__toolbar">
        <button type="button" aria-label="返回玩法列表" onClick={onBack}><Icon name="back" /></button>
        <h2>{partyToolName(tool)}</h2>
      </div>
      {tool === "random-player" ? <RandomPlayerTool players={players} /> : <RandomGroupTool players={players} />}
    </>
  );
}
