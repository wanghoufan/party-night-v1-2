import { switchPackAndDeal } from "./pack-switcher";
import { gamePackRepository } from "@/lib/storage/game-pack-repository";
import { loadDisabledPackIds } from "@/lib/storage/pack-enablement";
import { sessionRepository } from "@/lib/storage/session-repository";

/**
 * “进入某个玩法”的唯一编排，首页 2×2 核心卡与“更多玩法”入口共用（T135/T136/T160）：
 * 有进行中的局就在同一 Session 内换玩法并落库，没有就复用既有 quick setup（禁止第二套设置向导）。
 * 被用户禁用的玩法（FR-044）不从这里启动，只引导回游戏包重新启用。
 * 返回调用方要跳转的路由；不直接操作 router，方便测试与复用。
 */
export async function resolvePackRoute(packId: string): Promise<string> {
  const [customPacks, session, disabledPackIds] = await Promise.all([gamePackRepository.list(), sessionRepository.getLatestUnfinished(), loadDisabledPackIds()]);
  if (disabledPackIds.includes(packId)) return "/packs";
  if (session?.status === "active") {
    const next = switchPackAndDeal(session, packId, customPacks, Math.random, {}, disabledPackIds);
    if (next !== session) {
      await sessionRepository.save(next);
      return `/game?session=${next.id}`;
    }
  }
  if (session) return session.status === "generating" ? `/generating?session=${session.id}` : `/game?session=${session.id}`;
  return `/setup?pack=${packId}`;
}
