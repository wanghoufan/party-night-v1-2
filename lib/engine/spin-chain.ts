import type { CustomGamePack, GameCard, GameSession } from "@/lib/domain/schemas";
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
  const input = chainSelection(session);
  return CHAIN_KINDS.filter((kind) =>
    session.deckSnapshot.some((card) => card.packId === SPIN_CHAIN_PACK_ID && card.type === kind && isCardAllowed(card, input)));
}

/** 链的选卡上下文：链是明确的用户动作，不受「游戏包」开关限制（R-057 同口径），目标包始终可出题。 */
function chainSelection(session: GameSession) {
  return {
    cards: session.deckSnapshot,
    usedCardIds: session.usedCardIds,
    enabledPackIds: [...session.config.enabledPackIds, SPIN_CHAIN_PACK_ID],
    playerCount: session.config.players.filter((player) => player.active).length,
    intensity: session.config.intensity,
    boundaries: session.config.boundaries,
  };
}

const chainCardsOf = (session: GameSession, kind: SpinChainKind): GameCard[] =>
  session.deckSnapshot.filter((card) => card.packId === SPIN_CHAIN_PACK_ID && card.type === kind);

/** 链内某一类还剩几张没出过（已补位、已过滤）：L2 后台补题按「剩余 < 3」触发。 */
export function remainingSpinChainCards(session: GameSession): Record<SpinChainKind, number> {
  const seeded = ensureChainDeck(session);
  const input = chainSelection(seeded);
  const count = (kind: SpinChainKind) =>
    chainCardsOf(seeded, kind).filter((card) => !seeded.usedCardIds.includes(card.id) && isCardAllowed(card, input)).length;
  return { truth: count("truth"), dare: count("dare") };
}

/** 把某一类的已用记录清掉，让它从头再来（`recycled` 只记真的洗过的类）。 */
function recycleKinds(session: GameSession, kinds: SpinChainKind[], recycled: SpinChainKind[]): GameSession {
  let next = session;
  for (const kind of kinds) {
    const ids = new Set(chainCardsOf(session, kind).map((card) => card.id));
    const used = next.usedCardIds.filter((id) => !ids.has(id));
    if (used.length === next.usedCardIds.length) continue;
    next = { ...next, usedCardIds: used };
    if (!recycled.includes(kind)) recycled.push(kind);
  }
  return next;
}

/**
 * 结果页可用态：能不能出某一类的题（用完的那类会被 L1 洗回来，所以仍然能出），以及哪几类洗完会重复。
 * 纯本地判空、不改 session（不改 usedCardIds），所以可以放心在渲染期调用。
 */
export function spinChainAvailability(session: GameSession): { available: SpinChainKind[]; recycled: SpinChainKind[] } {
  const seeded = ensureChainDeck(session);
  const input = chainSelection(seeded);
  // usedCardIds 不参与「整类还能不能出」的判定：出完的那类由 L1 洗牌救回来（记进 recycled 给一句可见提示），
  // 只有被尺度/雷区/人数整类挡掉才是真缺口，洗牌也救不回来。
  const playableInput = { ...input, usedCardIds: [] as string[] };
  const recycled: SpinChainKind[] = [];
  const available = CHAIN_KINDS.filter((kind) => {
    const cards = chainCardsOf(seeded, kind);
    if (!cards.some((card) => isCardAllowed(card, playableInput))) return false; // 整类被尺度/雷区挡掉，洗牌也救不回来
    if (!cards.some((card) => !seeded.usedCardIds.includes(card.id))) recycled.push(kind);
    return true;
  });
  return { available, recycled };
}

/** 结果页两个去向按钮的可用态：必须按**补位后**的牌堆算，否则空牌堆会被误判成两类全耗尽、按钮全禁。 */
export function availableSpinChainKindsAfterRefill(session: GameSession): SpinChainKind[] {
  return spinChainAvailability(session).available;
}

