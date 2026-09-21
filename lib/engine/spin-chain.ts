import type { CustomGamePack, GameSession } from "@/lib/domain/schemas";
import { switchPackAndDeal } from "./pack-switcher";
import type { RandomSource } from "./types";

/** 转瓶子结果页的两个去向（Plan 8.4）：都链入现有真心话大冒险 Pack，不新增重复玩法。 */
export type SpinChainKind = "truth" | "dare";
export const SPIN_CHAIN_PACK_ID = "truth-dare";

/**
 * 被指到的人 → 现有真心话/大冒险：同一个 Session 切到 truth-dare，只出对应类型（truth/dare）的卡，
 * 并且本轮参与者固定为被指到的那个人（他作答）。被指到的人已离场时原样返回（调用方按引用判断未发生跳转）。
 */
export function chainSpinToTruthOrDare(
  session: GameSession,
  playerId: string,
  kind: SpinChainKind,
  customPacks: CustomGamePack[] = [],
  random: RandomSource = Math.random,
): GameSession {
  const target = session.config.players.find((player) => player.id === playerId);
  if (!target?.active) return session;
  return switchPackAndDeal(session, SPIN_CHAIN_PACK_ID, customPacks, random, {
    preferCardTypes: [kind],
    participantIds: [target.id],
  });
}
