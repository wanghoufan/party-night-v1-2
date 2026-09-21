"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { RandomGroupTool } from "@/components/tools/RandomGroupTool";
import { RandomPlayerTool } from "@/components/tools/RandomPlayerTool";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { packIconName } from "@/components/game/pack-icon";
import { CORE_PACK_IDS } from "@/lib/domain/constants";
import type { Player } from "@/lib/domain/schemas";
import { resolvePackRoute } from "@/lib/engine/pack-entry";
import { BUILTIN_GAME_PACKS } from "@/lib/game-packs/registry";
import { sessionRepository } from "@/lib/storage/session-repository";

type ToolId = "random-player" | "random-groups";

/** 核心 2×2 之外的内置玩法（4 个新玩法）都从“更多玩法”进，不在首页铺开（Spec 5.2）。 */
const morePacks = BUILTIN_GAME_PACKS.filter((pack) => !(CORE_PACK_IDS as readonly string[]).includes(pack.id));

const TOOLS: ReadonlyArray<{ id: ToolId; name: string; note: string; icon: "spark" | "users" }> = [
  { id: "random-player", name: "随机点名", note: "抽一个人", icon: "spark" },
  { id: "random-groups", name: "随机分组", note: "2 组 / 3 组", icon: "users" },
];

/**
 * 首页低侵入的“更多玩法”入口 + 面板（T159/T160/T161）：4 个新玩法与 2 个快捷工具放在同一个 sheet 里，
 * 不新增底部 Tab、不把首页从 4 张卡铺成 10 张卡；工具复用当前 Session 的玩家名单。
 */
export function MoreGamesSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tool, setTool] = useState<ToolId>();
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    if (!open) return;
    void sessionRepository.getLatestUnfinished().then((session) => setPlayers(session?.config.players ?? []));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setTool(undefined);
      setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  function close() {
    setTool(undefined);
    setOpen(false);
  }

  async function enter(packId: string) {
    router.push(await resolvePackRoute(packId));
  }

  return (
    <>
      <button className="home-row home-row--button" type="button" onClick={() => { setTool(undefined); setOpen(true); }}>
        <Icon name="spark" />
        <span><strong>更多玩法</strong><small>二选一 · 指人 · 默契测试 · 转瓶子 · 小工具</small></span>
        <Icon name="chevron" />
      </button>
      {open && createPortal(
        <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && close()}>
          <section className="sheet" role="dialog" aria-modal="true" aria-label="更多玩法">
            {tool ? (
              <>
                <div className="sheet__toolbar">
                  <button type="button" aria-label="返回玩法列表" onClick={() => setTool(undefined)}><Icon name="back" /></button>
                  <h2>{TOOLS.find((item) => item.id === tool)!.name}</h2>
                </div>
                {tool === "random-player" ? <RandomPlayerTool players={players} /> : <RandomGroupTool players={players} />}
              </>
            ) : (
              <>
                <header className="sheet__header"><h2>更多玩法</h2><p>和主局共用同一份玩家名单；已有进行中的局就直接换玩法，不重开设置</p></header>
                <div className="sheet__list">
                  {morePacks.map((pack) => (
                    <button className="sheet-option" type="button" key={pack.id} onClick={() => void enter(pack.id)}>
                      <Icon name={packIconName(pack.icon)} /><strong>{pack.name}</strong><small>玩一局</small>
                    </button>
                  ))}
                  <p className="sheet__group-label">快捷工具 · 纯本地</p>
                  {TOOLS.map((item) => (
                    <button className="sheet-option" type="button" key={item.id} onClick={() => setTool(item.id)}>
                      <Icon name={item.icon} /><strong>{item.name}</strong><small>{item.note}</small>
                    </button>
                  ))}
                </div>
                <Button variant="ghost" type="button" onClick={close}>关闭</Button>
              </>
            )}
          </section>
        </div>, document.body,
      )}
    </>
  );
}
