import { describe, expect, it } from "vitest";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { GameSession, Player, SessionConfig } from "@/lib/domain/schemas";
import { completeRound, createSession, skipRound, startRound, swapRound, switchPack, updatePackState } from "@/lib/engine/session-engine";
import { COMPATIBILITY_PACK_ID, createCompatibilityState, recordCompatibilityAnswer } from "@/lib/game-packs/compatibility-test";
import { SPIN_BOTTLE_PACK_ID, recordSpinResult } from "@/lib/game-packs/spin-bottle";
import { createSessionAutosave, sessionRepository } from "@/lib/storage/session-repository";

const players = (count: number): Player[] =>
  ["a", "b", "c", "d"].slice(0, count).map((id) => ({ id, displayName: `玩家${id}`, active: true, createdAt: "x", lastUsedAt: "x" }));

const config = (overrides: Partial<SessionConfig> = {}): SessionConfig => ({
  players: players(3), relationship: "friends", vibes: ["funny"], intensity: 3,
  boundaries: DEFAULT_BOUNDARIES, enabledPackIds: ["never-have", "would-you-rather", "compatibility-test", "spin-bottle", "truth-dare"], mode: "single", ...overrides,
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("session autosave queue", () => {
  it("keeps writes in call order even when an earlier write is slow", async () => {
    const order: string[] = [];
    const gate = deferred();
    const autosave = createSessionAutosave(async (session) => {
      if (session.id === "slow") await gate.promise;
      order.push(session.id);
    });

    const slow = autosave.save({ id: "slow" } as GameSession);
    const fast = autosave.save({ id: "fast" } as GameSession);
    gate.resolve();
    await Promise.all([slow, fast]);

    // 后发起的重要动作不会插队覆盖先发起的（否则刷新会读到更旧的一局）
    expect(order).toEqual(["slow", "fast"]);
  });

  it("flush waits for every queued write so a reload cannot lose the last action", async () => {
    const saved: string[] = [];
    const gate = deferred();
    const autosave = createSessionAutosave(async (session) => {
      await gate.promise;
      saved.push(session.id);
    });

    void autosave.save({ id: "spin-bottle" } as GameSession);
    let flushed = false;
    const flushing = autosave.flush().then(() => { flushed = true; });

    expect(saved).toEqual([]);
    expect(flushed).toBe(false);

    gate.resolve();
    await flushing;
    expect(saved).toEqual(["spin-bottle"]);
  });

  it("keeps saving the following actions after one write fails", async () => {
    const saved: string[] = [];
    const autosave = createSessionAutosave(async (session) => {
      if (session.id === "bad") throw new Error("quota-exceeded");
      saved.push(session.id);
    });

    await expect(autosave.save({ id: "bad" } as GameSession)).rejects.toThrow("quota-exceeded");
    await autosave.save({ id: "good" } as GameSession);
    await autosave.flush();

    expect(saved).toEqual(["good"]);
  });
});

describe("autosave after important actions", () => {
  it("lands switch pack, completed/swapped/skipped, compatibility score and spin result in IndexedDB", async () => {
    const autosave = createSessionAutosave();
    let session = createSession(config(), BUILTIN_SEED_CARDS);
    await autosave.save(session);

    // 1) 切玩法：同一局换 currentPackId，落库后刷新读回的就是新玩法
    session = switchPack(session, "would-you-rather", { enabledPackIds: config().enabledPackIds });
    session = startRound(session, () => 0, { preferPackIds: ["would-you-rather"] });
    await autosave.save(session);
    let stored = await sessionRepository.get(session.id);
    expect(stored?.currentPackId).toBe("would-you-rather");
    expect(stored?.currentRound?.packId).toBe("would-you-rather");

    // 2) completed / swapped / skipped：三种收尾状态各自独立落库
    session = startRound(completeRound(session), () => 0);
    await autosave.save(session);
    session = startRound(swapRound(session), () => 0);
    await autosave.save(session);
    session = startRound(skipRound(session), () => 0);
    await autosave.save(session);
    stored = await sessionRepository.get(session.id);
    expect(stored?.rounds.map((round) => round.status)).toEqual(["completed", "swapped", "skipped"]);

    // 3) 默契测试分数：只在“一样”时 +1，落库即可恢复
    session = updatePackState(session, COMPATIBILITY_PACK_ID, recordCompatibilityAnswer(createCompatibilityState("a", "b"), "same"));
    await autosave.save(session);
    stored = await sessionRepository.get(session.id);
    expect(stored?.currentPackState?.[COMPATIBILITY_PACK_ID]).toEqual({ playerAId: "a", playerBId: "b", score: 1, rounds: 1 });

    // 4) 转瓶子 stable result：动画之前就落库，刷新只恢复最终落点
    session = updatePackState(session, SPIN_BOTTLE_PACK_ID, recordSpinResult("b"));
    await autosave.save(session);
    stored = await sessionRepository.get(session.id);
    expect(stored?.currentPackState?.[SPIN_BOTTLE_PACK_ID]).toEqual({ lastSelectedPlayerId: "b" });

    await autosave.flush();
    await sessionRepository.delete(session.id);
  });
});
