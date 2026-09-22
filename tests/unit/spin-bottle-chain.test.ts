import { describe, expect, it } from "vitest";
import { gameSessionSchema, type GameCard, type GameSession, type Intensity, type Player } from "@/lib/domain/schemas";
import { activateSession, createSession, startRound, updatePackState } from "@/lib/engine/session-engine";
import {
  availableSpinChainKinds, availableSpinChainKindsAfterRefill, enterSpinChain, remainingSpinChainCards, replaceInSpinChain, resolveSpinChain, returnToBottle,
  spinChainAvailability, spinChainPhaseAfter, SPIN_CHAIN_PACK_ID,
} from "@/lib/engine/spin-chain";
import { COMPATIBILITY_PACK_ID } from "@/lib/game-packs/compatibility-test";
import { readSpinBottleState, readSpinChain, recordSpinResult, SPIN_BOTTLE_PACK_ID, spinBottleStateSchema } from "@/lib/game-packs/spin-bottle";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import { PACK_PLAYABLE_THRESHOLD } from "@/lib/ai/generate-deck";

const players = (spec: Array<[string, string, boolean]>): Player[] =>
  spec.map(([id, displayName, active]) => ({ id, displayName, active, createdAt: "x", lastUsedAt: "x" }));

const roster = () => players([["p1", "Alex", true], ["p2", "Emma", true], ["p3", "Kai", true]]);

const TRUTH_DARE_CARDS = BUILTIN_SEED_CARDS.filter((card) => card.packId === "truth-dare");

/** 一个真实的转瓶子单玩法 Session：dev 落库形态一致，题卡只有现有 truth-dare（转瓶子自己不需要卡）。 */
const spinSession = (mode: "single" | "mixed" = "single"): GameSession =>
  createSession(
    {
      players: roster(), relationship: "friends", vibes: ["funny"], intensity: 3, boundaries: DEFAULT_BOUNDARIES,
      enabledPackIds: ["spin-bottle", "truth-dare"], mode,
    },
    TRUTH_DARE_CARDS,
  );

const cardOf = (session: GameSession) => session.deckSnapshot.find((card) => card.id === session.currentRound?.cardId);
const usedAllOfType = (type: "truth" | "dare") => TRUTH_DARE_CARDS.filter((card) => card.type === type).map((card) => card.id);

describe("转瓶子是纯本地玩法：不出题卡 (T150/T151)", () => {
  it("leaves the session without a round instead of dealing a card from another pack", () => {
    const session = { ...spinSession("mixed"), currentPackId: "spin-bottle" } as GameSession;
    expect(startRound(session, () => 0)).toBe(session);
    expect(startRound(session, () => 0).currentRound).toBeUndefined();
  });

  it("still deals normally for card-based packs", () => {
    const dealt = startRound({ ...spinSession(), currentPackId: "truth-dare" } as GameSession, () => 0);
    expect(dealt.currentRound?.packId).toBe("truth-dare");
  });
});

describe("链的相位机：enter → question → replacing/resolving → returning (V1.5)", () => {
  it("walks the only legal path and is idempotent on repeats", () => {
    let phase = spinChainPhaseAfter("idle", "enter");
    expect(phase).toBe("enter");
    phase = spinChainPhaseAfter(phase, "question");
    expect(phase).toBe("question");
    expect(spinChainPhaseAfter(phase, "replace")).toBe("replacing");
    expect(spinChainPhaseAfter(spinChainPhaseAfter(phase, "replace"), "question")).toBe("question");
    expect(spinChainPhaseAfter(phase, "resolve")).toBe("resolving");
    expect(spinChainPhaseAfter("resolving", "return")).toBe("returning");
    // 回瓶子后可以再开下一轮链
    expect(spinChainPhaseAfter("returning", "enter")).toBe("enter");
    // 重复同一事件保持原相位（幂等）
    expect(spinChainPhaseAfter("question", "question")).toBe("question");
  });

  it("refuses illegal jumps instead of silently corrupting the chain", () => {
    expect(() => spinChainPhaseAfter("idle", "question")).toThrow(/illegal-spin-chain-transition/);
    expect(() => spinChainPhaseAfter("resolving", "question")).toThrow(/illegal-spin-chain-transition/);
    expect(() => spinChainPhaseAfter("returning", "resolve")).toThrow(/illegal-spin-chain-transition/);
  });
});

