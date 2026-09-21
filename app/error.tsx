"use client";

import Link from "next/link";
import { NeonBackground } from "@/components/brand/NeonBackground";
import { Button } from "@/components/ui/Button";

/**
 * 根级错误边界（T190）：任何页面渲染期异常都不能变成白屏。
 * 本地数据还在，所以只给两条轻出路——重试当前页，或回首页继续上一局/重新开局。
 */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <NeonBackground className="game-bg">
      <main className="screen game-screen" role="alert">
        <section className="empty-deck">
          <h1>这一局没能正常打开</h1>
          <p>本机的记录都还在。可以回首页继续上一局，或者重新开一局。</p>
          <Button type="button" onClick={reset}>再试一次</Button>
          <Link className="button button--ghost" href="/">返回首页</Link>
        </section>
      </main>
    </NeonBackground>
  );
}
