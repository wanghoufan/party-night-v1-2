import { describe, expect, it } from "vitest";
import { gameSessionSchema, type GameSession, type Player } from "@/lib/domain/schemas";
import { createSession, startRound, updatePackState } from "@/lib/engine/session-engine";
import { chainSpinToTruthOrDare, SPIN_CHAIN_PACK_ID } from "@/lib/engine/spin-chain";
import { COMPATIBILITY_PACK_ID } from "@/lib/game-packs/compatibility-test";
import { readSpinBottleState, recordSpinResult, SPIN_BOTTLE_PACK_ID, spinBottleStateSchema } from "@/lib/game-packs/spin-bottle";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";

const players = (spec: Array<[string, string, boolean]>): Player[] =>
  spec.map(([id, displayName, active]) => ({ id, displayName, active, createdAt: "x", lastUsedAt: "x" }));

const roster = () => players([["p1", "Alex", true], ["p2", "Emma", true], ["p3", "Kai", true]]);

/** 一个真实的转瓶子单玩法 Session：dev 落库形态一致，题卡只有现有 truth-dare（转瓶子自己不需要卡）。 */
const spinSession = (mode: "single" | "mixed" = "single"): GameSession =>
  createSession(
    {
      players: roster(), relationship: "friends", vibes: ["funny"], intensity: 3, boundaries: DEFAULT_BOUNDARIES,
      enabledPackIds: ["spin-bottle", "truth-dare"], mode,
    },
    BUILTIN_SEED_CARDS.filter((card) => card.packId === "truth-dare"),
  );

const cardOf = (session: GameSession) => session.deckSnapshot.find((card) => card.id === session.currentRound?.cardId);

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

describe("转瓶子结果链入现有真心话大冒险 (T152 / FR-021)", () => {
  it("chains 真心话 into the existing truth-dare pack on the same session", () => {
    const session = spinSession();
    const next = chainSpinToTruthOrDare(session, "p1", "truth", [], () => 0);

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
  });

  it("chains 大冒险 into dare cards", () => {
    const next = chainSpinToTruthOrDare(spinSession(), "p3", "dare", [], () => 0);
    expect(cardOf(next)?.type).toBe("dare");
    expect(cardOf(next)?.packId).toBe("truth-dare");
    expect(next.currentRound?.participantIds).toEqual(["p3"]);
  });

  it("works the same way from a mixed-mode session", () => {
    const next = chainSpinToTruthOrDare(spinSession("mixed"), "p2", "truth", [], () => 0);
    expect(next.currentPackId).toBe("truth-dare");
    expect(cardOf(next)?.type).toBe("truth");
    expect(next.currentRound?.participantIds).toEqual(["p2"]);
  });

  it("does nothing when the spun player already left the table", () => {
    const session = { ...spinSession(), config: { ...spinSession().config, players: players([["p1", "Alex", false], ["p2", "Emma", true], ["p3", "Kai", true]]) } } as GameSession;
    expect(chainSpinToTruthOrDare(session, "p1", "truth", [], () => 0)).toBe(session);
    expect(chainSpinToTruthOrDare(session, "ghost", "dare", [], () => 0)).toBe(session);
  });

  it("falls back to any truth-dare card when the requested type runs out, instead of stalling", () => {
    const session = { ...spinSession(), usedCardIds: BUILTIN_SEED_CARDS.filter((card) => card.packId === "truth-dare" && card.type === "truth").map((card) => card.id) } as GameSession;
    const next = chainSpinToTruthOrDare(session, "p1", "truth", [], () => 0);
    expect(next.currentRound?.packId).toBe("truth-dare");
    expect(cardOf(next)?.type).toBe("dare");
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
  });
});