describe("转瓶子结果链入现有真心话大冒险 (T152 / FR-021)", () => {
  it("chains 真心话 into the existing truth-dare pack on the same session", () => {
    const session = spinSession();
    const next = enterSpinChain(session, { targetPlayerId: "p1", targetName: "Alex", kind: "truth" }, [], () => 0);

    expect(next).not.toBe(session);
    expect(next.id).toBe(session.id);
    expect(next.config).toEqual(session.config);
    expect(next.currentPackId).toBe(SPIN_CHAIN_PACK_ID);
    expect(next.currentRound?.packId).toBe(SPIN_CHAIN_PACK_ID);
    expect(cardOf(next)?.type).toBe("truth");
    // 被指到的人作答：本轮参与者就是转瓶子选中的人，不再随机换人
    expect(next.currentRound?.participantIds).toEqual(["p1"]);
    // 没有第二套一局/第二套题卡：用的还是现有 truth-dare seed
    expect(cardOf(next)?.source).toBe("builtin");
    // 链相位与姓名快照落在转瓶子自己的 state 里
    expect(readSpinChain(next)).toEqual({ phase: "question", kind: "truth", targetPlayerId: "p1", targetName: "Alex" });
    // 链入是同一段：手动切包才会重开段，链不重计轮次
    expect(next.currentSegmentId).toBe(session.currentSegmentId);
  });

  it("chains 大冒险 into dare cards", () => {
    const next = enterSpinChain(spinSession(), { targetPlayerId: "p3", targetName: "Kai", kind: "dare" }, [], () => 0);
    expect(cardOf(next)?.type).toBe("dare");
    expect(cardOf(next)?.packId).toBe("truth-dare");
    expect(next.currentRound?.participantIds).toEqual(["p3"]);
    expect(readSpinChain(next)?.kind).toBe("dare");
  });

  it("works the same way from a mixed-mode session", () => {
    const next = enterSpinChain(spinSession("mixed"), { targetPlayerId: "p2", targetName: "Emma", kind: "truth" }, [], () => 0);
    expect(next.currentPackId).toBe("truth-dare");
    expect(cardOf(next)?.type).toBe("truth");
    expect(next.currentRound?.participantIds).toEqual(["p2"]);
  });

  it("keeps the pointed player even after they leave the table（离场不换人）", () => {
    const entered = enterSpinChain(spinSession(), { targetPlayerId: "p1", targetName: "Alex", kind: "truth" }, [], () => 0);
    // 人走了：active=false，但本轮早就固定成他，换题也不重抽
    const left = { ...entered, config: { ...entered.config, players: players([["p1", "Alex", false], ["p2", "Emma", true], ["p3", "Kai", true]]) } } as GameSession;
    const replaced = replaceInSpinChain(left, [], () => 0);
    expect(replaced.currentRound?.participantIds).toEqual(["p1"]);
    expect(readSpinChain(replaced)?.targetName).toBe("Alex");
  });

  it("换题不换人：replacing keeps the same participant and the same display round number", () => {
    const entered = enterSpinChain(spinSession(), { targetPlayerId: "p2", targetName: "Emma", kind: "truth" }, [], () => 0);
    const replaced = replaceInSpinChain(entered, [], () => 0);

    expect(replaced).not.toBe(entered);
    expect(replaced.currentRound?.participantIds).toEqual(["p2"]);
    expect(replaced.currentRound?.cardId).not.toBe(entered.currentRound?.cardId);
    // 「换一个」不推进显示轮次：编号与逻辑轮次都复用
    expect(replaced.currentRound?.displayRoundNo).toBe(entered.currentRound?.displayRoundNo);
    expect(replaced.currentRound?.logicalRoundId).toBe(entered.currentRound?.logicalRoundId);
    expect(replaced.rounds.at(-1)).toMatchObject({ id: entered.currentRound?.id, status: "swapped" });
    expect(readSpinChain(replaced)?.phase).toBe("question");
  });

  it("完成 → resolving/returning：自动回瓶子 ready，并保留落点给下一次躲避", () => {
    const entered = updatePackState(enterSpinChain(spinSession(), { targetPlayerId: "p1", targetName: "Alex", kind: "truth" }, [], () => 0), SPIN_BOTTLE_PACK_ID, { lastSelectedPlayerId: "p1", chain: readSpinChain(enterSpinChain(spinSession(), { targetPlayerId: "p1", targetName: "Alex", kind: "truth" }, [], () => 0))! });
    const back = resolveSpinChain(entered);

    expect(back.currentPackId).toBe(SPIN_BOTTLE_PACK_ID);
    expect(back.currentRound).toBeUndefined();
    expect(readSpinChain(back)?.phase).toBe("returning");
    expect(readSpinBottleState(back)?.lastSelectedPlayerId).toBe("p1");
    // 完成的题留在轮次账里（不做无痕丢弃）
    expect(back.rounds.at(-1)).toMatchObject({ packId: SPIN_CHAIN_PACK_ID, status: "completed", participantIds: ["p1"] });
  });

  it("回瓶子后落点与链账都还在（刷新能直接进 ready）", () => {
    const entered = enterSpinChain(spinSession(), { targetPlayerId: "p3", targetName: "Kai", kind: "dare" }, [], () => 0);
    const back = returnToBottle(entered);
    const reloaded = gameSessionSchema.parse(JSON.parse(JSON.stringify(back)));
    expect(readSpinChain(reloaded)?.phase).toBe("returning");
    expect(reloaded.currentPackId).toBe(SPIN_BOTTLE_PACK_ID);
  });
});

