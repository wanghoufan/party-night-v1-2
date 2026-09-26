import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import { gameSessionSchema, type GameCard, type GameSession, type Player, type SessionConfig } from "@/lib/domain/schemas";
import { completeRound, createSession, startRound } from "@/lib/engine/session-engine";
import { applyHostDecisionToSession, awaitingHostDecision, createDeckRouter, drawDeckCard, orchestrationOf } from "@/lib/engine/v2-deal";
import { mainlineSsotCards, mainlineSsotCardsByPack } from "@/lib/v2-content/v2-card-bridge";
import { getV2ContentAdapter } from "@/lib/v2-content/v2-content-adapter";
import { NO_ELIGIBLE_PAIR_HINT, pairModeFor } from "@/lib/v2-relationship/v2-participants";
import { createInitialRelationshipState, type SessionParticipant } from "@/lib/v2-relationship/v2-state";
import type { V2RouterInput } from "@/lib/v2-relationship/v2-session";

/* ------------------------------------------------------------------ */
/* 装置                                                                  */
/* ------------------------------------------------------------------ */

const players = (count = 3, active = count): Player[] =>
  ["a", "b", "c"].slice(0, count).map((id, index) => ({ id, displayName: `玩家${id}`, active: index < active, createdAt: "x", lastUsedAt: "x" }));

const config = (overrides: Partial<SessionConfig> = {}): SessionConfig => ({
  players: players(), relationship: "friends", vibes: ["funny"], intensity: 3,
  boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ["truth-dare"], mode: "single", ...overrides,
});

/** 两张自造卡（非 SSOT：不带 Heat/Pair 元数据，等同旧 seed 卡的兼容路径）。 */
const localCards: GameCard[] = [1, 2].map((n) => ({
  id: `local-${n}`, packId: "truth-dare", type: "truth", content: `本地题 ${n}`,
  intensity: 1, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "all", source: "builtin",
}));

const male = (playerId: string): SessionParticipant => ({ playerId, active: true, pairGender: "male" });
const female = (playerId: string): SessionParticipant => ({ playerId, active: true, pairGender: "female" });

const genders = (): SessionParticipant[] => [male("a"), female("b"), { playerId: "c", active: true, pairGender: null }];

/** 连抽 n 轮（每轮完成后再抽），返回每轮抽到的卡 id 与最后一轮之后的 Session。 */
function dealRounds(session: GameSession, rounds: number): { ids: string[]; session: GameSession } {
  let current = session;
  const ids: string[] = [];
  for (let index = 0; index < rounds; index += 1) {
    current = startRound(current, () => 0);
    if (current.currentRound) ids.push(current.currentRound.cardId);
    current = completeRound(current);
  }
  return { ids, session: current };
}

/** 把两张牌的牌堆打空，再抽一次即进入 AWAITING_HOST_EXHAUSTION_DECISION。 */
const exhaust = (session: GameSession): GameSession => startRound(dealRounds(session, 2).session, () => 0);

/* ------------------------------------------------------------------ */
/* 1. 主链出卡：唯一入口是 V2 编排器                                        */
/* ------------------------------------------------------------------ */

