import { resolvePackCapability } from "@/lib/domain/pack-capability";
import type { CustomGamePack, GamePackDefinition, GameSession } from "@/lib/domain/schemas";
import { ensurePackPlayable } from "@/lib/ai/generate-deck";
import { startRound, switchPack, type StartRoundOptions } from "./session-engine";
import type { PackTransitionCause, RandomSource } from "./types";
import { createGamePackRegistry, getGamePack } from "@/lib/game-packs/registry";
import { isRandomLauncherPackId } from "@/lib/game-packs/random-launcher";

/**
 * 启用集合的统一解析口（V1.4 R-056）。同一份自定义数据要按规范顺序排：
 * 内置 registry 固定顺序在前，自定义包按 updatedAt 再按 id 升序在后（去重由 registry 承担）。
 */
function orderedRegistry(customPacks: CustomGamePack[] = []): Map<string, GamePackDefinition> {
  const sorted = [...customPacks].sort((a, b) =>
    a.updatedAt === b.updatedAt ? a.definition.id.localeCompare(b.definition.id) : a.updatedAt.localeCompare(b.updatedAt));
  return createGamePackRegistry(sorted);
}

/**
 * 手工可玩集合：注册表里全部真实玩法（7 个内置 + 已启用自定义），顺序沿用规范顺序。
 * 首页单玩卡、「随机玩一个」与主局 switcher 都读它——游戏包开关**不**限制主持人主动选择（R-057）。
 */
export function listManualPlayablePacks(customPacks: CustomGamePack[] = []): GamePackDefinition[] {
  return Array.from(orderedRegistry(customPacks).values()).filter((definition) => !isRandomLauncherPackId(definition.id));
}

/**
 * 混合候选（AI 组局出题池）：手工可玩集合去掉被关闭的玩法。
 * 游戏包里的开关只圈这一层——「关闭则不加入 AI 组局」，不影响首页单玩、随机启动器与主局切换（R-051/R-054）。
 * playerCount 给定时再按在场人数收口（AI-MATRIX-PLAN §1 同口径）：人数不够的玩法不进候选，
 * 否则选它会生成 0 张卡（卡被 `filterCards` 按 minPlayers 全滤掉）。缺省＝不按人数过滤（保留全局开关口径）。
 */
export function mixedCandidatePackIds(customPacks: CustomGamePack[] = [], disabledPackIds: string[] = [], playerCount?: number): string[] {
  return listManualPlayablePacks(customPacks)
    .filter((definition) => playerCount === undefined || resolvePackCapability(definition).minPlayers <= playerCount)
    .map((definition) => definition.id)
    .filter((id) => !disabledPackIds.includes(id));
}

/**
 * 玩法人数门槛的唯一文案口（AI-MATRIX-PLAN §1）：在场人数 < 玩法 minPlayers 时返回一句拦截文案。
 * 够玩、或 packId 不在注册表里（未知 id 交原逻辑回落）返回 undefined。
 * setup 的直选拦截（首页玩法卡 → `/setup?pack=…`）与主局耗尽兜底共用同一句，避免两处口径漂移。
 */
export function packMinPlayersNotice(packId: string, playerCount: number, customPacks: CustomGamePack[] = []): string | undefined {
  const definition = listManualPlayablePacks(customPacks).find((pack) => pack.id === packId);
  if (!definition) return undefined;
  const minPlayers = resolvePackCapability(definition).minPlayers;
  if (playerCount >= minPlayers) return undefined;
  return `「${definition.name}」至少需要 ${minPlayers} 人才能玩（当前在场 ${playerCount} 人）。请增加在场玩家，或换个玩法。`;
}

/**
 * 「一个可玩的候选都没有」的唯一文案口（R-CB4）：setup 的混合池为空、主局切换没有可换玩法时共用同一句，
 * 保证入口不同、说法一致——先说清原因（人数/已关闭玩法凑不出来），再给两步出口（加人 / 去游戏包开启）。
 * 候选为空时**绝不**回落到全量内置：那会复活玩家已关闭的玩法与人数不够的玩法，生成 0 张卡直接变死局。
 */
export function noPlayablePackNotice(playerCount: number): string {
  return `当前在场 ${playerCount} 人没有可玩的玩法：请增加在场玩家，或去「游戏包」开启一个玩法。`;
}

/** 主局切换没换成的兜底文案（真因归不到人数/空池时用，例如随机挑中当前玩法）。绝不静默。 */
export const PACK_SWITCH_BLOCKED_FALLBACK = "这个玩法现在换不了，换一个试试。";

const activePlayerCount = (session: GameSession): number => session.config.players.filter((player) => player.active).length;

/**
 * 「随机玩一个」启动器的候选（R-051）：手工可玩集合里当前人数可玩的部分，绝不包含启动器自己。
 * playerCount 缺省＝不按人数过滤：无 active Session 时先随机预选，人数最终由 setup 兜底。
 */
