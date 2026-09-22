import type { CustomGamePack, GameSession } from "@/lib/domain/schemas";
import { ensurePackPlayable } from "@/lib/ai/generate-deck";
import { isCardAllowed } from "./card-selector";
import { switchPackAndDeal } from "./pack-switcher";
import { completeRound, startRound, swapRound, switchPack, updatePackState } from "./session-engine";
import type { RandomSource } from "./types";
import {
  readSpinBottleState, readSpinChain, SPIN_BOTTLE_PACK_ID, spinBottlePack,
  type SpinChainPhase, type SpinChainState,
} from "@/lib/game-packs/spin-bottle";

/** 转瓶子结果页的两个去向（Plan 8.4）：都链入现有真心话大冒险 Pack，不新增重复玩法。 */
export type SpinChainKind = "truth" | "dare";
export const SPIN_CHAIN_PACK_ID = "truth-dare";

const CHAIN_KINDS: SpinChainKind[] = ["truth", "dare"];

export type SpinChainEvent = "enter" | "question" | "replace" | "resolve" | "return";

const CHAIN_EVENT_TARGET: Record<SpinChainEvent, SpinChainPhase> = { enter: "enter", question: "question", replace: "replacing", resolve: "resolving", return: "returning" };

/**
 * 链的相位机（Plan V1.5）：`idle →enter→ enter →question→ question`；
 * 题面上 `question →replace→ replacing →question→ question`（换一个），或 `question →resolve→ resolving →return→ returning`（完成）。
 * 回瓶子后 returning 是稳定态；再点真心话则 `returning →enter→ enter` 开下一轮链。
 * enter/question 阶段发现没题了可以直接 →returning（不空转）。非法跃迁直接抛错——五态只有这一条合法路径。
 */
const CHAIN_TRANSITIONS: Record<"idle" | SpinChainPhase, SpinChainPhase[]> = {
  idle: ["enter"],
  enter: ["question", "returning"],
  question: ["replacing", "resolving", "returning"],
  replacing: ["question", "returning"],
  resolving: ["returning"],
  returning: ["enter"],
};

export function spinChainPhaseAfter(current: "idle" | SpinChainPhase, event: SpinChainEvent): SpinChainPhase {
  const target = CHAIN_EVENT_TARGET[event];
  if (current === target) return current;
  if (!CHAIN_TRANSITIONS[current].includes(target)) throw new Error(`illegal-spin-chain-transition: ${current} -> ${target}`);
  return target;
}

/** 链内还剩哪些类型能出题：按 packId:type 隔离，只看 truth-dare 自己没用过的卡，不受别的玩法影响。 */
export function availableSpinChainKinds(session: GameSession): SpinChainKind[] {
  const input = {
    cards: session.deckSnapshot,
    usedCardIds: session.usedCardIds,
    // 链是明确的用户动作：不受「游戏包」开关限制（R-057 同口径），目标包始终可出题。
    enabledPackIds: [...session.config.enabledPackIds, SPIN_CHAIN_PACK_ID],
    playerCount: session.config.players.filter((player) => player.active).length,
    intensity: session.config.intensity,
    boundaries: session.config.boundaries,
  };
  return CHAIN_KINDS.filter((kind) =>
    session.deckSnapshot.some((card) => card.packId === SPIN_CHAIN_PACK_ID && card.type === kind && isCardAllowed(card, input)));
}

/** 要的类型出完了就切到另一个（truth 耗尽 → dare）；两个都耗尽返回 undefined，由调用方回瓶子。 */
function resolveKind(session: GameSession, requested: SpinChainKind): SpinChainKind | undefined {
  const available = availableSpinChainKinds(session);
  return available.includes(requested) ? requested : available[0];
}

/**
 * 链要用真心话/大冒险的卡，但纯本地玩法（转瓶子）建局时牌堆是空的（US6：转瓶子自己不占卡）。
 * 进链/换题前先把 truth-dare 的 seed 补进牌堆：只补缺的、按 id/题面去重，已有 AI/自定义卡原样保留。
 * 补不动（真耗尽）时原样返回，交给 resolveKind 判空态。
 */
function ensureChainDeck(session: GameSession): GameSession {
  const { deck, added } = ensurePackPlayable(session.deckSnapshot, session.config, SPIN_CHAIN_PACK_ID, session.usedCardIds);
  return added ? { ...session, deckSnapshot: deck } : session;
}

/** 结果页两个去向按钮的可用态：必须按**补位后**的牌堆算，否则空牌堆会被误判成两类全耗尽、按钮全禁。 */
export function availableSpinChainKindsAfterRefill(session: GameSession): SpinChainKind[] {
  return availableSpinChainKinds(ensureChainDeck(session));
}

function writeChain(session: GameSession, chain: SpinChainState): GameSession {
  const current = readSpinBottleState(session) ?? {};
  return updatePackState(session, SPIN_BOTTLE_PACK_ID, { ...current, chain });
}

