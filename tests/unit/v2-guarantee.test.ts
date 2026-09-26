import { describe, expect, it } from 'vitest';

import { advanceGuarantee } from '../../lib/v2-relationship/v2-guarantee';

describe('advanceGuarantee（D7 五重保障状态机）', () => {
  it('无保障 + qualify → 新建 pending 保障，已见 1、上限 2', () => {
    const result = advanceGuarantee(null, { kind: 'qualify' });
    expect(result.tracker).not.toBeNull();
    expect(result.tracker?.status).toBe('pending');
    expect(result.tracker?.qualifyingOpportunitiesSeen).toBe(1);
    expect(result.tracker?.qualifyingOpportunitiesLimit).toBe(2);
  });

  it('pending + 第二次 qualify → 达到上限转为 offered', () => {
    const first = advanceGuarantee(null, { kind: 'qualify' });
    const second = advanceGuarantee(first, { kind: 'qualify' });
    expect(second.tracker?.qualifyingOpportunitiesSeen).toBe(2);
    expect(second.tracker?.status).toBe('offered');
  });

  it('pending + pause → paused；paused + resume → pending', () => {
    const fresh = advanceGuarantee(null, { kind: 'qualify' });
    const paused = advanceGuarantee(fresh, { kind: 'pause', reason: '玩家暂停' });
    expect(paused.tracker?.status).toBe('paused');
    expect(paused.tracker?.pauseReason).toBe('玩家暂停');

    const resumed = advanceGuarantee(paused, { kind: 'resume' });
    expect(resumed.tracker?.status).toBe('pending');
    expect(resumed.tracker?.pauseReason).toBeUndefined();
  });

  it('非终态 + expire → expired 终态并记录原因', () => {
    const fresh = advanceGuarantee(null, { kind: 'qualify' });
    const expired = advanceGuarantee(fresh, { kind: 'expire', reason: '窗口关闭' });
    expect(expired.tracker?.status).toBe('expired');
    expect(expired.tracker?.terminalReason).toBe('窗口关闭');
  });

  it('offered 后再收到 qualify → 保持 offered 且计数不变', () => {
    const offered = advanceGuarantee(
      advanceGuarantee(null, { kind: 'qualify' }),
      { kind: 'qualify' },
    );
    expect(offered.tracker?.status).toBe('offered');

    const after = advanceGuarantee(offered, { kind: 'qualify' });
    expect(after.tracker?.status).toBe('offered');
    expect(after.tracker?.qualifyingOpportunitiesSeen).toBe(
      offered.tracker?.qualifyingOpportunitiesSeen,
    );
  });

  it('第 1 次合格机会即展示 → 直接进入 offered 终态（D7 展示即终态）', () => {
    const pending = advanceGuarantee(null, { kind: 'qualify' });
    expect(pending.tracker?.status).toBe('pending');

    const offered = advanceGuarantee(pending, { kind: 'present' });
    expect(offered.tracker?.status).toBe('offered');
    expect(offered.tracker?.qualifyingOpportunitiesSeen).toBe(1);
  });

  it('展示进入 offered 后再收到 qualify → 状态与计数均不变', () => {
    const offered = advanceGuarantee(
      advanceGuarantee(null, { kind: 'qualify' }),
      { kind: 'present' },
    );
    expect(offered.tracker?.status).toBe('offered');
    expect(offered.tracker?.qualifyingOpportunitiesSeen).toBe(1);

    const after = advanceGuarantee(offered, { kind: 'qualify' });
    expect(after.tracker?.status).toBe('offered');
    expect(after.tracker?.qualifyingOpportunitiesSeen).toBe(1);
  });

  it('expired 再收到 expire → 幂等，保留首次终止原因', () => {
    const expired = advanceGuarantee(
      advanceGuarantee(null, { kind: 'qualify' }),
      { kind: 'expire', reason: '首次过期' },
    );
    const again = advanceGuarantee(expired, { kind: 'expire', reason: '再次过期' });
    expect(again.tracker?.status).toBe('expired');
    expect(again.tracker?.terminalReason).toBe('首次过期');
  });

  // D7 语义：五重保障以「合格机会计数」推进——第 1 次合格机会建立 pending 保障，
  // 第 2 次合格机会触发 offered；进入 offered/expired 终态后即冻结，
  // 后续任何事件（含 expire）都不得改写，供结算流程安全读取。
  it('D7 语义：两次合格机会进入 offered 终态后冻结，不再被 expire 改写', () => {
    const step0 = advanceGuarantee(null, { kind: 'qualify' });
    expect(step0.tracker?.status).toBe('pending');

    const step1 = advanceGuarantee(step0, { kind: 'qualify' });
    expect(step1.tracker?.status).toBe('offered');

    const step2 = advanceGuarantee(step1, { kind: 'expire', reason: '结算后过期' });
    expect(step2.tracker?.status).toBe('offered');
    expect(step2.tracker?.terminalReason).toBeUndefined();
  });
});
