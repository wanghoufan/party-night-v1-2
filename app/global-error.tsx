"use client";

import Link from "next/link";
import "./globals.css";

/**
 * 根布局自身崩溃时的最后一道防线（T190）：global-error 会替换整个根布局，
 * 所以自带 html/body 与全局样式，保证至少能回首页而不是白屏。
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN" data-theme="dark">
      <body>
        <main className="screen game-screen" role="alert">
          <section className="empty-deck">
            <h1>Party Night 没能启动</h1>
            <p>本机的记录都还在。重试一次，或回首页重新开始。</p>
            <button className="button button--primary" type="button" onClick={reset}>再试一次</button>
            <Link className="button button--ghost" href="/">返回首页</Link>
          </section>
        </main>
      </body>
    </html>
  );
}
