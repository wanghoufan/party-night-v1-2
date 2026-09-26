import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  applyV2HostDecision,
  createV2SessionState,
  drawV2SessionCard,
  hostDecisionRequest,
  reduceV2SessionEvents,
  type V2AwaitingHostOutcome,
  type V2CardOutcome,
  type V2DrawOutcome,
  type V2RouterCard,
  type V2RouterInput,
  type V2RouterPort,
  type V2SessionState,
} from '../../lib/v2-relationship/v2-session';
import { SOFT_DEDUP_WINDOW } from '../../lib/v2-relationship/v2-state';

const SOURCE_REL = 'lib/v2-relationship/v2-session.ts';

const loadSource = (): string => readFileSync(join(process.cwd(), SOURCE_REL), 'utf8');

/* ------------------------------------------------------------------ */
/* 测试装置                                                              */
/* ------------------------------------------------------------------ */

const male = (playerId: string) => ({ playerId, active: true, pairGender: 'male' as const });
const female = (playerId: string) => ({ playerId, active: true, pairGender: 'female' as const });

const card = (cardId: string, fiveTier = false): V2RouterCard => ({ cardId, fiveTier });

function stubRouter(
  handlers: {
    bucket?: (input: V2RouterInput) => readonly V2RouterCard[];
    pack?: (input: V2RouterInput) => readonly V2RouterCard[];
    global?: (input: V2RouterInput) => readonly V2RouterCard[];
  } = {},
): V2RouterPort {
  return {
    bucket: handlers.bucket ?? (() => []),
    pack: handlers.pack ?? (() => []),
    global: handlers.global ?? (() => []),
  };
}

function asCard(out: V2DrawOutcome): V2CardOutcome {
  if (out.kind !== 'CARD') throw new Error(`expected CARD, got ${out.kind}`);
  return out;
}

function asAwaiting(out: V2DrawOutcome): V2AwaitingHostOutcome {
  if (out.kind !== 'AWAITING_HOST_EXHAUSTION_DECISION') {
    throw new Error(`expected AWAITING_HOST_EXHAUSTION_DECISION, got ${out.kind}`);
  }
  return out;
}

const sessionWithUsed = (
  sessionId: string,
  usedCardIds: readonly string[],
  recentCardIds: readonly string[] = [],
): V2SessionState => {
  const base = createV2SessionState({
    sessionId,
    participants: [male('m1'), female('f1')],
  });
  return {
    ...base,
    relationship: { ...base.relationship, usedCardIds: [...usedCardIds], recentCardIds: [...recentCardIds] },
  };
};

/* ------------------------------------------------------------------ */
/* 1. 正常出卡（BUCKET_OK）                                              */
/* ------------------------------------------------------------------ */

