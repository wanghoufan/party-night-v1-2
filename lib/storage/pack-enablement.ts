import { mixedCandidatePackIds } from "@/lib/engine/pack-switcher";
import { gamePackRepository } from "./game-pack-repository";
import { preferencesRepository } from "./preferences-repository";

/**
 * 玩法开关的唯一读写口（V1.4 R-054/R-055/R-056）：
 * 内置玩法默认启用，只有「关闭名单」落库在既有 preferences（不新增第二套存储）；自定义玩法沿用自身 enabled。
 * 关掉一个玩法＝把它移出 **AI 组局的混合候选**，首页单玩、随机启动器与主局 switcher 不受影响。
 * 至少留一个：关掉最后一个候选会被整笔拒绝，不写 preferences、不写 gamePacks（先算 next，全空才拒）。
 */
export async function loadDisabledPackIds(): Promise<string[]> {
  return (await preferencesRepository.get()).disabledPackIds ?? [];
}

/** AI 组局（混合出题）实际会用的候选：内置真实玩法（未关闭）+ 已启用自定义，规范顺序、去重。 */
export async function loadMixedCandidatePackIds(): Promise<string[]> {
  const [customPacks, disabledPackIds] = await Promise.all([gamePackRepository.list(), loadDisabledPackIds()]);
  return mixedCandidatePackIds(customPacks, disabledPackIds);
}

export const LAST_PACK_MESSAGE = "至少保留一个玩法：最后一个不能关，否则 AI 组局就没内容了";

export type PackToggleResult =
  | { ok: true; disabledPackIds: string[] }
  | { ok: false; reason: "last-pack"; disabledPackIds: string[] };

/**
 * 切换某个玩法的开关，返回结构化结果供 UI 立即反映（不被本地缓存拖后腿）。
 * 拒绝（`ok:false`）＝关掉后混合候选会归零，此时开关必须保持原值并提示，库里一个字节都不改。
 */
export async function setPackPlayability(packId: string, enabled: boolean): Promise<PackToggleResult> {
  const [customPacks, disabledPackIds] = await Promise.all([gamePackRepository.list(), loadDisabledPackIds()]);
  const nextDisabledPackIds = enabled
    ? disabledPackIds.filter((id) => id !== packId)
    : Array.from(new Set([...disabledPackIds, packId]));
  const nextCustomPacks = customPacks.map((pack) =>
    pack.definition.id === packId ? { ...pack, enabled, updatedAt: new Date().toISOString() } : pack);
  // R-054/R-055：先基于最新持久化状态算最终集合，空集合直接拒绝，绝不先写库再补偿（连点/并发也落不成零玩法）。
  if (mixedCandidatePackIds(nextCustomPacks, nextDisabledPackIds).length === 0) return { ok: false, reason: "last-pack", disabledPackIds };
  const target = nextCustomPacks.find((pack) => pack.definition.id === packId);
  if (target) {
    await gamePackRepository.save(target);
  } else {
    const preference = await preferencesRepository.get();
    await preferencesRepository.save({
      recentPlayers: preference.recentPlayers,
      lastSessionConfig: preference.lastSessionConfig,
      activeProviderId: preference.activeProviderId,
      disabledPackIds: nextDisabledPackIds,
    });
  }
  return { ok: true, disabledPackIds: nextDisabledPackIds };
}
