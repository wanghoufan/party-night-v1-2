"use client";

import { Suspense } from "react";
import { NeonBackground } from "@/components/brand/NeonBackground";
import { PackEditor } from "@/components/packs/PackEditor";

/** 编辑自定义游戏包：`/packs/editor?id=<packId>`（静态路由，id 走查询参数）。 */
export default function EditPackPage() {
  return <Suspense fallback={<NeonBackground><main className="screen"><p>正在读取游戏包…</p></main></NeonBackground>}><PackEditor /></Suspense>;
}
