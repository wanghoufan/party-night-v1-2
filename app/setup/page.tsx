"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NeonBackground } from "@/components/brand/NeonBackground";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { BottomTabBar } from "@/components/ui/BottomTabBar";
import { PlayerPicker } from "@/components/party/PlayerPicker";
import { RelationshipSelector } from "@/components/party/RelationshipSelector";
import { VibeSelector } from "@/components/party/VibeSelector";
import { IntensitySelector } from "@/components/party/IntensitySelector";
import { DEFAULT_BOUNDARIES, BUILTIN_PACK_IDS } from "@/lib/domain/constants";
import type { Intensity, Player, SessionConfig } from "@/lib/domain/schemas";
import { createSession } from "@/lib/engine/session-engine";
import { deriveQuickStartConfig } from "@/lib/engine/quick-start";
import { preferencesRepository } from "@/lib/storage/preferences-repository";
import { loadDisabledPackIds } from "@/lib/storage/pack-enablement";
import { sessionRepository } from "@/lib/storage/session-repository";
import { createId } from "@/lib/utils/create-id";

function defaultPlayers(count = 6): Player[] {
  const time = new Date().toISOString();
  return Array.from({ length: count }, (_, index) => ({ id: createId(), displayName: `玩家 ${index + 1}`, active: true, createdAt: time, lastUsedAt: time }));
}

function SetupPageContent() {
  const router = useRouter();
  const targetPack = useSearchParams().get("pack");
  const [players, setPlayers] = useState<Player[]>(defaultPlayers);
  const [relationship, setRelationship] = useState("friends");
  const [vibes, setVibes] = useState<string[]>(["funny"]);
  const [intensity, setIntensity] = useState<Intensity>(3);
  const [previous, setPrevious] = useState<SessionConfig>();
  // 用户在“游戏包”禁用的玩法不进混合出题池（FR-044）：禁用就是禁用，不能从组局侧绕回去。
  const [disabledPackIds, setDisabledPackIds] = useState<string[]>([]);

  useEffect(() => {
    void preferencesRepository.get().then((preference) => {
      const config = preference.lastSessionConfig;
      if (!config) return;
      setPrevious(config); setPlayers(config.players); setRelationship(config.relationship); setVibes(config.vibes); setIntensity(config.intensity);
    });
    void loadDisabledPackIds().then(setDisabledPackIds);
  }, []);

  function draftConfig(): SessionConfig {
    const enabledBuiltin = BUILTIN_PACK_IDS.filter((id) => !disabledPackIds.includes(id));
    const validPack = targetPack && enabledBuiltin.includes(targetPack as never) ? targetPack : undefined;
    const mixed = enabledBuiltin.length ? enabledBuiltin : [...BUILTIN_PACK_IDS];
    return { players, relationship, vibes: vibes.length ? vibes : ["random"], intensity, boundaries: previous?.boundaries ?? { ...DEFAULT_BOUNDARIES }, enabledPackIds: validPack ? [validPack] : mixed, mode: validPack ? "single" : "mixed" };
  }

  function next() {
    sessionStorage.setItem("party-night-session-draft", JSON.stringify(draftConfig()));
    router.push("/boundaries");
  }

  async function quickStart() {
    const config = deriveQuickStartConfig(previous, targetPack ?? "") ?? draftConfig();
    const session = createSession(config);
    await Promise.all([sessionRepository.save(session), preferencesRepository.save({ recentPlayers: config.players, lastSessionConfig: config })]);
    router.push(`/generating?session=${session.id}`);
  }

  return (
    <NeonBackground>
      <main className="screen screen--with-tabs setup-screen">
        <header className="screen-header"><Link href="/" aria-label="返回首页"><Icon name="back" /></Link><h1>{targetPack ? "快速开局" : "组局设置"}</h1><span /></header>
        <div className="setup-progress" aria-label="组局进度"><i className="done" /><i className="active" /><i /><i /><i /></div>
        {targetPack && previous && <aside className="quick-start-banner"><span><strong>沿用上次设置</strong><small>{previous.players.length} 人 · 强度 {previous.intensity} · 雷区已保留</small></span><Button type="button" onClick={() => void quickStart()}>直接开始</Button></aside>}
        <PlayerPicker players={players} onChange={setPlayers} />
        <RelationshipSelector value={relationship} onChange={setRelationship} />
        <VibeSelector value={vibes} onChange={setVibes} />
        <IntensitySelector value={intensity} onChange={setIntensity} />
        <Button className="sticky-cta" type="button" onClick={next}>下一步：雷区设置 →</Button>
      </main>
      <BottomTabBar />
    </NeonBackground>
  );
}

export default function SetupPage() {
  return <Suspense fallback={<NeonBackground><main className="screen"><p>正在读取组局偏好…</p></main></NeonBackground>}><SetupPageContent /></Suspense>;
}
