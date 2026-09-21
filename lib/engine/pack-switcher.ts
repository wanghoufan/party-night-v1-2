import { resolvePackCapability } from "@/lib/domain/pack-capability";
import type { CustomGamePack, GamePackDefinition, GameSession } from "@/lib/domain/schemas";
import { ensurePackPlayable } from "@/lib/ai/generate-deck";
import { startRound, switchPack, type StartRoundOptions } from "./session-engine";
import type { RandomSource } from "./types";
import { createGamePackRegistry } from "@/lib/game-packs/registry";

/** 用户在“游戏包”里启用的玩法：内置玩法默认启用（可被禁用名单排除），自定义玩法按 enabled 标记。 */
export function enabledPackIds(customPacks: CustomGamePack[] = [], disabledPackIds: string[] = []): string[] {
  return Array.from(createGamePackRegistry(customPacks).keys()).filter((id) => !disabledPackIds.includes(id));
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
 * options 透传给出题（如转瓶子→真心话只出 truth 卡、并由被指到的人作答）；纯本地玩法（转瓶子）不出卡。
 */
export function switchPackAndDeal(session: GameSession, packId: string, customPacks: CustomGamePack[] = [], random: RandomSource = Math.random, options: StartRoundOptions = {}, disabledPackIds: string[] = []): GameSession {
  const switched = switchPack(session, packId, { enabledPackIds: enabledPackIds(customPacks, disabledPackIds) });
  if (switched === session) return session;
  const { deck } = ensurePackPlayable(switched.deckSnapshot, switched.config, packId, switched.usedCardIds);
  return startRound({ ...switched, deckSnapshot: deck }, random, { preferPackIds: [packId], ...options });
}
