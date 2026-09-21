import { resolvePackCapability } from "@/lib/domain/pack-capability";
import type { CustomGamePack, GamePackDefinition, GameSession } from "@/lib/domain/schemas";
import { ensurePackPlayable } from "@/lib/ai/generate-deck";
import { startRound, switchPack, type StartRoundOptions } from "./session-engine";
import type { RandomSource } from "./types";
import { createGamePackRegistry, getGamePack } from "@/lib/game-packs/registry";
import { isRandomLauncherPackId } from "@/lib/game-packs/random-launcher";

/** 用户在“游戏包”里启用的玩法：内置玩法默认启用（可被禁用名单排除），自定义玩法按 enabled 标记。 */
export function enabledPackIds(customPacks: CustomGamePack[] = [], disabledPackIds: string[] = []): string[] {
  return Array.from(createGamePackRegistry(customPacks).keys()).filter((id) => !disabledPackIds.includes(id));
}

const activePlayerCount = (session: GameSession): number => session.config.players.filter((player) => player.active).length;

/**
 * 「随机玩一个」启动器的候选（R-051）：已启用、非启动器本身、当前人数可玩的**真实玩法**，
 * 顺序沿用统一启用集合（registry 固定顺序在前，自定义按 createdAt/id 升序在后）。
 * playerCount 缺省＝不按人数过滤：无 active Session 时先随机预选，人数最终由 setup 兜底。
 */
export function listLauncherTargets(enabledIds: string[], customPacks: CustomGamePack[] = [], playerCount?: number): string[] {
  return enabledIds
    .filter((id) => !isRandomLauncherPackId(id))
    .filter((id) => {
      const pack = getGamePack(id, customPacks);
      if (!pack) return false;
      return playerCount === undefined || resolvePackCapability(pack).minPlayers <= playerCount;
    });
}

/** 等概率挑一个候选；excludeId 只在还有别的候选时才起作用，避免“随机”落到当前玩法上原地空转。 */
export function pickLauncherTarget(enabledIds: string[], customPacks: CustomGamePack[] = [], random: RandomSource = Math.random, playerCount?: number, excludeId?: string): string | undefined {
  const targets = listLauncherTargets(enabledIds, customPacks, playerCount);
  const pool = excludeId && targets.length > 1 ? targets.filter((id) => id !== excludeId) : targets;
  return pool.length ? pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] : undefined;
}

/**
 * 主局切换面板候选：启用 + 当前在场人数满足 minPlayers。
 * 当前玩法始终保留在列表里，保证面板能标出“你正在玩什么”。
 */
export function listSwitchablePacks(session: GameSession, customPacks: CustomGamePack[] = [], disabledPackIds: string[] = []): GamePackDefinition[] {
  const activePlayers = session.config.players.filter((player) => player.active).length;
  const registry = createGamePackRegistry(customPacks);
  const candidates = Array.from(registry.values())
    .filter((definition) => !disabledPackIds.includes(definition.id))
    .filter((definition) => resolvePackCapability(definition).minPlayers <= activePlayers);
  const current = registry.get(session.currentPackId);
  return current && !candidates.includes(current) ? [current, ...candidates] : candidates;
}

/**
 * 切换玩法的完整编排（主局入口与首页入口共用）：同一 Session 换玩法 → 目标玩法用本地 seed 立即补位
 * → 出下一题。不联网、不阻塞；不满足启用/人数条件时原样返回（调用方按引用判断未切换）。
 * `packId` 是「随机玩一个」启动器时先解析成随机挑中的真实玩法，再按普通切换处理（R-052：同一 Session）。
 * options 透传给出题（如转瓶子→真心话只出 truth 卡、并由被指到的人作答）；纯本地玩法（转瓶子）不出卡。
 */
export function switchPackAndDeal(session: GameSession, packId: string, customPacks: CustomGamePack[] = [], random: RandomSource = Math.random, options: StartRoundOptions = {}, disabledPackIds: string[] = []): GameSession {
  const allowed = enabledPackIds(customPacks, disabledPackIds);
  const target = isRandomLauncherPackId(packId)
    ? pickLauncherTarget(allowed, customPacks, random, activePlayerCount(session), session.currentPackId)
    : packId;
  // 没有可玩的真实玩法：不切换、不静默开局，调用方停原页提示（R-051）。
  if (!target) return session;
  const switched = switchPack(session, target, { enabledPackIds: allowed });
  if (switched === session) return session;
  const { deck } = ensurePackPlayable(switched.deckSnapshot, switched.config, target, switched.usedCardIds);
  return startRound({ ...switched, deckSnapshot: deck }, random, { preferPackIds: [target], ...options });
}
