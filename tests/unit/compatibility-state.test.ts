import { describe, expect, it } from "vitest";
import { gameSessionSchema, type GameSession, type Player } from "@/lib/domain/schemas";
import {
  COMPATIBILITY_STATE_KEY,
  compatibilityStateSchema,
  createCompatibilityState,
  defaultCompatibilityPair,
  isPairStillActive,
  isValidCompatibilityPair,
  readCompatibilityState,
  recordCompatibilityAnswer,
  startCompatibilityRound,
} from "@/lib/game-packs/compatibility-test";
import { createSession, updatePackState } from "@/lib/engine/session-engine";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";

const players = (spec: Array<[string, string, boolean]>): Player[] =>
  spec.map(([id, displayName, active]) => ({ id, displayName, active, createdAt: "x", lastUsedAt: "x" }));

const state = (score: number, rounds: number) => ({ playerAId: "alex", playerBId: "emma", score, rounds });

/** 一个真实的默契测试单玩法 Session（与主局落库形态一致），用于持久化断言。 */
const builtinCompatibilitySession = (): GameSession =>
  createSession(
    {
      players: players([["alex", "Alex", true], ["emma", "Emma", true], ["kai", "Kai", true]]),
      relationship: "friends", vibes: ["funny"], intensity: 3, boundaries: DEFAULT_BOUNDARIES,
      enabledPackIds: ["compatibility-test"], mode: "single",
    },
    BUILTIN_SEED_CARDS.filter((card) => card.packId === "compatibility-test"),
  );

describe("compatibility pair selection (T145)", () => {
  it("defaults to the first two active players", () => {
    const pair = defaultCompatibilityPair(players([["alex", "Alex", true], ["emma", "Emma", true], ["kai", "Kai", true]]));
    expect(pair?.map((player) => player.id)).toEqual(["alex", "emma"]);
  });

  it("ignores inactive players and returns undefined with fewer than two active", () => {
    expect(defaultCompatibilityPair(players([["alex", "Alex", true], ["emma", "Emma", false]]))).toBeUndefined();
    expect(defaultCompatibilityPair(players([["alex", "Alex", true]]))).toBeUndefined();
  });

  it("skips inactive players when picking the default pair", () => {
    const pair = defaultCompatibilityPair(players([["alex", "Alex", false], ["emma", "Emma", true], ["kai", "Kai", true]]));
    expect(pair?.map((player) => player.id)).toEqual(["emma", "kai"]);
  });

  it("rejects a pair that repeats the same player", () => {
    expect(isValidCompatibilityPair("alex", "alex")).toBe(false);
    expect(isValidCompatibilityPair("alex", "emma")).toBe(true);
    expect(isValidCompatibilityPair("", "emma")).toBe(false);
  });

  it("treats a persisted pair with a removed/inactive player as no longer active", () => {
    const roster = players([["alex", "Alex", true], ["emma", "Emma", false]]);
    expect(isPairStillActive(roster, { playerAId: "alex", playerBId: "emma" })).toBe(false);
    expect(isPairStillActive(roster, { playerAId: "alex", playerBId: "kai" })).toBe(false);
    expect(isPairStillActive(players([["alex", "Alex", true], ["emma", "Emma", true]]), { playerAId: "alex", playerBId: "emma" })).toBe(true);
  });
});

describe("compatibility score reducer (T147)", () => {
  it("adds 1 point only when the host confirms 一样", () => {
    expect(recordCompatibilityAnswer(state(0, 0), "same")).toEqual(state(1, 1));
    expect(recordCompatibilityAnswer(state(1, 1), "same")).toEqual(state(2, 2));
  });

  it("never scores on 不一样 but still counts the round", () => {
    expect(recordCompatibilityAnswer(state(3, 4), "different")).toEqual(state(3, 5));
    expect(recordCompatibilityAnswer(state(0, 0), "different")).toEqual(state(0, 1));
  });

  it("keeps the pair unchanged while scoring", () => {
    const next = recordCompatibilityAnswer({ playerAId: "kai", playerBId: "leo", score: 2, rounds: 2 }, "same");
    expect(next.playerAId).toBe("kai");
    expect(next.playerBId).toBe("leo");
  });

  it("restarts score and rounds when switching pair", () => {
    const switched = createCompatibilityState("kai", "leo");
    expect(switched).toEqual({ playerAId: "kai", playerBId: "leo", score: 0, rounds: 0 });
  });

  it("counts a round started for the next question", () => {
    expect(startCompatibilityRound(state(2, 2))).toEqual(state(2, 3));
  });
});

describe("compatibility state persistence (T147/T148)", () => {
  it("writes the state under the compatibility key without clobbering other pack state", () => {
    const session = { ...builtinCompatibilitySession(), currentPackState: { spin: { lastSelectedPlayerId: "alex" } } } as GameSession;
    const next = updatePackState(session, COMPATIBILITY_STATE_KEY, createCompatibilityState("alex", "emma"));
    expect(next.currentPackState).toEqual({
      spin: { lastSelectedPlayerId: "alex" },
      compatibility: { playerAId: "alex", playerBId: "emma", score: 0, rounds: 0 },
    });
    expect(next.id).toBe(session.id);
    expect(next.config).toEqual(session.config);
    expect(next.updatedAt).not.toBe(session.updatedAt);
  });

  it("survives a JSON serialize/deserialize round trip through the session schema", () => {
    const session = updatePackState(builtinCompatibilitySession(), COMPATIBILITY_STATE_KEY, state(4, 7));
    const reloaded = gameSessionSchema.parse(JSON.parse(JSON.stringify(session)));
    expect(readCompatibilityState(reloaded)).toEqual(state(4, 7));
  });

  it("reads back the same score and pair a refresh would see", () => {
    const session = updatePackState(builtinCompatibilitySession(), COMPATIBILITY_STATE_KEY, recordCompatibilityAnswer(state(2, 1), "same"));
    const restored = readCompatibilityState(gameSessionSchema.parse(JSON.parse(JSON.stringify(session))));
    expect(restored).toEqual({ playerAId: "alex", playerBId: "emma", score: 3, rounds: 2 });
  });

  it("returns undefined for a missing or corrupted pack state instead of guessing a score", () => {
    expect(readCompatibilityState(builtinCompatibilitySession())).toBeUndefined();
    expect(readCompatibilityState({ currentPackState: { [COMPATIBILITY_STATE_KEY]: { playerAId: "", playerBId: "emma", score: -1, rounds: 0 } } })).toBeUndefined();
    expect(compatibilityStateSchema.safeParse({ playerAId: "alex", playerBId: "emma", score: 1.5, rounds: 0 }).success).toBe(false);
  });

  it("keeps score at zero after 不一样 and only counts the round", () => {
    const session = updatePackState(builtinCompatibilitySession(), COMPATIBILITY_STATE_KEY, createCompatibilityState("alex", "emma"));
    const afterOne = updatePackState(session, COMPATIBILITY_STATE_KEY, recordCompatibilityAnswer(readCompatibilityState(session)!, "different"));
    expect(readCompatibilityState(afterOne)).toEqual(state(0, 1));
  });
});
