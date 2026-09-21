import { CORE_PACK_IDS } from "@/lib/domain/constants";
import type { GamePackDefinition } from "@/lib/domain/schemas";
import { BUILTIN_GAME_PACKS } from "./registry";

export interface HomeCorePackCard {
  pack: GamePackDefinition;
  /** 玩法被禁用时卡片保留原位，但只能引导去游戏包重新启用，不绕过 registry 直接开局（Spec 2.2）。 */
  disabled: boolean;
}

/**
 * 首页 2×2 核心卡的唯一来源（T160 / V1.4 R-050）：顺序沿用内置注册表顺序，也就是原来的 4 张卡；
 * 第 4 格现在是动作型「随机玩一个」（registry 里的启动器定义，见 lib/game-packs/random-launcher），
 * 其余新玩法（二选一/指人/默契测试/转瓶子）由“更多玩法”入口承载。
 */
export function corePackCards(enabledPackIds: string[]): HomeCorePackCard[] {
  return BUILTIN_GAME_PACKS.filter((pack) => (CORE_PACK_IDS as readonly string[]).includes(pack.id)).map((pack) => ({
    pack,
    disabled: !enabledPackIds.includes(pack.id),
  }));
}
