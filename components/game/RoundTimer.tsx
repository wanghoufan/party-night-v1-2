"use client";

import { useEffect, useState } from "react";

export function RoundTimer({ roundId }: { roundId: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000); return () => window.clearInterval(timer); }, [roundId]);
  // role="timer" 是 ARIA 的 live region 角色（默认不打扰朗读），让 aria-label 真的被辅助技术读到；不逐秒播报。
  return <div className="round-timer" role="timer" aria-label={`本轮已进行 ${seconds} 秒`}>{seconds}</div>;
}
