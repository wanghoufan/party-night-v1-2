import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  beginMutualCheckRun,
  clearMutualCheckRun,
  finalizeMutualCheckRun,
  mutualCandidateIds,
  mutualCheckFinalEvents,
  mutualCheckTrigger,
  submitMutualChoice,
} from "@/lib/v2-relationship/v2-mutual-check";
import { mutualResult } from "@/lib/v2-relationship/v2-private";
import { reduceRelationshipEvent } from "@/lib/v2-relationship/v2-reducer";
import { createV2SessionState, reduceV2SessionEvents } from "@/lib/v2-relationship/v2-session";
import {
  createInitialRelationshipState,
  type RelationshipState,
  type SessionParticipant,
} from "@/lib/v2-relationship/v2-state";

/* ------------------------------------------------------------------ */
/* 装置                                                                  */
/* ------------------------------------------------------------------ */

const participant = (
  playerId: string,
  pairGender: SessionParticipant["pairGender"],
  active = true,
): SessionParticipant => ({ playerId, active, pairGender });

/** 4 人 2 男 2 女：a/c 男、b/d 女 → 合法边 a::b、a::d、b::c、c::d。 */
const QUAD: SessionParticipant[] = [
  participant("a", "male"),
  participant("b", "female"),
  participant("c", "male"),
  participant("d", "female"),
];

const rel = (overrides: Partial<RelationshipState> = {}): RelationshipState => ({
  ...createInitialRelationshipState(),
  ...overrides,
});

const matchOf = (first: string, second: string) => ({
  pairKey: [first, second].sort().join("::"),
  matchedAt: "2026-01-01T00:00:00.000Z",
  playerIds: [first, second] as [string, string],
});

const withoutMatch = (state: RelationshipState, key: string): RelationshipState => {
  const matches = { ...state.matches };
  delete matches[key];
  return { ...state, matches };
};

/* ------------------------------------------------------------------ */
/* 1. 触发判定（v2-state 口径 + D4 合法 pair）                              */
/* ------------------------------------------------------------------ */

describe("B9 触发判定：9/14/19 检查点 + 合法 pair", () => {
  it("未到检查点不弹；到 9 且存在合法 pair 才弹", () => {
    expect(
      mutualCheckTrigger({
        relationship: rel({ relationshipEffectiveCardCount: 8 }),
        participants: QUAD,
        sessionStatus: "active",
      }),
    ).toMatchObject({ due: false, checkpoint: null, reason: "not-at-checkpoint" });

    expect(
      mutualCheckTrigger({
        relationship: rel({ relationshipEffectiveCardCount: 9 }),
        participants: QUAD,
        sessionStatus: "active",
      }),
    ).toMatchObject({ due: true, checkpoint: 9, pairMode: "ACTIVE", reason: "ok" });
  });

  it("14/19 两个检查点同样命中（按 v2-state 的 MUTUAL_CHECK_COUNTS）", () => {
    for (const count of [14, 19]) {
      const relationship = rel({
        relationshipEffectiveCardCount: count,
        sessionCompletedRounds: 0,
        lastMutualCheckAtEffectiveCount: count - 5,
      });
      expect(
        mutualCheckTrigger({ relationship, participants: QUAD, sessionStatus: "active" }),
      ).toMatchObject({ due: true, checkpoint: count });
    }
  });

  it("D4=A：无合法 pair（同性/未选）时不弹，也不建 run、不空转", () => {
    const noPair: SessionParticipant[] = [
      participant("a", "male"),
      participant("b", "male"),
      participant("c", null),
    ];
    expect(
      mutualCheckTrigger({
        relationship: rel({ relationshipEffectiveCardCount: 9 }),
        participants: noPair,
        sessionStatus: "active",
      }),
    ).toMatchObject({ due: false, checkpoint: 9, pairMode: "NO_ELIGIBLE_PAIR", reason: "no-eligible-pair" });

    expect(mutualCandidateIds(noPair)).toEqual([]);
    expect(beginMutualCheckRun(noPair).pairRuns).toEqual({});
  });

  it("暂停 / 已有私密流程在跑时不弹（R4 §7.1 mutualRunnable）", () => {
    const input = {
      relationship: rel({ relationshipEffectiveCardCount: 9 }),
      participants: QUAD,
    };
    expect(mutualCheckTrigger({ ...input, sessionStatus: "paused" })).toMatchObject({
      due: false,
      reason: "session-not-running",
    });
    expect(
      mutualCheckTrigger({ ...input, sessionStatus: "active", privateFlowRunning: true }),
    ).toMatchObject({ due: false, reason: "session-not-running" });
  });

  it("四道门与 reducer 单一口径一致（剩余轮次 / 整局次数 / 最小间隔）", () => {
    const late = rel({ relationshipEffectiveCardCount: 9, sessionCompletedRounds: 19 });
    const capped = rel({ relationshipEffectiveCardCount: 9, regularMutualCheckRuns: 3 });
    const tooClose = rel({ relationshipEffectiveCardCount: 9, lastMutualCheckAtEffectiveCount: 7 });
    for (const relationship of [late, capped, tooClose]) {
      expect(
        mutualCheckTrigger({ relationship, participants: QUAD, sessionStatus: "active" }).reason,
      ).toBe("gates-not-passed");
      const reduced = reduceRelationshipEvent(relationship, {
        eventId: "probe",
        type: "SYSTEM_MUTUAL_CHECK_DUE",
        dueCount: relationship.relationshipEffectiveCardCount,
      });
      expect(reduced.delta.reasons).not.toContain("mutual_due");
    }
    // 四道门全过时 reducer 也标记 due（同口径正向核对）
    const ok = rel({ relationshipEffectiveCardCount: 9 });
    expect(
      reduceRelationshipEvent(ok, { eventId: "probe", type: "SYSTEM_MUTUAL_CHECK_DUE", dueCount: 9 })
        .delta.reasons,
    ).toContain("mutual_due");
  });
});

