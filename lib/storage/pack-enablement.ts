import { enabledPackIds } from "@/lib/engine/pack-switcher";
import { gamePackRepository } from "./game-pack-repository";
import { preferencesRepository } from "./preferences-repository";

/**
 * 玩法启用集合的唯一读写口（T199 / FR-044）：
 * 内置玩法默认启用，只有「禁用名单」落库在既有 preferences（不新增第二套存储）；
 * 自定义玩法继续沿用自身 enabled 标记。首页核心卡、主局切换面板、首页入口共用这一份集合。
 */
export async function loadDisabledPackIds(): Promise<string[]> {
  return (await preferencesRepository.get()).disabledPackIds ?? [];
}

export async function loadEnabledPackIds(): Promise<string[]> {
  const [customPacks, disabledPackIds] = await Promise.all([gamePackRepository.list(), loadDisabledPackIds()]);
  return enabledPackIds(customPacks, disabledPackIds);
}

/** 切换某个玩法的启用状态，返回更新后的禁用名单（供 UI 立即反映，不被本地缓存拖后腿）。 */
export async function setPackEnabled(packId: string, enabled: boolean): Promise<string[]> {
  const preference = await preferencesRepository.get();
  const disabledPackIds = preference.disabledPackIds ?? [];
  const next = enabled ? disabledPackIds.filter((id) => id !== packId) : Array.from(new Set([...disabledPackIds, packId]));
  await preferencesRepository.save({
    recentPlayers: preference.recentPlayers,
    lastSessionConfig: preference.lastSessionConfig,
    activeProviderId: preference.activeProviderId,
    disabledPackIds: next,
  });
  return next;
}
