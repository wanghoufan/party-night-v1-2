"use client";

import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";

/**
 * B8 / D8=A+｜耗尽 Host 决策面板。
 *
 * 只在编排器（`drawV2SessionCard`）返回 `AWAITING_HOST_EXHAUSTION_DECISION` 时弹出：
 * 全局硬合法集在软去重窗口放宽到 0 后仍空，暂停抽卡，由 Host 显式二选一。
 * - 结束本局：本局到此为止，走结算；
 * - 洗牌再玩：只清 relationship-aware 普通 used，保留最近 5 张软去重 / Heat / MATCH / 5 档保障。
 * 两个动作都经 `applyV2HostDecision`（幂等键 `sessionId + exhaustionCycle + 1`）落库，重放不会重复清零。
 */
export function HostExhaustionSheet({ open, onFinish, onReshuffle, busy = false }: {
  open: boolean;
  onFinish: () => void;
  onReshuffle: () => void;
  busy?: boolean;
}) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-label="可玩的题都出完了">
        <h2>可玩的题都出完了</h2>
        <p>当前已经没有可以出的卡。要不要洗牌，把没出过的题重新放回牌堆？</p>
        <div className="modal-actions">
          <Button variant="ghost" type="button" disabled={busy} onClick={onFinish}>结束本局</Button>
          <Button type="button" disabled={busy} onClick={onReshuffle}>洗牌再玩</Button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
