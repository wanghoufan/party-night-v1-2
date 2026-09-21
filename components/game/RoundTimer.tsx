"use client";

import { useEffect, useState } from "react";

export function RoundTimer({ roundId }: { roundId: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000); return () => window.clearInterval(timer); }, [roundId]);
  return <div className="round-timer" aria-label={`本轮已进行 ${seconds} 秒`}>{seconds}</div>;
}