describe("空牌堆单开局也能链入出题 (V1.5 热修)", () => {
  /** 转瓶子单开局的真实形态：只启用 spin-bottle，纯本地玩法建局不填牌堆。 */
  const cardlessSession = (): GameSession =>
    activateSession(createSession(
      {
        players: roster(), relationship: "friends", vibes: ["funny"], intensity: 3, boundaries: DEFAULT_BOUNDARIES,
        enabledPackIds: ["spin-bottle"], mode: "single",
      },
      [],
    ), []);

  it("链入前先补 truth-dare 种子再出题：可用态按补位后算，不再误判成空转", () => {
    const session = cardlessSession();
    expect(session.deckSnapshot).toHaveLength(0);
    // 空牌堆直接判可用的话会两类都判死，结果页按钮全禁——这正是热修前的病根
    expect(availableSpinChainKinds(session)).toEqual([]);
    expect(availableSpinChainKindsAfterRefill(session)).toEqual(["truth", "dare"]);

    const next = enterSpinChain(session, { targetPlayerId: "p1", targetName: "Alex", kind: "truth" }, [], () => 0);
    expect(next.currentPackId).toBe(SPIN_CHAIN_PACK_ID);
    expect(cardOf(next)?.packId).toBe(SPIN_CHAIN_PACK_ID);
    expect(cardOf(next)?.type).toBe("truth");
    expect(cardOf(next)?.source).toBe("builtin");
    expect(next.currentRound?.participantIds).toEqual(["p1"]);
    // 补位只加不重：牌堆里没有重复卡（出过的那张记在 usedCardIds，不算重复）
    const deckIds = next.deckSnapshot.map((card) => card.id);
    expect(new Set(deckIds).size).toBe(deckIds.length);
    expect(next.usedCardIds).toHaveLength(1);
  });

  it("补位不碰已有牌：混合局里已有的 AI/自定义卡原样保留", () => {
    const aiCard: GameCard = {
      id: "ai-truth-1", packId: "truth-dare", type: "truth", content: "AI 出的真心话", instruction: "轮到的玩家回答",
      intensity: 3, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "single", source: "ai",
    };
    const session = activateSession(createSession(
      {
        players: roster(), relationship: "friends", vibes: ["funny"], intensity: 3, boundaries: DEFAULT_BOUNDARIES,
        enabledPackIds: ["spin-bottle", "truth-dare"], mode: "single",
      },
      [aiCard],
    ), [aiCard]);
    expect(availableSpinChainKindsAfterRefill(session)).toContain("truth");
    const entered = enterSpinChain(session, { targetPlayerId: "p1", targetName: "Alex", kind: "truth" }, [], () => 0);
    // 已有的 AI 卡原样保留，seed 只是补在后面
    expect(entered.deckSnapshot.map((card) => card.id)).toContain("ai-truth-1");
    expect(entered.deckSnapshot.length).toBeGreaterThan(1);
  });

  it("换题（replacing）在空牌堆下同样能重出同类型题", () => {
    const session = cardlessSession();
    const entered = enterSpinChain(session, { targetPlayerId: "p1", targetName: "Alex", kind: "truth" }, [], () => 0);
    // 模拟落库后牌堆又见底：换题前置补位同样要兜住
    const replaced = replaceInSpinChain({ ...entered, deckSnapshot: [] } as GameSession, [], () => 0);
    expect(replaced.currentPackId).toBe(SPIN_CHAIN_PACK_ID);
    expect(cardOf(replaced)?.packId).toBe(SPIN_CHAIN_PACK_ID);
    expect(cardOf(replaced)?.type).toBe("truth");
    expect(replaced.currentRound?.participantIds).toEqual(["p1"]);
    expect(readSpinChain(replaced)?.phase).toBe("question");
  });
});