export function listLauncherTargets(customPacks: CustomGamePack[] = [], playerCount?: number): string[] {
  return listManualPlayablePacks(customPacks)
    .filter((definition) => playerCount === undefined || resolvePackCapability(definition).minPlayers <= playerCount)
    .map((definition) => definition.id);
}

/** 等概率挑一个候选；excludeId 只在还有别的候选时才起作用，避免“随机”落到当前玩法上原地空转。 */
export function pickLauncherTarget(customPacks: CustomGamePack[] = [], random: RandomSource = Math.random, playerCount?: number, excludeId?: string): string | undefined {
  const targets = listLauncherTargets(customPacks, playerCount);
  const pool = excludeId && targets.length > 1 ? targets.filter((id) => id !== excludeId) : targets;
  return pool.length ? pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] : undefined;
}

/**
 * 主局切换面板候选（R-057）：注册表里当前在场人数满足 minPlayers 的玩法。
 * 主持人主动切换不受 Session 的 mode/mixable 与游戏包开关限制；当前玩法始终保留在列表里，保证面板能标出“你正在玩什么”。
 */
export function listSwitchablePacks(session: GameSession, customPacks: CustomGamePack[] = []): GamePackDefinition[] {
  const activePlayers = activePlayerCount(session);
  const registry = orderedRegistry(customPacks);
  const candidates = Array.from(registry.values()).filter((definition) => resolvePackCapability(definition).minPlayers <= activePlayers);
  const current = registry.get(session.currentPackId);
  return current && !candidates.includes(current) ? [current, ...candidates] : candidates;
}

/** 面板里除当前玩法外还有没有能换的玩法（R-CB4 与 setup 同口径）。 */
export function hasSwitchableAlternative(session: GameSession, customPacks: CustomGamePack[] = []): boolean {
  return listSwitchablePacks(session, customPacks).some((pack) => pack.id !== session.currentPackId);
}

/**
 * 主局切换面板没有可换玩法时的提示（undefined＝有得换，不提示）：
 * active 人数异常降到任何玩法门槛以下时，面板要给出口，不静默。文案与 setup 空池同一句。
 */
export function noSwitchablePackNotice(session: GameSession, customPacks: CustomGamePack[] = []): string | undefined {
  return hasSwitchableAlternative(session, customPacks) ? undefined : noPlayablePackNotice(activePlayerCount(session));
}

/**
 * 主局切换不成立（`switchPackAndDeal` 原样返回）时的唯一文案口：只要没换成，就一定有一句话，不静默。
 * 人数不够 → 复用玩法门槛那句；随机启动器一个候选都挑不出 → 空池那句；其余（如随机落到当前玩法）→ 通用兜底。
 */
export function packSwitchBlockedNotice(session: GameSession, packId: string, customPacks: CustomGamePack[] = []): string {
  const playerCount = activePlayerCount(session);
  if (isRandomLauncherPackId(packId) && listLauncherTargets(customPacks, playerCount).length === 0) return noPlayablePackNotice(playerCount);
  return packMinPlayersNotice(packId, playerCount, customPacks) ?? PACK_SWITCH_BLOCKED_FALLBACK;
}

/**
 * 切换玩法的完整编排（主局入口与首页入口共用）：同一 Session 换玩法 → 目标玩法用本地 seed 立即补位
 * → 出下一题。不联网、不阻塞；不满足人数条件时原样返回（调用方按引用判断未切换）。
 * `packId` 是「随机玩一个」启动器时先解析成随机挑中的真实玩法，再按普通切换处理（R-052：同一 Session）。
 * options 透传给出题（如转瓶子→真心话只出 truth 卡、并由被指到的人作答）；纯本地玩法（转瓶子）不出卡。
 * cause 决定是否开新段（V1.5）：只有主持人手动切包才把顶栏轮次重计为 1。
 */
export function switchPackAndDeal(session: GameSession, packId: string, customPacks: CustomGamePack[] = [], random: RandomSource = Math.random, options: StartRoundOptions = {}, cause: PackTransitionCause = "manual-switch"): GameSession {
  const target = isRandomLauncherPackId(packId)
    ? pickLauncherTarget(customPacks, random, activePlayerCount(session), session.currentPackId)
    : packId;
  // 没有可玩的真实玩法：不切换、不静默开局，调用方停原页提示（R-051）。
  if (!target) return session;
  const switched = switchPack(session, target, { cause });
  if (switched === session) return session;
  const { deck } = ensurePackPlayable(switched.deckSnapshot, switched.config, target, switched.usedCardIds);
  return startRound({ ...switched, deckSnapshot: deck }, random, { preferPackIds: [target], ...options });
}

/** 内部复用：给调用方解析“某个 packId 是否在注册表里”。 */
export const isRegisteredPack = (packId: string, customPacks: CustomGamePack[] = []): boolean => Boolean(getGamePack(packId, customPacks));
