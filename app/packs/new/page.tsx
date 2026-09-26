"use client";

import { Suspense } from "react";
import { NeonBackground } from "@/components/brand/NeonBackground";
import { PackEditor } from "@/components/packs/PackEditor";

/** 新建自定义游戏包（静态路由，可被 Next 静态导出预渲染）。 */
export default function NewPackPage() {
  return <Suspense fallback={<NeonBackground><main className="screen"><p>正在读取游戏包…</p></main></NeonBackground>}><PackEditor /></Suspense>;
}
