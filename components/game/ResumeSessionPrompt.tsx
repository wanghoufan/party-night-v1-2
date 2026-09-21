"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { GameSession } from "@/lib/domain/schemas";
import { sessionRepository } from "@/lib/storage/session-repository";
import { Icon } from "@/components/ui/Icon";

export function ResumeSessionPrompt() {
  const [session, setSession] = useState<GameSession>();
  useEffect(() => { void sessionRepository.getLatestUnfinished().then(setSession); }, []);
  if (!session) return null;
  const href = session.status === "generating" ? `/generating?session=${session.id}` : `/game?session=${session.id}`;
  return <aside className="resume-session"><div><Icon name="refresh" /><span><strong>继续上一局</strong><small>已完成 {session.rounds.length} 轮 · {session.config.players.filter((player) => player.active).length} 人在场</small></span></div><Link href={href}>继续 <Icon name="chevron" /></Link></aside>;
}
