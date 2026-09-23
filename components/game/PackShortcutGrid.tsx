"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { packIconName } from "@/components/game/pack-icon";
import { play } from "@/lib/audio";
import { resolvePackRoute } from "@/lib/engine/pack-entry";
import { homePackCards } from "@/lib/game-packs/home-cards";

/**
 * 首页玩法卡（V1.4 R-050）：7 个真实内置玩法 + 动作卡「随机玩一个」全部直出。
 * 卡片仍是链接（/setup?pack= 预选后复用既有 quick setup），已有一局在进行时改为同一 Session 内切换玩法。
 * 游戏包开关只圈 AI 组局，不挡这里的单玩，所以不再有禁用态卡片。
 * 音效（V1.7）：普通玩法卡＝轻点；「随机玩一个」＝先悬念后揭晓（挑完再给一声确定的）。
 */
export function PackShortcutGrid() {
  const router = useRouter();
  async function open(packId: string, launcher: boolean) {
    play(launcher ? "launcher-suspense" : "tap");
    const route = await resolvePackRoute(packId);
    if (launcher) play("launcher-reveal");
    router.push(route);
  }

  return (
    <section className="mode-grid" aria-label="玩法">
      {homePackCards().map(({ pack, launcher }) => (
        <Link href={`/setup?pack=${pack.id}`} key={pack.id} onClick={(event) => { event.preventDefault(); void open(pack.id, launcher); }}>
          <Icon name={packIconName(pack.icon)} />
          <strong>{pack.name}</strong>
          <small>{launcher ? "随机挑一个玩法" : pack.supportedCardTypes.join(" · ")}</small>
        </Link>
      ))}
    </section>
  );
}
