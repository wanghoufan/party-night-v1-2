"use client";

import { useEffect } from "react";
import { hydrateSoundPreference } from "@/lib/audio/mute-preference";
import { unlockAudio } from "@/lib/audio";

/**
 * 音效启动器（V1.7，挂在根布局，不渲染任何 DOM）：
 * 1）把持久化的静音偏好灌进引擎（默认开）；
 * 2）监听首个用户手势（pointerdown/keydown/touchstart，捕获阶段）解锁 AudioContext——
 *    捕获阶段保证它早于组件自己的 click 回调，第一次点击的 tap 音就听得见；
 * 3）解锁前 play() 一律 no-op，不报警、不排队。
 */
export function SoundProvider() {
  useEffect(() => { void hydrateSoundPreference().catch(() => undefined); }, []);

  useEffect(() => {
    const unlock = () => { unlockAudio(); };
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    for (const name of events) window.addEventListener(name, unlock, { capture: true, passive: true });
    return () => { for (const name of events) window.removeEventListener(name, unlock, { capture: true }); };
  }, []);

  return null;
}
