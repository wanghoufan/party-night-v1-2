"use client";

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { Player } from "@/lib/domain/schemas";

/** 旋转动画时长：与 CSS 过渡一致，只是表演，不参与选人（Plan 8.4）。 */
export const SPIN_MS = 1100;
/** 每次旋转都多转两圈再停在 target 座位上，方向永远由“已定下的结果”决定。 */
const FULL_TURNS = 2;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** 主局传给转瓶子的上下文：玩家名单 + 上一次落点 + 两个回调（抽人 / 链入真心话大冒险）。 */
export interface SpinBottleHandlers {
  players: Player[];
  /** 上一次落点：刷新后据此直接回到结果页，同时交给 selector 避免连续指同一人。 */
  lastSelectedPlayerId?: string;
  /** 先定结果再播动画：同步返回本次落点（主局负责落库），没有在场玩家时返回 undefined。 */
  onSpin: () => Player | undefined;
  /** 结果页去向：链入现有真心话大冒险 Pack，不复制它的出题逻辑。 */
  onChain: (kind: "truth" | "dare") => void;
}

export interface SpinBottleProps {
  spin: SpinBottleHandlers;
}

function subscribeReducedMotion(onStoreChange: () => void) {
  const query = typeof window.matchMedia === "function" ? window.matchMedia(REDUCED_MOTION_QUERY) : undefined;
  query?.addEventListener("change", onStoreChange);
  return () => query?.removeEventListener("change", onStoreChange);
}

function reducedMotionSnapshot() {
  return typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * 转瓶子视图（Plan 8.4 / US6 / T151）：点击开始 → 结果先由主局定下并落库 → 播放指向该人的动画 → 结果页。
 * 只从在场玩家中选人；被指到的人保留在结果页，可链入真心话/大冒险，或再转一次。
 * 刷新只恢复最终落点，不复播半截动画；reduced-motion 下不等待旋转。
 */
export function SpinBottleView({ spin }: SpinBottleProps) {
  const active = spin.players.filter((player) => player.active);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => false);
  const [target, setTarget] = useState<Player | undefined>(() => active.find((player) => player.id === spin.lastSelectedPlayerId));
  const [phase, setPhase] = useState<"ready" | "spinning" | "result">(target ? "result" : "ready");
  const [turn, setTurn] = useState(0);

  useEffect(() => {
    if (phase !== "spinning") return;
    const timer = window.setTimeout(() => setPhase("result"), SPIN_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  function start() {
    const picked = spin.onSpin();
    if (!picked) return;
    setTarget(picked);
    setTurn((value) => value + 1);
    setPhase(reducedMotion ? "result" : "spinning");
  }

  const seatAngle = (index: number) => (active.length ? Math.round((360 / active.length) * index) : 0);
  const targetIndex = target ? active.findIndex((player) => player.id === target.id) : -1;
  const angle = targetIndex >= 0 ? turn * 360 * FULL_TURNS + seatAngle(targetIndex) : 0;

  return (
    <article className="game-card game-card--spin-bottle spin-bottle" data-phase={phase} data-target-player-id={target?.id ?? ""}>
      <span className="game-card__crown" aria-hidden="true">♔</span>
      <div className="game-card__pack"><Icon name="glass" />转瓶子</div>

      <div className="spin-bottle__stage">
        <ul className="spin-bottle__seats">
          {active.map((player, index) => (
            <li
              className={`spin-bottle__seat${target?.id === player.id ? " spin-bottle__seat--on" : ""}`}
              key={player.id}
              style={{ "--seat-angle": `${seatAngle(index)}deg` } as CSSProperties}
            >
              {player.displayName}
            </li>
          ))}
        </ul>
        {/* 指针只负责“指过去”：角度由已定下的 target 座位算出，动画结束后正好停在那个人身上。 */}
        <div className="spin-bottle__pointer" aria-hidden="true" style={{ "--spin-angle": `${angle}deg` } as CSSProperties}>
          <span className="spin-bottle__marker">▲</span>
        </div>
        <span className="spin-bottle__bottle" aria-hidden="true"><Icon name="glass" /></span>
      </div>

      {phase !== "result" && (
        <p className="spin-bottle__hint" role="status">
          {phase === "spinning" ? "转动中…" : active.length ? "点一下，瓶子会指向今晚的一个人" : "至少需要 2 名在场玩家"}
        </p>
      )}
      {phase === "ready" && (
        <div className="spin-bottle__controls">
          <Button type="button" disabled={!active.length} onClick={start}><Icon name="refresh" />开始旋转</Button>
        </div>
      )}
      {phase === "result" && target && (
        <div className="spin-bottle__result">
          <p className="spin-bottle__target" role="status">🎯 {target.displayName}</p>
          <div className="spin-bottle__choices">
            <Button type="button" onClick={() => spin.onChain("truth")}>真心话</Button>
            <Button type="button" onClick={() => spin.onChain("dare")}>大冒险</Button>
          </div>
          <Button variant="secondary" type="button" onClick={start}><Icon name="refresh" />再转一次</Button>
        </div>
      )}
      <span className="game-card__source">纯本地随机 · 不联网</span>
    </article>
  );
}