/**
 * enter：瓶子结果页点真心话/大冒险 → 同段内切到 truth-dare → 出对应卡。
 * participant 固定为被指到的人（连姓名快照一起写进链），换题不换人、离场也不换人。
 * 请求的类型已耗尽时改出另一类型；两个都耗尽则回瓶子 ready 并标记 exhausted。
 */
export function enterSpinChain(
  session: GameSession,
  input: { targetPlayerId: string; targetName: string; kind: SpinChainKind },
  customPacks: CustomGamePack[] = [],
  random: RandomSource = Math.random,
): GameSession {
  // 牌堆可能还是空的（转瓶子建局不填卡）：先补 truth-dare 种子，再判定能出哪一类。
  const seeded = ensureChainDeck(session);
  const kind = resolveKind(seeded, input.kind);
  const pending: SpinChainState = { phase: spinChainPhaseAfter("idle", "enter"), kind: kind ?? input.kind, targetPlayerId: input.targetPlayerId, targetName: input.targetName };
  if (!kind) return returnToBottle(seeded, { exhausted: true, chain: pending });
  const dealt = switchPackAndDeal(seeded, SPIN_CHAIN_PACK_ID, customPacks, random, {
    preferPackIds: [SPIN_CHAIN_PACK_ID],
    preferCardTypes: [kind],
    participantIds: [input.targetPlayerId],
  }, "spin-chain-enter");
  if (dealt === seeded || !dealt.currentRound) return returnToBottle(seeded, { exhausted: true, chain: pending });
  return writeChain(dealt, { ...pending, phase: spinChainPhaseAfter(pending.phase, "question") });
}

/**
 * 换一个（replacing）：拒绝当前题面，重出一张同类型的卡，参与者仍是链里固定的那个人。
 * 记 swapped（进最近拒绝指纹，短期不再抽到同题），但不消耗新的显示轮次编号。
 *
 * `_customPacks` 只为与 `enterSpinChain` 的调用点保持同形：链固定回内置 `truth-dare`
 * （`resolveKind` 只认它的卡），重出题走 `startRound`，会话牌堆里已含自定义包的卡，函数内无需再消费。
 */
export function replaceInSpinChain(session: GameSession, _customPacks: CustomGamePack[], random: RandomSource = Math.random): GameSession {
  const chain = readSpinChain(session);
  if (!chain || !session.currentRound || chain.phase === "returning") return session;
  // 换题同样可能碰上空/见底牌堆（首次进链已补位，这里只兜底）：先补种子再判类型。
  const seeded = ensureChainDeck(session);
  spinChainPhaseAfter(chain.phase, "replace");
  const kind = resolveKind(seeded, chain.kind);
  if (!kind) return returnToBottle(seeded, { exhausted: true, chain });
  const dealt = startRound(swapRound(seeded), random, {
    preferPackIds: [SPIN_CHAIN_PACK_ID],
    preferCardTypes: [kind],
    participantIds: [chain.targetPlayerId],
    reuseLogicalRoundId: session.currentRound.logicalRoundId,
  });
  if (!dealt.currentRound) return returnToBottle(seeded, { exhausted: true, chain });
  return writeChain(dealt, { ...chain, kind, phase: spinChainPhaseAfter(spinChainPhaseAfter(chain.phase, "replace"), "question") });
}

/**
 * 完成（resolving → returning）：把这一轮记为 completed，然后自动回到转瓶子 ready，
 * 主持人可以马上再转一次点下一个人；落点保留给 selector 用来避开连续指同一人。
 */
export function resolveSpinChain(session: GameSession): GameSession {
  const chain = readSpinChain(session);
  if (!chain || chain.phase === "returning") return session;
  spinChainPhaseAfter(spinChainPhaseAfter(chain.phase, "resolve"), "return");
  return returnToBottle(completeRound(session), { chain });
}

/**
 * 回瓶子：同段内切回 spin-bottle（不重置它那一格，链账与落点都在里面），
 * 相位落到 returning —— 视图据此直接进 ready（不复播上一轮结果页）。
 */
export function returnToBottle(session: GameSession, options: { exhausted?: boolean; chain?: SpinChainState } = {}): GameSession {
  const current = readSpinBottleState(session) ?? {};
  const chain = options.chain ?? current.chain;
  const switched = switchPack(session, SPIN_BOTTLE_PACK_ID, { cause: "spin-chain-return", definition: spinBottlePack });
  const value = {
    ...(current.lastSelectedPlayerId ? { lastSelectedPlayerId: current.lastSelectedPlayerId } : {}),
    ...(chain?.targetPlayerId && chain.targetName
      ? { chain: { ...chain, phase: spinChainPhaseAfter(chain.phase, "return"), ...(options.exhausted ? { exhausted: true } : {}) } }
      : {}),
  };
  return updatePackState(switched, SPIN_BOTTLE_PACK_ID, value);
}
