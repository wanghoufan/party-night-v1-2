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
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { CustomGamePack, Intensity, Player, SessionConfig } from "@/lib/domain/schemas";
import { createSession } from "@/lib/engine/session-engine";
import { SESSION_DRAFT_KEY, serializeSessionDraft } from "@/lib/engine/session-draft";
import { deriveQuickStartConfig } from "@/lib/engine/quick-start";
import { createSessionParticipants, type PairGenderInput } from "@/lib/v2-relationship/v2-participants";
import { listManualPlayablePacks, mixedCandidatePackIds, noPlayablePackNotice, packMinPlayersNotice } from "@/lib/engine/pack-switcher";
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
  // 再按在场人数收口（AI-MATRIX-PLAN §1）：人数不够的玩法不进 AI 组局候选，否则会生成 0 张卡（卡被 safety-filter 按 minPlayers 全滤掉）。
  const activePlayerCount = players.filter((player) => player.active).length;
  const mixedPackIds = mixedCandidatePackIds(customPacks, disabledPackIds, activePlayerCount);
  const mixedCustomCount = mixedPackIds.filter((id) => customPacks.some((pack) => pack.definition.id === id)).length;
  const playablePackIds = listManualPlayablePacks(customPacks).map((pack) => pack.id);
  // 直选玩法的人数门槛（首页玩法卡 → `/setup?pack=…` 这条路径也走这里）：人数不够就只提示、绝不进生成页。
  const targetPackNotice = targetPack ? packMinPlayersNotice(targetPack, activePlayerCount, customPacks) : undefined;
  // 快速开局用的是“上次的玩家名单”（deriveQuickStartConfig 取 previous.players），按那份名单单独复核一次门槛。
  const quickStartNotice = targetPack && previous ? packMinPlayersNotice(targetPack, previous.players.filter((player) => player.active).length, customPacks) : undefined;
  // 直选玩法只有在注册表里、当前人数够、且没有拦截文案时才算单玩玩法；否则本页按混合组局走。
  const validTargetPack = targetPack && playablePackIds.includes(targetPack) && !targetPackNotice ? targetPack : undefined;
  // R-CB4：混合候选为空＝人数不够 + 已关闭玩法凑不出任何可用玩法。停下提示，**绝不**回调全量内置——
  // 那会复活玩家已关闭的玩法与人数非法的玩法，AI 组局生成 0 张卡，进主局就是死局。
  const mixedPoolEmpty = !validTargetPack && mixedPackIds.length === 0;
  const mixedPoolNotice = mixedPoolEmpty ? noPlayablePackNotice(activePlayerCount) : undefined;
  // 当前这份设置开不了局的原因（当前在场人数口径）；沿用上次名单的快速开局门槛另算。
  const startBlockedNotice = targetPackNotice ?? mixedPoolNotice;
  const setupNotice = quickStartNotice ?? startBlockedNotice;

  function draftConfig(): SessionConfig {
    // mixedPackIds 为空时这里就是空数组：由 startBlockedNotice 在 next()/quickStart() 挡住，不会真拿去开局。
    return { players, relationship, vibes: vibes.length ? vibes : ["random"], intensity, boundaries: previous?.boundaries ?? { ...DEFAULT_BOUNDARIES }, enabledPackIds: validTargetPack ? [validTargetPack] : mixedPackIds, mode: validTargetPack ? "single" : "mixed" };
  }

  function next() {
    play("tap");
    if (startBlockedNotice) return; // 人数不够 / 没有可用玩法：停在 setup 页提示，不进生成（保留改人数/换玩法的出口）
    const config = draftConfig();
    sessionStorage.setItem(SESSION_DRAFT_KEY, serializeSessionDraft(config, createSessionParticipants(config.players, genders)));
    router.push("/boundaries");
  }

  async function quickStart() {
    if (quickStartNotice) return; // 沿用上次名单也不够人：同样拦住，不进生成页
    const reused = deriveQuickStartConfig(previous, targetPack ?? "");
    // 沿用上次名单开不起来（名单不足 2 人 / 玩法不在注册表），要退回本页当前设置时，本页必须自己站得住：
    // 没有可用玩法就停下提示，不静默生成空局（R-CB4 与 next() 同口径）。
    if (!reused && mixedPoolEmpty) return;
    // 真正“开局”的那一刻：一声哨，之后由生成页与主局接管。
    play("start-whistle");
    const config = reused ?? draftConfig();
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
        {setupNotice && <aside className="setup-pack-notice" role="alert"><span>{setupNotice}</span>{mixedPoolEmpty ? <Link href="/packs">去游戏包开启玩法</Link> : <Link href="/">返回首页换个玩法</Link>}</aside>}
        {targetPack && previous && !quickStartNotice && <aside className="quick-start-banner"><span><strong>沿用上次设置</strong><small>{previous.players.length} 人 · 强度 {previous.intensity} · 雷区已保留</small></span><Button type="button" onClick={() => void quickStart()}>直接开始</Button></aside>}
        <PlayerPicker players={players} onChange={setPlayers} genders={genders} onGendersChange={setGenders} />
        <RelationshipSelector value={relationship} onChange={setRelationship} />
        <VibeSelector value={vibes} onChange={setVibes} />
        <IntensitySelector value={intensity} onChange={setIntensity} />
        {!targetPack && <p className="setup-mixed-count">本局 AI 组局候选：<strong>{mixedPackIds.length}</strong> 个玩法{mixedCustomCount ? `（含自定义 ${mixedCustomCount} 个）` : ""}</p>}
        <Button className="sticky-cta" type="button" onClick={next} disabled={Boolean(startBlockedNotice)}>下一步：雷区设置 →</Button>
      </main>
      <BottomTabBar />
    </NeonBackground>
  );
}

export default function SetupPage() {
  return <Suspense fallback={<NeonBackground><main className="screen"><p>正在读取组局偏好…</p></main></NeonBackground>}><SetupPageContent /></Suspense>;
}
