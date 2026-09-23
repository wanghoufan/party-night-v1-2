"use client";

import Link from "next/link";
import { PartyNightLogo } from "@/components/brand/PartyNightLogo";
import { NeonBackground } from "@/components/brand/NeonBackground";
import { PackShortcutGrid } from "@/components/game/PackShortcutGrid";
import { ResumeSessionPrompt } from "@/components/game/ResumeSessionPrompt";
import { PartyToolsSection } from "@/components/tools/PartyToolsSection";
import { BottomTabBar } from "@/components/ui/BottomTabBar";
import { Icon } from "@/components/ui/Icon";
import { play } from "@/lib/audio";

export default function HomePage() {
  return (
    <NeonBackground className="home-bg">
      <main className="screen home-screen">
        <ResumeSessionPrompt />
        <header className="home-hero">
          <PartyNightLogo />
          <p>夜店酒吧聚会游戏工具</p>
          <div className="hero-promise"><span>轻松破冰</span><span>睡前抽题</span><span>聚会必备</span></div>
        </header>
        <section className="home-stage" aria-label="今晚的派对"><div className="disco-orb" aria-hidden="true"><span>PN</span></div><p>好朋友，从今晚开始！</p></section>
        <Link className="home-primary" href="/setup" onClick={() => play("tap")}>今晚开局（AI 组局） <Icon name="chevron" /></Link>
        <PackShortcutGrid />
        <div className="home-tools"><PartyToolsSection /></div>
      </main>
      <BottomTabBar />
    </NeonBackground>
  );
}
