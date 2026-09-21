import type { GamePackDefinition } from "@/lib/domain/schemas";
import { isRandomLauncherPackId } from "./random-launcher";
import { BUILTIN_GAME_PACKS } from "./registry";

export interface HomePackCard {
  pack: GamePackDefinition;
  /** 动作型「随机玩一个」卡：自己不出题卡，点一下从手工可玩集合随机挑一个真实玩法（R-050/R-051）。 */
  launcher: boolean;
}

/**
 * 首页玩法卡的唯一来源（V1.4 R-050）：7 个真实内置玩法直接铺开，第 4 格仍是动作卡「随机玩一个」。
 * 顺序沿用内置 registry 固定顺序。这里**不看**游戏包开关——开关只圈 AI 组局的混合候选，
 * 首页单玩与主局切换始终可玩（R-057），所以卡片没有“已禁用”态。
 */
export function homePackCards(): HomePackCard[] {
  return BUILTIN_GAME_PACKS.map((pack) => ({ pack, launcher: isRandomLauncherPackId(pack.id) }));
}
