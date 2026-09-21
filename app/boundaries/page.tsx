"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NeonBackground } from "@/components/brand/NeonBackground";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { BottomTabBar } from "@/components/ui/BottomTabBar";
import { BoundaryList } from "@/components/party/BoundaryList";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import { sessionConfigSchema, type BoundaryProfile, type SessionConfig } from "@/lib/domain/schemas";
import { createSession } from "@/lib/engine/session-engine";
import { preferencesRepository } from "@/lib/storage/preferences-repository";
import { sessionRepository } from "@/lib/storage/session-repository";

export default function BoundariesPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<SessionConfig>();
  const [boundaries, setBoundaries] = useState<BoundaryProfile>({ ...DEFAULT_BOUNDARIES });
  useEffect(() => { const parsed = sessionConfigSchema.safeParse(JSON.parse(sessionStorage.getItem("party-night-session-draft") ?? "null")); if (parsed.success) void Promise.resolve(parsed.data).then((data) => { setDraft(data); setBoundaries(data.boundaries); }); else router.replace("/setup"); }, [router]);
  // R-059：本页只改雷区。玩法集合在 setup 已经一次算成最终全量（含自定义），这里不再二次追加，避免 N 与落库不一致。
  async function start() { if (!draft) return; const config = { ...draft, boundaries }; const session = createSession(config); await Promise.all([sessionRepository.save(session), preferencesRepository.save({ recentPlayers: config.players, lastSessionConfig: config })]); router.push(`/generating?session=${session.id}`); }
  return <NeonBackground><main className="screen screen--with-tabs boundary-screen"><header className="screen-header"><Link href="/setup" aria-label="返回组局设置"><Icon name="back" /></Link><h1>雷区设置</h1><span /></header><div className="setup-progress"><i className="done" /><i className="done" /><i className="active" /><i /><i /></div><section className="boundary-intro"><h2>哪些内容不适合出现在你们的游戏中？</h2><p>开启后，AI 将自动避开相关内容。</p></section><BoundaryList value={boundaries} onChange={setBoundaries} /><label className="custom-boundary"><strong>自定义雷区</strong><textarea value={boundaries.customText} maxLength={500} placeholder="输入其他不想出现的内容，用逗号分隔" onChange={(event) => setBoundaries({ ...boundaries, customText: event.target.value })} /></label><aside className="boundary-assurance">我们会基于这些设置生成更适合今晚的游戏内容。</aside><Button className="sticky-cta" type="button" onClick={() => void start()} disabled={!draft}>下一步：生成游戏 →</Button></main><BottomTabBar /></NeonBackground>;
}
