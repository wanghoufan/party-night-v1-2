import type { GamePackDefinition } from "@/lib/domain/schemas";

/**
 * V1.4：原「AI 即兴」玩法退役，同一个 id 只留作**旧数据迁移锚**。
 * 旧 Session 的 `deckSnapshot.packId` / `currentPackId` / `currentRound.packId` 命中它时，
 * 由 `lib/storage/session-migration` 丢弃旧卡并按规则回落（见 R-048 / R-049）。
 *
 * 玩法本体已换成动作型启动器「随机玩一个」：自己不出题卡、不产生 seed/AI 内容、不参加 mixed，
 * 点一下就从「当前启用集合」里的真实玩法随机挑一个开单玩（见 lib/engine/pack-switcher）。
 */
export const RANDOM_LAUNCHER_PACK_ID = "ai-improv";

export function isRandomLauncherPackId(id: string): boolean {
  return id === RANDOM_LAUNCHER_PACK_ID;
}

export const randomLauncherPack: GamePackDefinition = {
  id: RANDOM_LAUNCHER_PACK_ID, name: "随机玩一个", icon: "spark", enabledByDefault: true,
  mixable: false, minPlayers: 2, supportedCardTypes: ["random-launcher"], weight: 1, source: "builtin",
  capability: {
    // 启动器不自己出内容：没有 AI 卡、没有本地 seed，也不进混合出题分布。
    requiresAIContent: false, minPlayers: 2, supportsMixedMode: false, supportsLocalSeed: false,
    renderer: "random-launcher",
  },
};