describe("题卡耗尽：L1 洗牌不断游 + 真缺口才回瓶子 (V1.6)", () => {
  it("truth 出完了 → L1 洗回来照样出 truth（重复，不断游），不偷偷换类型", () => {
    const session = { ...spinSession(), usedCardIds: usedAllOfType("truth") } as GameSession;
    // 新鲜卡只剩 dare，但 truth 整类还在（洗完就能出）
    expect(availableSpinChainKinds(session)).toEqual(["dare"]);
    expect(spinChainAvailability(session)).toEqual({ available: ["truth", "dare"], recycled: ["truth"] });

    const next = enterSpinChain(session, { targetPlayerId: "p1", targetName: "Alex", kind: "truth" }, [], () => 0);
    expect(cardOf(next)?.type).toBe("truth"); // 点真心话就给真心话（题目会重复）
    expect(readSpinChain(next)).toMatchObject({ phase: "question", kind: "truth" });
    expect(readSpinChain(next)?.recycled).toContain("truth");
  });

  it("两类都出过 → L1 把请求那类洗回来继续出题（题目会重复，不断游）", () => {
    const session = { ...spinSession(), usedCardIds: TRUTH_DARE_CARDS.map((card) => card.id) } as GameSession;
    // 新鲜卡为 0：直接判可用确实两类都判死
    expect(availableSpinChainKinds(session)).toEqual([]);
    expect(spinChainAvailability(session).recycled).toEqual(["truth", "dare"]);

    const next = enterSpinChain(session, { targetPlayerId: "p1", targetName: "Alex", kind: "truth" }, [], () => 0);
    // 不断游：洗完照样进 truth-dare 出题，不空转回瓶子
    expect(next.currentPackId).toBe(SPIN_CHAIN_PACK_ID);
    expect(next.currentRound?.packId).toBe(SPIN_CHAIN_PACK_ID);
    expect(cardOf(next)?.type).toBe("truth");
    expect(readSpinChain(next)).toMatchObject({ phase: "question", kind: "truth" });
    // 链账记下洗过哪类，刷新后提示还在
    expect(readSpinChain(next)?.recycled).toContain("truth");
    // 结果页两个去向仍可点（按补位+洗牌后的可用态算），不出现「全禁」死局
    expect(availableSpinChainKindsAfterRefill(next)).toEqual(["truth", "dare"]);
  });

  it("题池真缺口（全被人数挡掉）才回瓶子 ready 并标记 exhausted", () => {
    const solo = { ...spinSession(), config: { ...spinSession().config, players: players([["p1", "Alex", true]]) } } as GameSession;
    expect(availableSpinChainKindsAfterRefill(solo)).toEqual([]);
    const next = enterSpinChain(solo, { targetPlayerId: "p1", targetName: "Alex", kind: "truth" }, [], () => 0);
    expect(next.currentPackId).toBe(SPIN_BOTTLE_PACK_ID);
    expect(next.currentRound).toBeUndefined();
    expect(readSpinChain(next)).toMatchObject({ phase: "returning", exhausted: true, targetPlayerId: "p1", targetName: "Alex" });
  });
});

