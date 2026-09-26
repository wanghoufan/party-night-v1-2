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
import type { CustomGamePack, Intensity, Player, SessionConfig } from "@/lib/domain/schemas";
import { createSession } from "@/lib/engine/session-engine";
import { SESSION_DRAFT_KEY, serializeSessionDraft } from "@/lib/engine/session-draft";
import { deriveQuickStartConfig } from "@/lib/engine/quick-start";
import { createSessionParticipants, type PairGenderInput } from "@/lib/v2-relationship/v2-participants";
import { listManualPlayablePacks, mixedCandidatePackIds } from "@/lib/engine/pack-switcher";
import { gamePackRepository } from "@/lib/storage/game-pack-repository";
import { preferencesRepository } from "@/lib/storage/preferences-repository";
import { loadDisabledPackIds } from "@/lib/storage/pack-enablement";
import { sessionRepository } from "@/lib/storage/session-repository";
import { createId } from "@/lib/utils/create-id";
import { play } from "@/lib/audio";

function defaultPlayers(count = 6): Player[] {
  const time = new Date().toISOString();
  return Array.from({ length: count }, (_, index) => ({ id: createId(), displayName: `玩家 ${index + 1}`, active: true, createdAt: time, lastUsedAt: time }));
}

function SetupPageContent() {
  const router = useRouter();
  const targetPack = useSearchParams().get("pack");
  const [players, setPlayers] = useState<Player[]>(defaultPlayers);
  // D4：当局性别三态（男/女/不填）。默认全空；不沿用上一局、不落 Player 档案（只随本局草稿传递）。
  const [genders, setGenders] = useState<PairGenderInput>({});
  const [relationship, setRelationship] = useState("friends");
  const [vibes, setVibes] = useState<string[]>(["funny"]);
  const [intensity, setIntensity] = useState<Intensity>(3);
  const [previous, setPrevious] = useState<SessionConfig>();
  // 游戏包开关只圈 AI 组局的混合候选（R-056）：这里一次性读出最终集合，不在 boundaries 页二次追加。
  const [disabledPackIds, setDisabledPackIds] = useState<string[]>([]);
  const [customPacks, setCustomPacks] = useState<CustomGamePack[]>([]);

  useEffect(() => {
    void preferencesRepository.get().then((preference) => {
      const config = preference.lastSessionConfig;
      if (!config) return;
      // 上一局只沿用玩家/关系/氛围/尺度；性别属于当局录入，按 D4 一律从「不填」重新开始。
      setPrevious(config); setPlayers(config.players); setGenders({}); setRelationship(config.relationship); setVibes(config.vibes); setIntensity(config.intensity);
    });
    void loadDisabledPackIds().then(setDisabledPackIds);
    void gamePackRepository.list().then(setCustomPacks);
  }, []);

  // 最终混合候选（R-059）：内置真实玩法（未关闭）+ 已启用自定义，去重、规范顺序——UI 的 N 与落库的 config 同源。
  const mixedPackIds = mixedCandidatePackIds(customPacks, disabledPackIds);
  const mixedCustomCount = mixedPackIds.filter((id) => customPacks.some((pack) => pack.definition.id === id)).length;
  const playablePackIds = listManualPlayablePacks(customPacks).map((pack) => pack.id);

  function draftConfig(): SessionConfig {
    const validPack = targetPack && playablePackIds.includes(targetPack) ? targetPack : undefined;
    const mixed = mixedPackIds.length ? mixedPackIds : [...BUILTIN_PACK_IDS];
    return { players, relationship, vibes: vibes.length ? vibes : ["random"], intensity, boundaries: previous?.boundaries ?? { ...DEFAULT_BOUNDARIES }, enabledPackIds: validPack ? [validPack] : mixed, mode: validPack ? "single" : "mixed" };
  }

  function next() {
    play("tap");
    const config = draftConfig();
    sessionStorage.setItem(SESSION_DRAFT_KEY, serializeSessionDraft(config, createSessionParticipants(config.players, genders)));
    router.push("/boundaries");
  }

  async function quickStart() {
    // 真正“开局”的那一刻：一声哨，之后由生成页与主局接管。
    play("start-whistle");
    const config = deriveQuickStartConfig(previous, targetPack ?? "") ?? draftConfig();
    // 快速开局沿用上次的玩家与设置，但性别不跨局沿用（D4：gender 只在当局有效）→ 一律 null。
    const session = createSession(config, [], createSessionParticipants(config.players));
    await Promise.all([sessionRepository.save(session), preferencesRepository.save({ recentPlayers: config.players, lastSessionConfig: config })]);
    router.push(`/generating?session=${session.id}`);
  }

  return (
    <NeonBackground>
      <main className="screen screen--with-tabs setup-screen">
        <header className="screen-header"><Link href="/" aria-label="返回首页"><Icon name="back" /></Link><h1>{targetPack ? "快速开局" : "组局设置"}</h1><span /></header>
        <div className="setup-progress" aria-label="组局进度"><i className="done" /><i className="active" /><i /><i /><i /></div>
        {targetPack && previous && <aside className="quick-start-banner"><span><strong>沿用上次设置</strong><small>{previous.players.length} 人 · 强度 {previous.intensity} · 雷区已保留</small></span><Button type="button" onClick={() => void quickStart()}>直接开始</Button></aside>}
        <PlayerPicker players={players} onChange={setPlayers} genders={genders} onGendersChange={setGenders} />
        <RelationshipSelector value={relationship} onChange={setRelationship} />
        <VibeSelector value={vibes} onChange={setVibes} />
        <IntensitySelector value={intensity} onChange={setIntensity} />
        {!targetPack && <p className="setup-mixed-count">本局 AI 组局候选：<strong>{mixedPackIds.length}</strong> 个玩法{mixedCustomCount ? `（含自定义 ${mixedCustomCount} 个）` : ""}</p>}
        <Button className="sticky-cta" type="button" onClick={next}>下一步：雷区设置 →</Button>
      </main>
      <BottomTabBar />
    </NeonBackground>
  );
}

export default function SetupPage() {
  return <Suspense fallback={<NeonBackground><main className="screen"><p>正在读取组局偏好…</p></main></NeonBackground>}><SetupPageContent /></Suspense>;
}
