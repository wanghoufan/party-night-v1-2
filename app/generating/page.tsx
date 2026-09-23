"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NeonBackground } from "@/components/brand/NeonBackground";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { activateSession } from "@/lib/engine/session-engine";
import { localSeedDeck, requestGeneratedDeck } from "@/lib/ai/generate-deck";
import { aiProviderRepository } from "@/lib/storage/ai-provider-repository";
import { preferencesRepository } from "@/lib/storage/preferences-repository";
import { sessionRepository } from "@/lib/storage/session-repository";
import { gamePackRepository } from "@/lib/storage/game-pack-repository";
import type { GameSession } from "@/lib/domain/schemas";
import { providerErrorMessage } from "@/lib/ai/provider-errors";
import { play } from "@/lib/audio";

const steps = ["分析你的组局信息", "匹配最适合的游戏内容", "执行边界与安全过滤", "生成完整离线游戏"];

function GeneratingPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("session");
  const started = useRef(false);
  const [session, setSession] = useState<GameSession>();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<"loading" | "unconfigured" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => { if (!id) return router.replace("/setup"); void sessionRepository.get(id).then((value) => value ? setSession(value) : router.replace("/setup")); }, [id, router]);
  // Generation is intentionally started once per loaded session; retries are explicit user actions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!session || started.current) return; started.current = true; void generate(session); }, [session]);

  async function finishWithDeck(current: GameSession, cards: ReturnType<typeof localSeedDeck>) {
    play("generate-done");
    const active = activateSession(current, cards);
    await sessionRepository.save(active);
    router.replace(`/game?session=${active.id}`);
  }

  async function generate(current: GameSession) {
    setState("loading"); setStep(0); setMessage("");
    const [profiles, customPacks] = await Promise.all([aiProviderRepository.ensurePresets(), gamePackRepository.list()]);
    const customCards = customPacks.filter((pack) => pack.enabled).flatMap((pack) => pack.cards);
    const preference = await preferencesRepository.get();
    const profile = profiles.find((item) => item.id === preference.activeProviderId) ?? profiles.find((item) => item.isDefault);
    if (!profile) return setState("unconfigured");
    const key = await aiProviderRepository.getSecret(profile.id);
    if (!key) return setState("unconfigured");
    const ticker = window.setInterval(() => { play("generate-tick"); setStep((value) => Math.min(3, value + 1)); }, 700);
    try {
      const deck = await requestGeneratedDeck({ profile, apiKey: key, sessionConfig: current.config, sessionId: current.id, customCards });
      window.clearInterval(ticker); setStep(3); await finishWithDeck(current, deck);
    } catch (error) {
      window.clearInterval(ticker); setState("error"); setMessage(error instanceof Error ? providerErrorMessage(error.message) : "AI 生成暂时失败");
    }
  }

  if (!session) return <NeonBackground><main className="screen generating-screen"><p>正在读取本局…</p></main></NeonBackground>;
  return <NeonBackground><main className="screen generating-screen"><div className="generating-orb" aria-hidden="true"><span>AI</span></div>{state === "loading" ? <><h1>AI 正在为你准备<br />今晚的专属游戏</h1><p>好游戏，值得多一点等待</p><ol>{steps.map((label, index) => <li className={index < step ? "done" : index === step ? "active" : ""} key={label}><span>{index < step ? "✓" : index === step ? "◌" : "○"}</span>{label}</li>)}</ol><div className="generating-progress"><i style={{ width: `${(step + 1) * 25}%` }} /></div></> : <section className="generation-recovery"><div className="recovery-icon"><Icon name="settings" /></div><h1>{state === "unconfigured" ? "请先配置 AI 接口" : "这次生成没有完成"}</h1><p>{message || "配置 AI 后可生成个性化整局内容；也可以直接使用本地题库开始。"}</p><Link className="button button--primary" href="/settings/ai">去配置 AI 接口</Link>{state === "error" && <Button variant="secondary" type="button" onClick={() => void generate(session)}>重试一次</Button>}<Button variant="ghost" type="button" onClick={() => void gamePackRepository.list().then((packs) => finishWithDeck(session, localSeedDeck(session.config, packs.filter((pack) => pack.enabled).flatMap((pack) => pack.cards))))}>使用本地题库开始</Button></section>}</main></NeonBackground>;
}

export default function GeneratingPage() {
  return <Suspense fallback={<NeonBackground><main className="screen generating-screen"><p>正在读取本局…</p></main></NeonBackground>}><GeneratingPageContent /></Suspense>;
}