/* ------------------------------------------------------------------ */
/* 2. 候选人 / 单向 secret（纯内存）                                       */
/* ------------------------------------------------------------------ */

describe("B9 单向秘密：只选一人或跳过、非法目标按跳过", () => {
  it("候选人只含至少属于一条合法边的 active 参与者", () => {
    const withOutsider: SessionParticipant[] = [...QUAD, participant("e", "male", false)];
    expect(mutualCandidateIds(withOutsider)).toEqual(["a", "b", "c", "d"]);
  });

  it("非法目标（选自己 / 不在候选人里）一律按跳过处理，不留任何痕迹", () => {
    const run = beginMutualCheckRun(QUAD);
    submitMutualChoice(run, "a", "a");
    submitMutualChoice(run, "b", "outsider");
    for (const pairRun of Object.values(run.pairRuns)) {
      expect(Object.values(pairRun.selections).every((value) => value === null)).toBe(true);
      expect(pairRun.maskRevealed).toBe(false);
    }
    const before = JSON.stringify(run.pairRuns);
    submitMutualChoice(run, "outsider", "a");
    expect(JSON.stringify(run.pairRuns)).toBe(before);
  });

  it("选择只写进命中 pair 的本人一侧，其余 pair 保持 null", () => {
    const run = beginMutualCheckRun(QUAD);
    submitMutualChoice(run, "a", "b");
    expect(run.pairRuns["a::b"]!.selections.a).not.toBeNull();
    expect(run.pairRuns["a::b"]!.selections.b).toBeNull();
    for (const [key, pairRun] of Object.entries(run.pairRuns)) {
      if (key === "a::b") continue;
      expect(Object.values(pairRun.selections).every((value) => value === null)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 3. finalize：互选成 MATCH、单向 no-action、跳过无惩罚                     */
/* ------------------------------------------------------------------ */

describe("B9 finalize：只公布双方互选的结果", () => {
  it("双方互选成 MATCH；单向选择只 no-action、不公开", () => {
    const run = beginMutualCheckRun(QUAD);
    submitMutualChoice(run, "a", "b");
    submitMutualChoice(run, "b", "a");
    submitMutualChoice(run, "c", "b");
    const result = finalizeMutualCheckRun(run, rel());
    expect(result.matches.map((item) => item.pairKey)).toEqual(["a::b"]);
    expect(JSON.stringify(result)).not.toContain('"c"');
  });

  it("无交集只返回空结果，且不含任何单向明细 / 参与者身份", () => {
    const run = beginMutualCheckRun(QUAD);
    submitMutualChoice(run, "a", "b");
    submitMutualChoice(run, "b", "c");
    submitMutualChoice(run, "c", "d");
    submitMutualChoice(run, "d", "a");
    const result = finalizeMutualCheckRun(run, rel());
    expect(result).toEqual({ matches: [] });
    expect(JSON.stringify(result)).toBe('{"matches":[]}');
  });

  it("跳过无惩罚：全员跳过 → 仍可正常收束，空结果且无惩罚字段", () => {
    const run = beginMutualCheckRun(QUAD);
    for (const playerId of run.playerIds) submitMutualChoice(run, playerId, null);
    const result = finalizeMutualCheckRun(run, rel());
    expect(result).toEqual({ matches: [] });
    expect(Object.keys(result)).toEqual(["matches"]);
    expect(JSON.stringify(result)).not.toMatch(/skip|penalt|惩罚|跳过/i);
  });

  it("finalize 后单向数据清零、遮罩关闭（R4 §6.2 先出公开结果再清空原始数据）", () => {
    const run = beginMutualCheckRun(QUAD);
    submitMutualChoice(run, "a", "b");
    submitMutualChoice(run, "b", "a");
    expect(run.pairRuns["a::b"]!.maskRevealed).toBe(true);

    finalizeMutualCheckRun(run, rel());
    for (const pairRun of Object.values(run.pairRuns)) {
      expect(Object.values(pairRun.selections).every((value) => value === null)).toBe(true);
      expect(pairRun.maskRevealed).toBe(false);
      expect(mutualResult(pairRun)).toEqual({ match: false });
    }
  });

  it("clearMutualCheckRun 就地清零（取消路径不留痕）", () => {
    const run = beginMutualCheckRun(QUAD);
    submitMutualChoice(run, "a", "b");
    submitMutualChoice(run, "b", "a");
    clearMutualCheckRun(run);
    for (const pairRun of Object.values(run.pairRuns)) {
      expect(Object.values(pairRun.selections).every((value) => value === null)).toBe(true);
      expect(pairRun.maskRevealed).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 4. D5 上限 2                                                          */
/* ------------------------------------------------------------------ */

describe("B9 D5 上限 2：拦截且不泄露超限的一方", () => {
  it("一方已有 2 个 active MATCH → 互选也不新建，结果里没有任何线索", () => {
    const full = rel({ matches: { "a::b": matchOf("a", "b"), "a::c": matchOf("a", "c") } });
    const run = beginMutualCheckRun(QUAD);
    submitMutualChoice(run, "a", "d");
    submitMutualChoice(run, "d", "a");
    const result = finalizeMutualCheckRun(run, full);
    expect(result.matches).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('"a"');
    expect(JSON.stringify(result)).not.toContain('"d"');
    expect(JSON.stringify(result)).not.toMatch(/cap|under-limit|上限|已满/i);
  });

  it("只拦超限的那一方：同一次 run 里其他互选 pair 照常成 MATCH", () => {
    const full = rel({ matches: { "a::b": matchOf("a", "b"), "a::c": matchOf("a", "c") } });
    const run = beginMutualCheckRun(QUAD);
    submitMutualChoice(run, "a", "d");
    submitMutualChoice(run, "d", "a");
    submitMutualChoice(run, "b", "c");
    submitMutualChoice(run, "c", "b");
    const result = finalizeMutualCheckRun(run, full);
    expect(result.matches.map((item) => item.pairKey)).toEqual(["b::c"]);
  });

  it("退出释放名额：废掉一个人身上的 MATCH 后，同一 pair 可以新建", () => {
    const full = rel({ matches: { "a::b": matchOf("a", "b"), "a::c": matchOf("a", "c") } });
    const run1 = beginMutualCheckRun(QUAD);
    submitMutualChoice(run1, "a", "d");
    submitMutualChoice(run1, "d", "a");
    expect(finalizeMutualCheckRun(run1, full).matches).toEqual([]);

    const released = withoutMatch(full, "a::c");
    const run2 = beginMutualCheckRun(QUAD);
    submitMutualChoice(run2, "a", "d");
    submitMutualChoice(run2, "d", "a");
    expect(finalizeMutualCheckRun(run2, released).matches.map((item) => item.pairKey)).toEqual(["a::d"]);
  });
});

/* ------------------------------------------------------------------ */
/* 4b. 已 MATCH 的 pair 不重复公开（只公布本次新成立的 pair）                  */
/* ------------------------------------------------------------------ */

describe("B9 已 MATCH pair：不再当新互选公布、不建新 COMPLETE 事件", () => {
  const TS = "2026-01-01T00:00:00.000Z";

  it("旧 MATCH 再次互选：不公开、不建新 event、原 MATCH 原样保留", () => {
    const existing = rel({
      relationshipEffectiveCardCount: 9,
      matches: { "a::b": matchOf("a", "b") },
    });
    const run = beginMutualCheckRun(QUAD);
    submitMutualChoice(run, "a", "b");
    submitMutualChoice(run, "b", "a");

    const result = finalizeMutualCheckRun(run, existing);
    expect(result.matches).toEqual([]);

    const events = mutualCheckFinalEvents(run.runId, 9, result, TS);
    expect(events.map((event) => event.type)).toEqual(["SYSTEM_MUTUAL_CHECK_DUE"]);

    const state = {
      ...createV2SessionState({ sessionId: "s-old", participants: QUAD }),
      relationship: existing,
    };
    const after = reduceV2SessionEvents(state, events);
    expect(Object.keys(after.state.relationship.matches)).toEqual(["a::b"]);
    expect(after.state.relationship.matches["a::b"]).toEqual(existing.matches["a::b"]);
    expect(after.deltas.some((delta) => delta.reasons.includes("match_created"))).toBe(false);
    // cooldown / 5 档保障一律不重建：无 COMPLETE 事件 → 无 cooldown_set、无新 guarantee
    expect(after.state.relationship.cooldowns["a::b"]).toBeUndefined();
    expect(after.deltas.some((delta) => delta.reasons.includes("cooldown_set"))).toBe(false);
    expect(after.state.relationship.fiveGuarantees["a::b"]).toBeUndefined();
  });

  it("同一次 run 一旧一新：只公开新成立的 pair，旧 MATCH 不被重新公布", () => {
    const existing = rel({
      relationshipEffectiveCardCount: 9,
      matches: { "a::b": matchOf("a", "b") },
    });
    const run = beginMutualCheckRun(QUAD);
    submitMutualChoice(run, "a", "b");
    submitMutualChoice(run, "b", "a");
    submitMutualChoice(run, "c", "d");
    submitMutualChoice(run, "d", "c");

    const result = finalizeMutualCheckRun(run, existing);
    expect(result.matches.map((item) => item.pairKey)).toEqual(["c::d"]);

    const events = mutualCheckFinalEvents(run.runId, 9, result, TS);
    expect(events.map((event) => event.type)).toEqual([
      "SYSTEM_MUTUAL_CHECK_DUE",
      "SYSTEM_MUTUAL_CHECK_COMPLETE",
    ]);
    expect(events[1]).toMatchObject({ pairKey: "c::d" });

    const state = {
      ...createV2SessionState({ sessionId: "s-mix", participants: QUAD }),
      relationship: existing,
    };
    const after = reduceV2SessionEvents(state, events);
    expect(Object.keys(after.state.relationship.matches).sort()).toEqual(["a::b", "c::d"]);
    expect(after.state.relationship.matches["a::b"]).toEqual(existing.matches["a::b"]);
  });

  it("旧 MATCH 重选与 D5 超限同 run：只公开真正新成立且未超限的 pair", () => {
    // a 身上 2 个 active MATCH（a::b / a::c）；b::c 双方各 1 个 → 只有 b::c 可达
    const existing = rel({
      relationshipEffectiveCardCount: 9,
      matches: { "a::b": matchOf("a", "b"), "a::c": matchOf("a", "c") },
    });
    const run = beginMutualCheckRun(QUAD);
    submitMutualChoice(run, "a", "b");
    submitMutualChoice(run, "b", "a");
    submitMutualChoice(run, "a", "d");
    submitMutualChoice(run, "d", "a");
    submitMutualChoice(run, "b", "c");
    submitMutualChoice(run, "c", "b");

    const result = finalizeMutualCheckRun(run, existing);
    expect(result.matches.map((item) => item.pairKey)).toEqual(["b::c"]);
    expect(JSON.stringify(result)).not.toMatch(/cap|上限|已满|已存在/i);
  });

  it("reducer 侧幂等语义不变：直接归约「已 MATCH pair 的 COMPLETE」仍不重复建 MATCH、不动 matchedAt", () => {
    const existing = rel({ matches: { "a::b": matchOf("a", "b") } });
    const reduced = reduceRelationshipEvent(existing, {
      eventId: "probe-complete",
      type: "SYSTEM_MUTUAL_CHECK_COMPLETE",
      pairKey: "a::b",
      playerIds: ["a", "b"],
      consented: true,
      timestamp: "2027-01-01T00:00:00.000Z",
    });
    expect(Object.keys(reduced.state.matches)).toEqual(["a::b"]);
    expect(reduced.state.matches["a::b"]?.matchedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(reduced.delta.reasons).not.toContain("match_created");
  });
});

/* ------------------------------------------------------------------ */
/* 5. final 事件计划 + 幂等                                              */
/* ------------------------------------------------------------------ */

describe("B9 final 事件计划：DUE 记一次 + 每对新 MATCH 一条 COMPLETE", () => {
  it("事件只含公开信息；重复归约不重复建 MATCH、不重复计一次常规互选", () => {
    const run = beginMutualCheckRun(QUAD);
    submitMutualChoice(run, "a", "b");
    submitMutualChoice(run, "b", "a");
    const result = finalizeMutualCheckRun(run, rel());
    const events = mutualCheckFinalEvents(run.runId, 9, result, "2026-01-01T00:00:00.000Z");
    expect(events.map((event) => event.type)).toEqual([
      "SYSTEM_MUTUAL_CHECK_DUE",
      "SYSTEM_MUTUAL_CHECK_COMPLETE",
    ]);
    expect(JSON.stringify(events)).not.toMatch(/selection|choice|skip|跳过/i);

    const base = rel({ relationshipEffectiveCardCount: 9 });
    const state = { ...createV2SessionState({ sessionId: "s1", participants: QUAD }), relationship: base };
    const once = reduceV2SessionEvents(state, events);
    expect(Object.keys(once.state.relationship.matches)).toEqual(["a::b"]);
    expect(once.state.relationship.regularMutualCheckRuns).toBe(1);
    expect(once.state.relationship.fiveGuarantees["a::b"]).toBeDefined();

    const twice = reduceV2SessionEvents(once.state, events);
    expect(Object.keys(twice.state.relationship.matches)).toEqual(["a::b"]);
    expect(twice.state.relationship.regularMutualCheckRuns).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* 6. 无持久化                                                            */
/* ------------------------------------------------------------------ */

describe("B9 隐私边界：单向秘密没有落盘入口", () => {
  it("控制器与面板源码零 storage / URL / 历史写入", () => {
    const files = [
      "lib/v2-relationship/v2-mutual-check.ts",
      "lib/v2-relationship/v2-private.ts",
      "components/game/MutualCheckSheet.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|IDBKeyRange|openDB/);
      expect(source).not.toMatch(/@\/lib\/storage/);
      expect(source).not.toMatch(/history\.(pushState|replaceState)/);
    }
  });

  it("跑完一整次 run 后 localStorage 未被写入、IndexedDB 未被打开", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const openSpy = vi.spyOn(IDBFactory.prototype, "open");
    const run = beginMutualCheckRun(QUAD);
    submitMutualChoice(run, "a", "b");
    submitMutualChoice(run, "b", "a");
    submitMutualChoice(run, "c", null);
    submitMutualChoice(run, "d", "a");
    finalizeMutualCheckRun(run, rel());
    expect(setItem).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    setItem.mockRestore();
    openSpy.mockRestore();
  });
});