describe('v2-session（B6 Session 级编排器，D8=A+ / D2 单 Router）', () => {
  it('正常出卡：Pair 路由选中目标 pair，BUCKET_OK 出卡并记入 recentCardIds', () => {
    const state = createV2SessionState({
      sessionId: 's1',
      participants: [male('m1'), female('f1')],
    });
    const router = stubRouter({
      bucket: () => [card('PN-TRUTH-001')],
      pack: () => [card('PN-TRUTH-001')],
      global: () => [card('PN-TRUTH-001')],
    });

    const out = asCard(drawV2SessionCard(state, router, { intensityLimit: 3 }));

    expect(out.cardId).toBe('PN-TRUTH-001');
    expect(out.exhaustionLevel).toBe('BUCKET_OK');
    expect(out.targetPairKey).toBe('f1::m1');
    expect(out.dedupWindowApplied).toBe(SOFT_DEDUP_WINDOW);
    expect(out.state.relationship.recentCardIds).toEqual(['PN-TRUTH-001']);
    expect(out.state.orchestration.softDedupWindow).toBe(SOFT_DEDUP_WINDOW);
    expect(out.state.orchestration.awaitingHostDecision).toBe(false);
    // 纯状态编排：入参不被就地修改
    expect(state.relationship.recentCardIds).toEqual([]);
  });

  /* ------------------------------------------------------------------ */
  /* 2. widen 救回（BUCKET_EMPTY）                                        */
  /* ------------------------------------------------------------------ */

  it('widen 救回：桶空时按 5→4→3 逐步放宽，首个非空窗口出卡（BUCKET_EMPTY）', () => {
    const state = createV2SessionState({
      sessionId: 's2',
      participants: [male('m1'), female('f1')],
    });
    const windows: number[] = [];
    const router = stubRouter({
      bucket: (input) => {
        windows.push(input.softDedupWindow);
        return input.softDedupWindow <= 3 ? [card('PN-RESCUE')] : [];
      },
      pack: () => [card('PN-RESCUE')],
      global: () => [card('PN-RESCUE')],
    });

    const out = asCard(drawV2SessionCard(state, router, { intensityLimit: 3 }));

    expect(windows).toEqual([5, 4, 3]);
    expect(out.exhaustionLevel).toBe('BUCKET_EMPTY');
    expect(out.dedupWindowApplied).toBe(3);
    expect(out.cardId).toBe('PN-RESCUE');
    // 救回后新一轮从初始窗口重新评估
    expect(out.state.orchestration.softDedupWindow).toBe(SOFT_DEDUP_WINDOW);
  });

  /* ------------------------------------------------------------------ */
  /* 3/4. PACK_EXHAUSTED / RELATIONSHIP_GLOBAL_EXHAUSTED                  */
  /* ------------------------------------------------------------------ */

  it('PACK_EXHAUSTED：桶放宽到 0 仍空但包内仍有卡，提示本玩法已玩完', () => {
    const state = sessionWithUsed('s3', ['c1', 'c2'], ['r1']);
    const router = stubRouter({
      bucket: () => [],
      pack: () => [card('PN-OTHER')],
      global: () => [card('PN-OTHER')],
    });

    const out = drawV2SessionCard(state, router, { intensityLimit: 3 });

    expect(out.kind).toBe('PACK_EXHAUSTED');
    if (out.kind !== 'PACK_EXHAUSTED') throw new Error('unreachable');
    expect(out.guidance).toContain('本玩法本局已玩完');
    expect(out.state.orchestration.awaitingHostDecision).toBe(false);
    expect(out.state.orchestration.softDedupWindow).toBe(0);
    // 不误清 used、不误记 recent
    expect(out.state.relationship.usedCardIds).toEqual(['c1', 'c2']);
    expect(out.state.relationship.recentCardIds).toEqual(['r1']);
  });

  it('RELATIONSHIP_GLOBAL_EXHAUSTED：包与桶皆空、全局仍有卡，提示继续收敛', () => {
    const state = createV2SessionState({
      sessionId: 's4',
      participants: [male('m1'), female('f1')],
    });
    const router = stubRouter({
      bucket: () => [],
      pack: () => [],
      global: () => [card('PN-GLOBAL')],
    });

    const out = drawV2SessionCard(state, router, { intensityLimit: 3 });

    expect(out.kind).toBe('RELATIONSHIP_GLOBAL_EXHAUSTED');
    if (out.kind !== 'RELATIONSHIP_GLOBAL_EXHAUSTED') throw new Error('unreachable');
    expect(out.guidance).toContain('继续收敛');
    expect(out.state.orchestration.awaitingHostDecision).toBe(false);
  });

  /* ------------------------------------------------------------------ */
  /* 5. AWAITING + Host finish                                            */
  /* ------------------------------------------------------------------ */

  it('三层皆空 → AWAITING_HOST_EXHAUSTION_DECISION（暂停抽卡，不自动洗牌/结束）', () => {
    const state = sessionWithUsed('s5', ['c1', 'c2'], ['r1', 'r2']);
    let bucketCalls = 0;
    const router = stubRouter({
      bucket: () => {
        bucketCalls += 1;
        return [];
      },
    });

    const awaiting = asAwaiting(drawV2SessionCard(state, router, { intensityLimit: 3 }));

    expect(awaiting.exhaustionCycle).toBe(0);
    expect(awaiting.idempotencyKey).toBe('s5::1');
    expect(awaiting.state.orchestration.awaitingHostDecision).toBe(true);
    expect(awaiting.state.orchestration.lastExhaustionLevel).toBe(
      'AWAITING_HOST_EXHAUSTION_DECISION',
    );

    // AWAITING 期间重入直接返回同一等待态，不触发 Router（不自动洗牌/结束）
    const callsWhileAwaiting = bucketCalls;
    const again = asAwaiting(drawV2SessionCard(awaiting.state, router, { intensityLimit: 3 }));
    expect(again.kind).toBe('AWAITING_HOST_EXHAUSTION_DECISION');
    expect(bucketCalls).toBe(callsWhileAwaiting);
  });

  it('Host finish：used 与 cycle 均不变，标记本局结束并解除等待态', () => {
    const awaiting = asAwaiting(
      drawV2SessionCard(
        sessionWithUsed('s6', ['c1', 'c2'], ['r1', 'r2']),
        stubRouter(),
        { intensityLimit: 3 },
      ),
    );

    const result = applyV2HostDecision(awaiting.state, hostDecisionRequest(awaiting, 'finish'));

    expect(result.replayed).toBe(false);
    expect(result.outcome.finished).toBe(true);
    expect(result.state.orchestration.finished).toBe(true);
    expect(result.state.orchestration.awaitingHostDecision).toBe(false);
    expect(result.state.relationship.usedCardIds).toEqual(['c1', 'c2']);
    expect(result.state.relationship.exhaustionCycle).toBe(0);
  });

  /* ------------------------------------------------------------------ */
  /* 6. Host reshuffle：只清 used + cycle+1，关系态原封保留                */
  /* ------------------------------------------------------------------ */

  it('Host reshuffle：只清 usedCardIds、exhaustionCycle+1，recent/Heat/MATCH 全保留', () => {
    const base = sessionWithUsed('s7', ['c1', 'c2'], ['r1', 'r2', 'r3', 'r4', 'r5']);
    const state: V2SessionState = {
      ...base,
      relationship: {
        ...base.relationship,
        heat: 'H3',
        matches: {
          'f1::m1': {
            pairKey: 'f1::m1',
            matchedAt: '2026-01-01T00:00:00.000Z',
            playerIds: ['m1', 'f1'],
          },
        },
        fiveGuarantees: {
          'f1::m1': {
            pairKey: 'f1::m1',
            tracker: {
              // offered 终态：洗牌不得改写任何 5 档保障状态
              status: 'offered',
              qualifyingOpportunitiesSeen: 1,
              qualifyingOpportunitiesLimit: 2,
              createdAtEffectiveCount: 3,
            },
          },
        },
      },
    };

    const out = asAwaiting(drawV2SessionCard(state, stubRouter(), { intensityLimit: 3 }));
    const result = applyV2HostDecision(out.state, hostDecisionRequest(out, 'reshuffle'));

    expect(result.replayed).toBe(false);
    expect(result.state.relationship.exhaustionCycle).toBe(1);
    expect(result.state.relationship.usedCardIds).toEqual([]);
    const rel = result.state.relationship;
    expect(rel.recentCardIds).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(rel.heat).toBe('H3');
    expect(rel.matches['f1::m1']).toBeDefined();
    expect(rel.fiveGuarantees['f1::m1']?.tracker?.status).toBe('offered');
    expect(result.state.orchestration.awaitingHostDecision).toBe(false);
    expect(result.state.orchestration.softDedupWindow).toBe(SOFT_DEDUP_WINDOW);
  });

  /* ------------------------------------------------------------------ */
  /* 7. 幂等重放（P2 门禁）                                               */
  /* ------------------------------------------------------------------ */

  it('幂等重放：同幂等键重复调用直接返回上次结果，不重复清零、不多加 cycle', () => {
    const state = sessionWithUsed('s8', ['c1', 'c2'], ['r1']);
    const awaiting = asAwaiting(drawV2SessionCard(state, stubRouter(), { intensityLimit: 3 }));
    const request = hostDecisionRequest(awaiting, 'reshuffle');

    const first = applyV2HostDecision(awaiting.state, request);
    expect(first.replayed).toBe(false);
    expect(first.state.relationship.exhaustionCycle).toBe(1);
    expect(first.state.relationship.usedCardIds).toEqual([]);
    expect(first.state.orchestration.hostDecisions['s8::1']).toBeDefined();

    // 重放（双重派发 / 保存恢复后重入）：同一请求基线 → 同一幂等键 ::1
    const second = applyV2HostDecision(first.state, request);
    expect(second.replayed).toBe(true);
    expect(second.state.relationship.exhaustionCycle).toBe(1);
    expect(second.state.relationship.usedCardIds).toEqual([]);
    expect(second.state.relationship.recentCardIds).toEqual(['r1']);

    // 再重放一次仍稳定在同一 cycle（不加到 2）
    const third = applyV2HostDecision(second.state, request);
    expect(third.replayed).toBe(true);
    expect(third.state.relationship.exhaustionCycle).toBe(1);
    expect(third.state.relationship.usedCardIds).toEqual([]);

    // finish 同样幂等
    const finishAwaiting = asAwaiting(drawV2SessionCard(state, stubRouter(), { intensityLimit: 3 }));
    const finishRequest = hostDecisionRequest(finishAwaiting, 'finish');
    const finishFirst = applyV2HostDecision(finishAwaiting.state, finishRequest);
    const finishSecond = applyV2HostDecision(finishFirst.state, finishRequest);
    expect(finishSecond.replayed).toBe(true);
    expect(finishSecond.outcome.finished).toBe(true);
    expect(finishSecond.state.relationship.exhaustionCycle).toBe(0);
  });

  /* ------------------------------------------------------------------ */
  /* 8. reducer 步集成 + 保障种子                                          */
  /* ------------------------------------------------------------------ */

  it('reducer 步：R3 事件推进计数/used/Heat；match_created 建立 D7 pending 保障(seen=0)', () => {
    const state = createV2SessionState({
      sessionId: 's9',
      participants: [male('m1'), female('f1')],
    });

    const reduced = reduceV2SessionEvents(state, [
      { eventId: 'e1', type: 'REL_CARD_COMPLETED', ref: 'i1', cardId: 'PN-TRUTH-001', playerId: 'm1' },
    ]);
    expect(reduced.state.relationship.relationshipEffectiveCardCount).toBe(1);
    expect(reduced.state.relationship.sessionCompletedRounds).toBe(1);
    expect(reduced.state.relationship.usedCardIds).toEqual(['PN-TRUTH-001']);
    expect(reduced.deltas[0]?.applied).toBe(true);

    const matched = reduceV2SessionEvents(state, [
      {
        eventId: 'm1',
        type: 'SYSTEM_MUTUAL_CHECK_COMPLETE',
        ref: 'mc1',
        pairKey: 'f1::m1',
        playerIds: ['m1', 'f1'],
        consented: true,
      },
    ]);
    expect(matched.state.relationship.matches['f1::m1']).toBeDefined();
    const tracker = matched.state.relationship.fiveGuarantees['f1::m1']?.tracker;
    expect(tracker?.status).toBe('pending');
    expect(tracker?.qualifyingOpportunitiesSeen).toBe(0);
  });

  /* ------------------------------------------------------------------ */
  /* 9. guarantee 步：第 2 次合格机会强制 5 档                             */
  /* ------------------------------------------------------------------ */

  it('guarantee 步：seen=1 时强制合法 5 档，展示即 offered 终态（D7 present）', () => {
    const base = createV2SessionState({
      sessionId: 's10',
      participants: [male('m1'), female('f1')],
    });
    const state: V2SessionState = {
      ...base,
      relationship: {
        ...base.relationship,
        matches: {
          'f1::m1': {
            pairKey: 'f1::m1',
            matchedAt: '2026-01-01T00:00:00.000Z',
            playerIds: ['m1', 'f1'],
          },
        },
        fiveGuarantees: {
          'f1::m1': {
            pairKey: 'f1::m1',
            tracker: {
              status: 'pending',
              qualifyingOpportunitiesSeen: 1,
              qualifyingOpportunitiesLimit: 2,
              createdAtEffectiveCount: 0,
            },
          },
        },
      },
    };

    const inputs: V2RouterInput[] = [];
    const router = stubRouter({
      bucket: (input) => {
        inputs.push(input);
        const all = [card('PN-FIVE', true), card('PN-LOW')];
        return input.requireFiveTierForPair !== null
          ? all.filter((c) => c.fiveTier)
          : all;
      },
      pack: () => [card('PN-FIVE', true)],
      global: () => [card('PN-FIVE', true)],
    });

    const out = asCard(drawV2SessionCard(state, router, { intensityLimit: 5 }));

    expect(inputs.some((i) => i.requireFiveTierForPair === 'f1::m1')).toBe(true);
    expect(out.cardId).toBe('PN-FIVE');
    expect(out.guaranteeAdvance).toBe('present');
    expect(out.state.relationship.fiveGuarantees['f1::m1']?.tracker?.status).toBe('offered');
  });

  it('guarantee 步：Intensity<5 时暂停保障且不消耗合格机会（intensity-below-five）', () => {
    const base = createV2SessionState({
      sessionId: 's11',
      participants: [male('m1'), female('f1')],
    });
    const state: V2SessionState = {
      ...base,
      relationship: {
        ...base.relationship,
        matches: {
          'f1::m1': {
            pairKey: 'f1::m1',
            matchedAt: '2026-01-01T00:00:00.000Z',
            playerIds: ['m1', 'f1'],
          },
        },
        fiveGuarantees: {
          'f1::m1': {
            pairKey: 'f1::m1',
            tracker: {
              status: 'pending',
              qualifyingOpportunitiesSeen: 0,
              qualifyingOpportunitiesLimit: 2,
              createdAtEffectiveCount: 0,
            },
          },
        },
      },
    };
    const router = stubRouter({
      bucket: () => [card('PN-LOW')],
      pack: () => [card('PN-LOW')],
      global: () => [card('PN-LOW')],
    });

    const out = asCard(drawV2SessionCard(state, router, { intensityLimit: 3 }));

    expect(out.guaranteeAdvance).toBe('pause');
    const tracker = out.state.relationship.fiveGuarantees['f1::m1']?.tracker;
    expect(tracker?.status).toBe('paused');
    expect(tracker?.pauseReason).toBe('intensity-below-five');
    expect(tracker?.qualifyingOpportunitiesSeen).toBe(0);
  });

  /* ------------------------------------------------------------------ */
  /* 10. routing 步：按信号选目标 pair                                     */
  /* ------------------------------------------------------------------ */

  it('routing 步：按 pair 信号排序选中目标 pair（首位），并传给 Router', () => {
    const state = createV2SessionState({
      sessionId: 's12',
      participants: [male('m1'), male('m2'), female('f1'), female('f2')],
    });
    const inputs: V2RouterInput[] = [];
    const router = stubRouter({
      bucket: (input) => {
        inputs.push(input);
        return [card('PN-X')];
      },
    });

    const out = asCard(
      drawV2SessionCard(state, router, {
        intensityLimit: 3,
        signals: {
          'f1::m1': { shared: 0, compat: 0, crowd: 0, personal: 0 },
          'f2::m2': { shared: 0, compat: 0, crowd: 0, personal: 2 },
        },
      }),
    );

    expect(out.targetPairKey).toBe('f2::m2');
    expect(inputs.every((i) => i.targetPairKey === 'f2::m2')).toBe(true);
  });

  /* ------------------------------------------------------------------ */
  /* 11. 禁回退 V1.6（grep 式断言）                                        */
  /* ------------------------------------------------------------------ */

  it('禁回退 V1.6：源码不 import 旧 selector / 旧权重路由（grep 式断言）', () => {
    // 先剥注释，只扫可执行代码，避免注释里的禁令说明被误判。
    const code = loadSource()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const FORBIDDEN_IMPORT =
      /from\s+['"][^'"]*(card-selector|intensity-weight|engine\/|v1[.-]?6)[^'"]*['"]/i;

    expect(code).not.toMatch(FORBIDDEN_IMPORT);

    // 唯一允许的同族依赖：state / reducer / routing / guarantee / exhaustion
    const imports = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(new Set(imports)).toEqual(
      new Set([
        './v2-state',
        './v2-reducer',
        './v2-routing',
        './v2-guarantee',
        './v2-exhaustion',
      ]),
    );

    // 可执行代码里不得出现旧权重路由常量 / 固定陡坡 / future deck 入口 / 动态 require
    expect(code).not.toMatch(/16:8:4:2:1/);
    expect(code).not.toMatch(/INTENSITY_WEIGHT/);
    expect(code).not.toMatch(/future[-_]?deck/i);
    expect(code).not.toMatch(/require\s*\(/);
  });

  it('初始编排态：软去重窗口取自 v2-state 真源 SOFT_DEDUP_WINDOW（不另写 5）', () => {
    const state = createV2SessionState({ sessionId: 's13' });
    expect(state.orchestration.softDedupWindow).toBe(SOFT_DEDUP_WINDOW);
    expect(state.orchestration.awaitingHostDecision).toBe(false);
    expect(state.orchestration.finished).toBe(false);
    expect(state.orchestration.hostDecisions).toEqual({});
    expect(state.orchestration.lastExhaustionLevel).toBe('BUCKET_OK');
  });
});