/**
 * L1 洗牌循环（V1.6）：出完的那类把已用记录清空，从头再来——题目会重复，但**永不断游**。
 * 顺序：请求的那类还有新鲜卡 → 直接用；没有就把该类洗回来（点真心话就给真心话的重复题，不偷偷换类型）；
 * 该类整类出不了（被雷区/尺度挡掉）→ 退另一类；两类都洗过仍一张都出不了，才算题池真缺口，回瓶子标记 exhausted 交给 L2。
 */
function prepareChainDeck(session: GameSession, requested: SpinChainKind): { session: GameSession; kind?: SpinChainKind; recycled: SpinChainKind[] } {
  const seeded = ensureChainDeck(session);
  // 排开 used 之后还能不能出：区分「这档只是出完了」（洗牌能救）和「这档被雷区/尺度整类挡掉」（洗不回来）。
  const { available } = spinChainAvailability(seeded);
  const recycled: SpinChainKind[] = [];
  const fresh = (current: GameSession) => availableSpinChainKinds(current);
  const dealable = (current: GameSession, kind: SpinChainKind) => available.includes(kind) && fresh(current).includes(kind);
  // 1) 请求的那类出完了 → 先洗回来（这是 L1 的本意：宁可重复，也不换类型）。
  let next = available.includes(requested) && !fresh(seeded).includes(requested) ? recycleKinds(seeded, [requested], recycled) : seeded;
  // 2) 请求的那类整类出不了 → 用另一类（先新鲜卡，没有再洗它）。
  if (!dealable(next, requested)) {
    const other = CHAIN_KINDS.find((kind) => kind !== requested);
    if (other && available.includes(other)) next = fresh(next).includes(other) ? next : recycleKinds(next, [other], recycled);
  }
  const kind = dealable(next, requested) ? requested : CHAIN_KINDS.find((item) => dealable(next, item));
  return { session: next, kind, recycled };
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
  // 牌堆可能还是空的（转瓶子建局不填卡）：先补 truth-dare 种子；用完的那类走 L1 洗牌循环，永不空转。
  const { session: prepared, kind, recycled } = prepareChainDeck(session, input.kind);
  const pending: SpinChainState = {
    phase: spinChainPhaseAfter("idle", "enter"), kind: kind ?? input.kind, targetPlayerId: input.targetPlayerId, targetName: input.targetName,
    ...(recycled.length ? { recycled } : {}),
  };
  if (!kind) return returnToBottle(prepared, { exhausted: true, chain: pending });
  const dealt = switchPackAndDeal(prepared, SPIN_CHAIN_PACK_ID, customPacks, random, {
    preferPackIds: [SPIN_CHAIN_PACK_ID],
    preferCardTypes: [kind],
    participantIds: [input.targetPlayerId],
  }, "spin-chain-enter");
  if (dealt === prepared || !dealt.currentRound) return returnToBottle(prepared, { exhausted: true, chain: pending });
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
  // 换题同样可能碰上空/见底牌堆（首次进链已补位，这里只兜底）：先补种子＋L1 洗牌再判类型。
  spinChainPhaseAfter(chain.phase, "replace");
  const { session: prepared, kind, recycled } = prepareChainDeck(session, chain.kind);
  const nextChain = recycled.length ? { ...chain, recycled: [...new Set([...(chain.recycled ?? []), ...recycled])] } : chain;
  if (!kind) return returnToBottle(prepared, { exhausted: true, chain: nextChain });
  const dealt = startRound(swapRound(prepared), random, {
    preferPackIds: [SPIN_CHAIN_PACK_ID],
    preferCardTypes: [kind],
    participantIds: [chain.targetPlayerId],
    reuseLogicalRoundId: session.currentRound.logicalRoundId,
  });
  if (!dealt.currentRound) return returnToBottle(prepared, { exhausted: true, chain: nextChain });
  return writeChain(dealt, { ...nextChain, kind, phase: spinChainPhaseAfter(spinChainPhaseAfter(chain.phase, "replace"), "question") });
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
