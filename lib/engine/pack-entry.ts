import { switchPackAndDeal, isRegisteredPack, pickLauncherTarget } from "./pack-switcher";
import type { RandomSource } from "./types";
import { gamePackRepository } from "@/lib/storage/game-pack-repository";
import { sessionRepository } from "@/lib/storage/session-repository";
import { isRandomLauncherPackId } from "@/lib/game-packs/random-launcher";

/**
 * “进入某个玩法”的唯一编排，首页玩法卡与「随机玩一个」共用（T135/T136/T160）：
 * 有进行中的局就在同一 Session 内换玩法并落库，没有就复用既有 quick setup（禁止第二套设置向导）。
 * 第 4 格「随机玩一个」是动作入口（V1.4 R-052）：先从手工可玩集合随机挑一个真实玩法，再走上面同一条流程；
 * 挑不出真实玩法时停在游戏包页，不静默开局。
 * 游戏包里的开关只圈 AI 组局范围，不挡首页单玩与主持人的主动切换（R-057），所以这里不读禁用名单。
 * 返回调用方要跳转的路由；不直接操作 router，方便测试与复用。
 */
export async function resolvePackRoute(packId: string, random: RandomSource = Math.random): Promise<string> {
  const [customPacks, session] = await Promise.all([gamePackRepository.list(), sessionRepository.getLatestUnfinished()]);
  const activePlayers = session?.config.players.filter((player) => player.active).length;
  const target = isRandomLauncherPackId(packId)
    ? pickLauncherTarget(customPacks, random, activePlayers, session?.currentPackId)
    : packId;
  if (!target || !isRegisteredPack(target, customPacks)) return "/packs";
  if (session?.status === "active") {
    const next = switchPackAndDeal(session, target, customPacks, random);
    if (next !== session) {
      await sessionRepository.save(next);
      return `/game?session=${next.id}`;
    }
  }
  if (session) return session.status === "generating" ? `/generating?session=${session.id}` : `/game?session=${session.id}`;
  return `/setup?pack=${target}`;
}
