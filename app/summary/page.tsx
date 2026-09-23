"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NeonBackground } from "@/components/brand/NeonBackground";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { GameSession } from "@/lib/domain/schemas";
import { calculateSessionSummary } from "@/lib/engine/session-summary";
import { createSession } from "@/lib/engine/session-engine";
import { sessionRepository } from "@/lib/storage/session-repository";
import { summaryRepository } from "@/lib/storage/summary-repository";
import { play } from "@/lib/audio";

const labels: Record<string, [string, string]> = { "truth-dare": ["♥", "真心话大冒险"], "most-likely": ["♟", "谁最可能"], "never-have": ["♜", "我从来没有"], "ai-improv": ["✦", "AI 即兴"] };

function SummaryPageContent() {
  const router = useRouter();
  const id = useSearchParams().get("session");
  const [session, setSession] = useState<GameSession>();
  useEffect(() => { if (!id) return router.replace("/"); void sessionRepository.get(id).then((value) => value ? setSession(value) : router.replace("/")); }, [id, router]);
  const summary = useMemo(() => session ? calculateSessionSummary(session) : undefined, [session]);
  useEffect(() => { if (summary) void summaryRepository.save(summary); }, [summary]);
  // 总结页 fanfare：本局数据就绪时响一次（静音或未解锁时 no-op）。
  useEffect(() => { if (summary) play("fanfare"); }, [summary]);
  async function replay() { if (!session) return; const next = createSession(session.config); await sessionRepository.save(next); router.push(`/generating?session=${next.id}`); }
  if (!session || !summary) return <NeonBackground><main className="screen"><p>正在整理本局数据…</p></main></NeonBackground>;
  const minutes = Math.max(1, Math.round(summary.durationSeconds / 60));
  const favorite = Object.entries(summary.packDistribution).sort(([, a], [, b]) => b - a)[0]?.[0];
  return <NeonBackground><main className="screen summary-screen"><div className="summary-confetti" aria-hidden="true">✦　♛　✧</div><h1>今晚游戏结束！</h1><p>感谢有你们，让这个夜晚更特别</p><section className="summary-stats"><article><strong>{summary.totalRounds}</strong><span>游戏轮次</span></article><article><strong>{minutes}<small> 分钟</small></strong><span>游戏总时长</span></article><article><strong>{summary.playerCount}<small> 人</small></strong><span>参与人数</span></article><article><strong>{labels[favorite ?? ""]?.[1] ?? "混合模式"}</strong><span>最受欢迎模式</span></article></section><section className="summary-breakdown"><h2>本场游戏数据</h2>{Object.entries(summary.packDistribution).map(([packId, count]) => { const ratio = summary.totalRounds ? Math.round(count / summary.totalRounds * 100) : 0; return <div key={packId}><span>{labels[packId]?.[0] ?? "✦"} {labels[packId]?.[1] ?? packId}</span><strong>{count} 轮</strong><i><b style={{ width: `${ratio}%` }} /></i><small>{ratio}%</small></div>; })}</section><blockquote>“最好的游戏，<br />是和最好的朋友一起创造的回忆。”</blockquote><Button className="summary-replay" type="button" onClick={() => void replay()}><Icon name="refresh" />再来一局</Button><Link href="/">返回首页</Link></main></NeonBackground>;
}

export default function SummaryPage() {
  return <Suspense fallback={<NeonBackground><main className="screen"><p>正在整理本局数据…</p></main></NeonBackground>}><SummaryPageContent /></Suspense>;
}
