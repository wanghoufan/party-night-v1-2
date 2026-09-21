"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { packIconName } from "@/components/game/pack-icon";
import { BUILTIN_PACK_IDS } from "@/lib/domain/constants";
import type { CustomGamePack } from "@/lib/domain/schemas";
import { resolvePackRoute } from "@/lib/engine/pack-entry";
import { enabledPackIds } from "@/lib/engine/pack-switcher";
import { corePackCards } from "@/lib/game-packs/home-cards";
import { gamePackRepository } from "@/lib/storage/game-pack-repository";

/**
 * 首页 2×2 核心玩法卡（T160）：只保留原来的 4 个核心玩法，新玩法走“更多玩法”入口。
 * 卡片仍是链接（/setup?pack= 预选后复用既有 quick setup），已有一局在进行时改为同一 Session 内切换玩法。
 * 玩法被禁用时卡片保留原位并显示禁用态，点击只引导去游戏包重新启用，绝不绕过 registry 直接开局。
 */
export function PackShortcutGrid() {
  const router = useRouter();
  // 首屏按默认全启用渲染；读到本地自定义包后刷新（内置玩法恒启用，禁用来源是游戏包的启用集合）。
  const [enabledIds, setEnabledIds] = useState<string[]>([...BUILTIN_PACK_IDS]);
  useEffect(() => { void gamePackRepository.list().then((custom: CustomGamePack[]) => setEnabledIds(enabledPackIds(custom))); }, []);
  async function open(packId: string) { router.push(await resolvePackRoute(packId)); }

  return (
    <section className="mode-grid" aria-label="快速模式">
      {corePackCards(enabledIds).map(({ pack, disabled }) => {
        const body = <><Icon name={packIconName(pack.icon)} /><strong>{pack.name}</strong><small>{disabled ? "已在游戏包禁用" : pack.supportedCardTypes.join(" · ")}</small></>;
        return disabled
          ? <button type="button" key={pack.id} aria-disabled="true" onClick={() => router.push("/packs")}>{body}</button>
          : <Link href={`/setup?pack=${pack.id}`} key={pack.id} onClick={(event) => { event.preventDefault(); void open(pack.id); }}>{body}</Link>;
      })}
    </section>
  );
}
