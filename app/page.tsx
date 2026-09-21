import Link from "next/link";
import { PartyNightLogo } from "@/components/brand/PartyNightLogo";
import { NeonBackground } from "@/components/brand/NeonBackground";
import { ResumeSessionPrompt } from "@/components/game/ResumeSessionPrompt";
import { BottomTabBar } from "@/components/ui/BottomTabBar";
import { Icon } from "@/components/ui/Icon";

const modes = [
  ["truth-dare", "heart", "真心话大冒险", "粉色心跳"],
  ["most-likely", "users", "谁最可能", "全员投票"],
  ["never-have", "glass", "我从来没有", "举手坦白"],
  ["ai-improv", "spark", "AI 即兴", "现场任务"],
] as const;

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
        <Link className="home-primary" href="/setup">今晚开局 <Icon name="chevron" /></Link>
        <section className="mode-grid" aria-label="快速模式">
          {modes.map(([id, icon, name, note]) => <Link href={`/setup?pack=${id}`} key={id}><Icon name={icon} /><strong>{name}</strong><small>{note}</small></Link>)}
        </section>
        <Link className="home-row" href="/packs"><Icon name="cube" /><span><strong>我的游戏包</strong><small>创建属于你们的玩法</small></span><Icon name="chevron" /></Link>
        <Link className="home-row ai-row" href="/settings/ai"><Icon name="settings" /><span><strong>AI 模型设置</strong><small>默认使用 DeepSeek 官方</small></span><Icon name="chevron" /></Link>
      </main>
      <BottomTabBar />
    </NeonBackground>
  );
}
