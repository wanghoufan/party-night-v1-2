"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";

/**
 * 主局顶栏（V1.5 三区）：左＝暂停/继续（48px，aria-pressed 明示状态）、中＝当前段轮次 + 局中设置齿轮、
 * 右＝结束本局（危险色，二次确认后才进总结，避免手滑收局）。
 * 暂停只冻结现场（倒数/timer/旋转/推进动作），不改变 Session 数据。
 */
export function RoundHeader({ current, planned, paused, onTogglePause, onSettings, onFinish }: {
  current: number;
  planned: number;
  paused: boolean;
  onTogglePause: () => void;
  onSettings: () => void;
  onFinish: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <header className="round-header">
      <button className="round-header__pause" type="button" aria-pressed={paused} onClick={onTogglePause}>
        <Icon name={paused ? "play" : "pause"} />{paused ? "继续" : "暂停"}
      </button>
      <div className="round-header__center">
        <span className="round-header__count">第 {current} / {planned} 轮</span>
        <button className="round-header__settings" type="button" aria-label="打开局中设置" onClick={onSettings}><Icon name="settings" /></button>
      </div>
      <button className="round-header__end" type="button" onClick={() => setConfirming(true)}>结束</button>
      <Modal open={confirming} title="结束本局？" onClose={() => setConfirming(false)}>
        <p className="round-header__confirm-text">结束后进入本局总结，不能再继续出题。</p>
        <div className="round-header__confirm-actions">
          <Button variant="danger" type="button" onClick={() => { setConfirming(false); onFinish(); }}>确认结束</Button>
          <Button variant="ghost" type="button" onClick={() => setConfirming(false)}>继续玩</Button>
        </div>
      </Modal>
    </header>
  );
}