describe("L2 后台补题的触发口径：链内某类剩余 < 3 (V1.6)", () => {
  const truths = TRUTH_DARE_CARDS.filter((card) => card.type === "truth");
  const ALLOW_BOUNDARIES = {
    noPhysicalContact: false, noAlcoholPenalty: false, noExPartners: false, noSexualHistory: false, noMoneyIncome: false,
    noPhonePrivacy: false, noPublicPosting: false, noStrangerContact: false, noPhotoVideo: false, noSocialAccounts: false, customText: "",
  };

  it("剩余＝该类「没用过且过尺度/雷区」的卡数，只有低于阈值的那类才该补", () => {
    const fresh = remainingSpinChainCards(spinSession());
    expect(fresh.truth).toBe(fresh.dare); // 两档种子配额对称
    expect(fresh.truth).toBeGreaterThan(PACK_PLAYABLE_THRESHOLD); // 开局远高于阈值，不该触发补题

    // 放开尺度/雷区后剩余＝未用卡数：留最后 2 张没用 → 2 < 3，正是后台 refill 的触发条件
    const almostDone: GameSession = {
      ...spinSession(),
      config: { ...spinSession().config, intensity: 5 as Intensity, boundaries: ALLOW_BOUNDARIES },
      usedCardIds: truths.slice(0, truths.length - 2).map((card) => card.id),
    };
    const remaining = remainingSpinChainCards(almostDone);
    expect(remaining.truth).toBe(2);
    expect(remaining.truth).toBeLessThan(PACK_PLAYABLE_THRESHOLD);
    expect(remaining.dare).toBeGreaterThan(PACK_PLAYABLE_THRESHOLD); // 另一类没动，仍远高于阈值
  });

  it("整类被雷区/人数挡掉时剩余为 0（真缺口，L2 也补不回来，回瓶子）", () => {
    const solo = { ...spinSession(), config: { ...spinSession().config, players: players([["p1", "Alex", true]]) } } as GameSession;
    expect(remainingSpinChainCards(solo)).toEqual({ truth: 0, dare: 0 });
  });
});

describe("usedCard 按 packId:type 隔离、切换不清零 (V1.5)", () => {
  it("用过一张 truth 不会影响 dare 的可出题性", () => {
    const session = { ...spinSession(), usedCardIds: usedAllOfType("truth") } as GameSession;
    expect(availableSpinChainKinds(session)).toContain("dare");
  });

  it("链返回瓶子后 usedCardIds 原样保留，不因为换玩法被清零", () => {
    const entered = enterSpinChain(spinSession(), { targetPlayerId: "p1", targetName: "Alex", kind: "truth" }, [], () => 0);
    const back = returnToBottle(entered);
    expect(back.usedCardIds).toEqual(entered.usedCardIds);
    expect(back.usedCardIds).toHaveLength(1);
  });
});

describe("转瓶子落点持久化 (T187 · 刷新只恢复结果)", () => {
  it("writes the target under its own pack-state key without clobbering other packs", () => {
    const session = updatePackState(updatePackState(spinSession(), COMPATIBILITY_PACK_ID, { playerAId: "p1", playerBId: "p2", score: 1, rounds: 1 }), SPIN_BOTTLE_PACK_ID, recordSpinResult("p2"));
    expect(session.currentPackState?.[SPIN_BOTTLE_PACK_ID]).toEqual({ lastSelectedPlayerId: "p2" });
    expect(session.currentPackState?.[COMPATIBILITY_PACK_ID]).toEqual({ playerAId: "p1", playerBId: "p2", score: 1, rounds: 1 });
  });

  it("survives a serialize/deserialize round trip through the session schema", () => {
    const session = updatePackState(spinSession(), SPIN_BOTTLE_PACK_ID, recordSpinResult("p3"));
    const reloaded = gameSessionSchema.parse(JSON.parse(JSON.stringify(session)));
    expect(readSpinBottleState(reloaded)).toEqual({ lastSelectedPlayerId: "p3" });
  });

  it("returns undefined for a missing or corrupted state instead of guessing a target", () => {
    expect(readSpinBottleState(spinSession())).toBeUndefined();
    expect(readSpinBottleState({ currentPackState: { [SPIN_BOTTLE_PACK_ID]: { lastSelectedPlayerId: "" } } })).toBeUndefined();
    expect(spinBottleStateSchema.safeParse({ lastSelectedPlayerId: 7 }).success).toBe(false);
    // 链账坏掉时整格判为读不出来，不猜落点也不猜相位
    expect(readSpinBottleState({ currentPackState: { [SPIN_BOTTLE_PACK_ID]: { chain: { phase: "question" } } } })).toBeUndefined();
  });
});
