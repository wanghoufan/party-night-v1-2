import { describe, expect, it } from 'vitest';

import {
  beginPrivateRun,
  clearPrivateRun,
  mutualResult,
  submitPrivateChoice,
} from '../../lib/v2-relationship/v2-private';

const PAIR_KEY = 'p1::p2';
const PLAYERS: [string, string] = ['p1', 'p2'];

describe('v2-private（B4 私密互选，纯内存）', () => {
  it('beginPrivateRun 建立空 run：双方选择为 null、遮罩关闭、runId 非空', () => {
    const run = beginPrivateRun(PAIR_KEY, PLAYERS);
    expect(run.pairKey).toBe(PAIR_KEY);
    expect(run.playerIds).toEqual(['p1', 'p2']);
    expect(run.selections).toEqual({ p1: null, p2: null });
    expect(run.maskRevealed).toBe(false);
    expect(run.runId).toBeTruthy();
  });

  it('submitPrivateChoice 就地写入当次选择并返回同一内存对象', () => {
    const run = beginPrivateRun(PAIR_KEY, PLAYERS);
    const returned = submitPrivateChoice(run, 'p1', 'option-a');
    expect(returned).toBe(run);
    expect(run.selections.p1).toBe('option-a');
    expect(run.selections.p2).toBeNull();
  });

  it('双方选择同一非空值 → match:true', () => {
    const run = beginPrivateRun(PAIR_KEY, PLAYERS);
    submitPrivateChoice(run, 'p1', 'option-b');
    submitPrivateChoice(run, 'p2', 'option-b');
    expect(mutualResult(run)).toEqual({ match: true });
    expect(run.maskRevealed).toBe(true);
  });

  it('仅单方提交 → no-action，不产生匹配', () => {
    const run = beginPrivateRun(PAIR_KEY, PLAYERS);
    submitPrivateChoice(run, 'p1', 'option-c');
    expect(mutualResult(run)).toEqual({ match: false });
    expect(run.maskRevealed).toBe(false);
  });

  it('mutualResult 不含任何单向明细', () => {
    const run = beginPrivateRun(PAIR_KEY, PLAYERS);
    submitPrivateChoice(run, 'p1', 'option-d');
    submitPrivateChoice(run, 'p2', 'option-e');
    const result = mutualResult(run);
    expect(Object.keys(result)).toEqual(['match']);
    expect(JSON.stringify(result)).not.toContain('option-d');
    expect(JSON.stringify(result)).not.toContain('option-e');
    expect(JSON.stringify(result)).not.toContain('p1');
  });

  it('clearPrivateRun 就地清零 selections 并关闭遮罩', () => {
    const run = beginPrivateRun(PAIR_KEY, PLAYERS);
    submitPrivateChoice(run, 'p1', 'option-f');
    submitPrivateChoice(run, 'p2', 'option-f');
    expect(run.maskRevealed).toBe(true);

    clearPrivateRun(run);
    expect(run.selections).toEqual({ p1: null, p2: null });
    expect(run.maskRevealed).toBe(false);
    expect(mutualResult(run)).toEqual({ match: false });
  });

  it('空选（null）→ no-action，单方 null 与双方 null 均不匹配', () => {
    const oneSided = beginPrivateRun(PAIR_KEY, PLAYERS);
    submitPrivateChoice(oneSided, 'p1', 'option-g');
    submitPrivateChoice(oneSided, 'p2', null);
    expect(mutualResult(oneSided)).toEqual({ match: false });

    const bothEmpty = beginPrivateRun(PAIR_KEY, PLAYERS);
    submitPrivateChoice(bothEmpty, 'p1', null);
    submitPrivateChoice(bothEmpty, 'p2', null);
    expect(mutualResult(bothEmpty)).toEqual({ match: false });
  });

  it('刷新即丢：重建得到空 run，runId 不同且不共享旧引用', () => {
    const stale = beginPrivateRun(PAIR_KEY, PLAYERS);
    submitPrivateChoice(stale, 'p1', 'option-h');
    submitPrivateChoice(stale, 'p2', 'option-h');

    const refreshed = beginPrivateRun(PAIR_KEY, PLAYERS);
    expect(refreshed).not.toBe(stale);
    expect(refreshed.runId).not.toBe(stale.runId);
    expect(refreshed.selections).toEqual({ p1: null, p2: null });
    expect(refreshed.maskRevealed).toBe(false);
    expect(mutualResult(refreshed)).toEqual({ match: false });
    // 旧引用里的痕迹不代表新 run 继承
    expect(refreshed.selections.p1).toBeNull();
  });
});