describe("B8 /game 主链出卡（V2 编排器）", () => {
  it("出卡写回 relationshipState/recentCardIds 与 v2Orchestration（BUCKET_OK）", () => {
    const session = startRound(createSession(config(), [...localCards], genders()), () => 0);

    expect(session.currentRound?.cardId).toBe("local-1");
    expect(session.usedCardIds).toEqual(["local-1"]);
    expect(session.relationshipState?.recentCardIds).toEqual(["local-1"]);
    expect(session.relationshipState?.usedCardIds).toEqual(["local-1"]);
    expect(session.v2Orchestration?.lastExhaustionLevel).toBe("BUCKET_OK");
    expect(session.v2Orchestration?.awaitingHostDecision).toBe(false);
  });

  it("多轮不重复出卡，且不越过强度上限", () => {
    const pool: GameCard[] = [1, 2, 3].map((n) => ({ ...localCards[0]!, id: `p-${n}`, content: `题 ${n}`, intensity: (n === 3 ? 5 : 1) as 1 | 5 }));
    const lowered = { ...createSession(config({ intensity: 3 }), pool, genders()) };
    const { ids, session } = dealRounds(lowered, 2);

    expect(new Set(ids).size).toBe(2);
    expect(ids).not.toContain("p-3"); // 5 档被 intensityLimit=3 挡住
    expect(session.rounds).toHaveLength(2);
  });

  it("主链出的卡一定是本局牌堆里的卡（离线可渲染）", () => {
    const session = startRound(createSession(config(), [...localCards], genders()), () => 0);
    const id = session.currentRound?.cardId;
    expect(session.deckSnapshot.some((card) => card.id === id)).toBe(true);
  });

  /* ---------------------------------------------------------------- */
  /* 2. 耗尽：AWAITING + Host 二选一                                     */
  /* ---------------------------------------------------------------- */

  it("三层皆空 → AWAITING_HOST_EXHAUSTION_DECISION，不自动洗牌、不自动结束", () => {
    const first = startRound(createSession(config(), [...localCards], genders()), () => 0);
    const second = startRound(completeRound(first), () => 0);
    const third = startRound(completeRound(second), () => 0);

    expect(second.currentRound?.cardId).toBe("local-2");
    expect(third.currentRound).toBeUndefined();
    expect(third.status).toBe("active");
    expect(third.v2Orchestration?.awaitingHostDecision).toBe(true);
    expect(third.v2Orchestration?.lastExhaustionLevel).toBe("AWAITING_HOST_EXHAUSTION_DECISION");
    expect(awaitingHostDecision(third)?.idempotencyKey).toBe(`${third.id}::1`);
  });

  it("Host 选「结束本局」：used 与 cycle 不变，标记 finished", () => {
    const exhausted = exhaust(createSession(config(), [...localCards], genders()));
    const awaiting = awaitingHostDecision(exhausted)!;
    const finished = applyHostDecisionToSession(exhausted, awaiting, "finish");

    expect(finished.v2Orchestration?.finished).toBe(true);
    expect(finished.v2Orchestration?.awaitingHostDecision).toBe(false);
    expect(finished.usedCardIds).toEqual(["local-1", "local-2"]);
    expect(finished.relationshipState?.exhaustionCycle).toBe(0);
  });

  it("Host 选「洗牌再玩」：只清 used＋cycle+1，recent/Heat/MATCH/5 档全保留，且能再出卡", () => {
    const base = exhaust(createSession(config(), [...localCards], genders()));
    const tracked = gameSessionSchema.parse({
      ...base,
      relationshipState: {
        ...createInitialRelationshipState(),
        heat: "H3",
        usedCardIds: base.usedCardIds,
        recentCardIds: ["local-1", "local-2"],
        matches: { "a::b": { pairKey: "a::b", matchedAt: "2026-01-01T00:00:00.000Z", playerIds: ["a", "b"] } },
        fiveGuarantees: {
          "a::b": { pairKey: "a::b", tracker: { status: "offered", qualifyingOpportunitiesSeen: 1, qualifyingOpportunitiesLimit: 2, createdAtEffectiveCount: 3 } },
        },
      },
    }) as GameSession;

    const awaiting = awaitingHostDecision(tracked)!;
    const shuffled = applyHostDecisionToSession(tracked, awaiting, "reshuffle");

    expect(shuffled.usedCardIds).toEqual([]);
    expect(shuffled.relationshipState?.exhaustionCycle).toBe(1);
    expect(shuffled.relationshipState?.heat).toBe("H3");
    expect(shuffled.relationshipState?.recentCardIds).toEqual(["local-1", "local-2"]);
    expect(shuffled.relationshipState?.matches["a::b"]).toBeDefined();
    expect(shuffled.relationshipState?.fiveGuarantees["a::b"]?.tracker?.status).toBe("offered");
    // 洗牌后回统一 Router 再抽：软去重窗口放宽到 0 仍能从 recent 里救回一张
    const dealt = startRound(shuffled, () => 0);
    expect(dealt.currentRound).toBeDefined();
    expect(["local-1", "local-2"]).toContain(dealt.currentRound?.cardId);
  });

  it("幂等重放：同一幂等键重复应用不重复清零、不多加 cycle", () => {
    const exhausted = exhaust(createSession(config(), [...localCards], genders()));
    const awaiting = awaitingHostDecision(exhausted)!;
    const first = applyHostDecisionToSession(exhausted, awaiting, "reshuffle");
    const second = applyHostDecisionToSession(first, awaiting, "reshuffle");
    const third = applyHostDecisionToSession(second, awaiting, "reshuffle");

    expect(first.relationshipState?.exhaustionCycle).toBe(1);
    expect(second.relationshipState?.exhaustionCycle).toBe(1);
    expect(third.relationshipState?.exhaustionCycle).toBe(1);
    expect(second.usedCardIds).toEqual([]);
    expect(second.v2Orchestration?.hostDecisions[`${exhausted.id}::1`]).toBeDefined();
  });

  /* ---------------------------------------------------------------- */
  /* 3. D4=A 降级：NO_ELIGIBLE_PAIR 走普通玩法，提示中性                     */
  /* ---------------------------------------------------------------- */

  it("无合法 pair → NO_ELIGIBLE_PAIR：普通玩法照常出卡，提示不含男女字样，Player 档案无性别字段", () => {
    const noGender = players().map((player) => ({ playerId: player.id, active: player.active, pairGender: null }));
    expect(pairModeFor(noGender)).toBe("NO_ELIGIBLE_PAIR");
    expect(pairModeFor(genders())).toBe("ACTIVE");

    const deck = [...mainlineSsotCardsByPack("truth-dare")];
    const session = startRound(createSession(config(), deck, noGender), () => 0);

    expect(session.currentRound).toBeDefined();
    expect(session.deckSnapshot.some((card) => card.id === session.currentRound?.cardId)).toBe(true);
    // 中性提示：不出现「男 / 女」
    expect(NO_ELIGIBLE_PAIR_HINT).not.toMatch(/男|女/);
    // pairGender 只随当局 Session 走，不回写 Player 档案
    expect(session.participants?.every((item) => item.pairGender === null)).toBe(true);
    expect(session.config.players.every((player) => !("pairGender" in player))).toBe(true);
  });

  it("需要 MATCH 的卡在没有 MATCH 时不出（不空转、不猜人）", () => {
    const meta = getV2ContentAdapter().mainlineCards.find((card) => card.targetMode === "match-pair" && card.gameType === "truth")!;
    const matchCard = mainlineSsotCards().find((card) => card.id === meta.cardId);
    expect(matchCard).toBeDefined();
    const fallback = mainlineSsotCards().find((card) => card.packId === "truth-dare" && card.id === "PN-TRUTH-001")!;
    const participants = [male("a"), female("b")];
    const base: V2RouterInput = {
      relationship: { ...createInitialRelationshipState(), heat: "H4" },
      participants,
      targetPairKey: "a::b",
      intensityLimit: 5,
      softDedupWindow: 5,
      requireFiveTierForPair: null,
    };
    const router = createDeckRouter({ deck: [matchCard!, fallback], preferredPackIds: ["truth-dare"], enabledPackIds: ["truth-dare"] });

    expect(router.bucket(base).map((card) => card.cardId)).not.toContain(matchCard!.id);
    // 建了 MATCH 之后同一张卡才可出
    const matched: V2RouterInput = {
      ...base,
      relationship: {
        ...base.relationship,
        matches: { "a::b": { pairKey: "a::b", matchedAt: "2026-01-01T00:00:00.000Z", playerIds: ["a", "b"] } },
      },
    };
    expect(router.bucket(matched).map((card) => card.cardId)).toContain(matchCard!.id);
  });

  /* ---------------------------------------------------------------- */
  /* 4. 旧引用消除：生产链不再 import 旧 selector                            */
  /* ---------------------------------------------------------------- */

  it("旧引用消除：生产代码（lib/app/components）无人 import lib/engine/card-selector", () => {
    const roots = ["lib", "app", "components"];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const code = readFileSync(full, "utf8");
        if (/from\s+["'][^"']*card-selector["']/.test(code)) offenders.push(relative(process.cwd(), full));
      }
    };
    for (const root of roots) walk(join(process.cwd(), root));

    expect(offenders).toEqual([]);
    // 旧 selector 文件本身仍在仓库留档（生产不可达）
    expect(readFileSync(join(process.cwd(), "lib/engine/card-selector.ts"), "utf8")).toMatch(/INTENSITY_WEIGHT/);
  });

  it("抽卡入口确实是 V2 适配器（orchestrationOf 供恢复读取）", () => {
    const session = createSession(config(), [...localCards], genders());
    expect(orchestrationOf(session).awaitingHostDecision).toBe(false);
    expect(orchestrationOf(session).softDedupWindow).toBe(5);
    const { card } = drawDeckCard({ session, preferredPackIds: ["truth-dare"], enabledPackIds: ["truth-dare"] });
    expect(card?.id).toBe("local-1");
  });
});
