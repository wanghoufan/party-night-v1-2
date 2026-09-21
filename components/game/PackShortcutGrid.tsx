"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { switchPackAndDeal } from "@/lib/engine/pack-switcher";
import { gamePackRepository } from "@/lib/storage/game-pack-repository";
import { sessionRepository } from "@/lib/storage/session-repository";

import { BUILTIN_GAME_PACKS } from "@/lib/game-packs/registry";

const modes = BUILTIN_GAME_PACKS.map((pack) => [pack.id, pack.icon, pack.name, pack.supportedCardTypes.join(" · ")] as const);

/**
 * 首页玩法卡：仍是链接（/setup?pack= 预选后复用既有 quick setup），
 * 但已有一局正在进行时，改为在同一 Session 内切换玩法并直接回到主局。
 */
export function PackShortcutGrid() {
  const router = useRouter();
  async function open(packId: string) {
    const [customPacks, session] = await Promise.all([gamePackRepository.list(), sessionRepository.getLatestUnfinished()]);
    if (session?.status === "active") {
      const next = switchPackAndDeal(session, packId, customPacks);
      if (next !== session) {
        await sessionRepository.save(next);
        return router.push(`/game?session=${next.id}`);
      }
    }
    if (session) return router.push(session.status === "generating" ? `/generating?session=${session.id}` : `/game?session=${session.id}`);
    router.push(`/setup?pack=${packId}`);
  }
  return <section className="mode-grid" aria-label="快速模式">{modes.map(([id, icon, name, note]) => <Link href={`/setup?pack=${id}`} key={id} onClick={(event) => { event.preventDefault(); void open(id); }}><Icon name={(icon === "bottle" ? "glass" : icon) as "heart"} /><strong>{name}</strong><small>{note}</small></Link>)}</section>;
}
