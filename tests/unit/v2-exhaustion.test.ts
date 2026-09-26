import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  applyHostDecision,
  assessExhaustion,
  widenDedupWindow,
  type ExhaustionLevel,
  type HostDecisionState,
} from '../../lib/v2-relationship/v2-exhaustion';

const SOURCE_REL = 'lib/v2-relationship/v2-exhaustion.ts';

const loadSource = (): string => readFileSync(join(process.cwd(), SOURCE_REL), 'utf8');

describe('v2-exhaustion（B5 耗尽控制器，D8=A+）', () => {
  it('五层级判定①：bucket > 0 → BUCKET_OK（先判桶，桶内有硬合法卡即正常出卡）', () => {
    const level: ExhaustionLevel = assessExhaustion({ bucket: 3, pack: 4, global: 2 }, 0);
    expect(level).toBe('BUCKET_OK');
  });

  it('五层级判定②：bucket === 0 但放宽后有卡 → BUCKET_EMPTY（可放宽软去重窗口救回）', () => {
    expect(assessExhaustion({ bucket: 0, pack: 3, global: 2 }, 2)).toBe('BUCKET_EMPTY');
  });

  it('五层级判定③：放宽到 0 仍空但 pack > 0 → PACK_EXHAUSTED（桶无可救，包内仍有兜底）', () => {
    expect(assessExhaustion({ bucket: 0, pack: 3, global: 0 }, 0)).toBe('PACK_EXHAUSTED');
  });

  it('五层级判定④：pack === 0 但 global > 0 → RELATIONSHIP_GLOBAL_EXHAUSTED（包已空，全局仍有卡）', () => {
    expect(assessExhaustion({ bucket: 0, pack: 0, global: 2 }, 0)).toBe(
      'RELATIONSHIP_GLOBAL_EXHAUSTED',
    );
  });

  it('五层级判定⑤：三层皆 0 → AWAITING_HOST_EXHAUSTION_DECISION（交 Host）', () => {
    expect(assessExhaustion({ bucket: 0, pack: 0, global: 0 }, 0)).toBe(
      'AWAITING_HOST_EXHAUSTION_DECISION',
    );
  });

  it('widenDedupWindow 逐级放宽 5→4→3→2→1→0，且 0 保持 0', () => {
    const ladder: number[] = [5];
    for (let i = 0; i < 6; i += 1) {
      ladder.push(widenDedupWindow(ladder[ladder.length - 1]));
    }
    expect(ladder).toEqual([5, 4, 3, 2, 1, 0, 0]);

    // 0 保持 0：不回弹、不出现负数
    expect(widenDedupWindow(0)).toBe(0);
    expect(widenDedupWindow(-1)).toBe(0);
    // 不越过上限 5（异常大值按上限处理）
    expect(widenDedupWindow(9)).toBe(4);
  });

  it('applyHostDecision(reshuffle)：清空 usedCardIds、保留 recentCardIds、exhaustionCycle + 1', () => {
    const state: HostDecisionState = {
      usedCardIds: ['c1', 'c2', 'c3'],
      recentCardIds: ['r1', 'r2', 'r3', 'r4', 'r5'],
      exhaustionCycle: 2,
    };
    const recentBefore = [...state.recentCardIds];

    const next = applyHostDecision(state, 'reshuffle');

    expect(next.usedCardIds).toEqual([]);
    expect(next.exhaustionCycle).toBe(3);
    // 原快照不被就地修改，且 recent 最近 5 张在这层完全不动
    expect(state.usedCardIds).toEqual(['c1', 'c2', 'c3']);
    expect(state.exhaustionCycle).toBe(2);
    expect(state.recentCardIds).toEqual(recentBefore);
    // 每次洗牌只 +1（幂等键由调用方按 sessionId+cycle+1 组装）
    expect(applyHostDecision({ ...state, exhaustionCycle: next.exhaustionCycle }, 'reshuffle').exhaustionCycle).toBe(4);
  });

  it('applyHostDecision(finish)：原样返回，usedCardIds 与 exhaustionCycle 均不变', () => {
    const state: HostDecisionState = {
      usedCardIds: ['c1', 'c2'],
      recentCardIds: ['r1'],
      exhaustionCycle: 1,
    };

    const next = applyHostDecision(state, 'finish');

    expect(next.usedCardIds).toEqual(['c1', 'c2']);
    expect(next.exhaustionCycle).toBe(1);
    expect(state.usedCardIds).toEqual(['c1', 'c2']);
    expect(state.exhaustionCycle).toBe(1);
  });

  // 禁回退 V1.6 Router：D8=A+ 明令耗尽/洗牌后仍只能进 V2 统一 Router，
  // 旧 `lib/engine/card-selector.ts`（future deck / 指数权重 / INTENSITY_WEIGHT）在生产永不可达。
  // 这里用 grep 式正则直接扫源码文本（不做模块引用），断言本模块不 import 任何旧 selector / 旧权重路由。
  it('禁回退 V1.6：源码不 import 旧 selector / 旧权重路由（grep 式断言）', () => {
    const source = loadSource();
    const FORBIDDEN_IMPORT =
      /from\s+['"][^'"]*(card-selector|engine\/card-selector|intensity-weight|v1[.-]?6)[^'"]*['"]/i;

    expect(source).not.toMatch(FORBIDDEN_IMPORT);
    // 本模块只允许引用同族 v2-state 常量，任何其他 import 都是越界
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect(new Set(imports)).toEqual(new Set(['./v2-state']));
  });
});
