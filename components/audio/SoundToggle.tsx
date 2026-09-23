"use client";

import { useSyncExternalStore } from "react";
import { Toggle } from "@/components/ui/Toggle";
import { setAudioMuted, soundMutedSnapshot, subscribeAudioMuted, unlockAudio } from "@/lib/audio";
import { saveSoundMuted } from "@/lib/audio/mute-preference";

/**
 * 音效开关（V1.7，设置页 + 局中设置共用）：勾选＝音效开（默认），取消＝全局静音。
 * 文案用“已开启 / 已静音”两种状态直说，不靠颜色猜；开关本体沿用 Toggle（span+input，不用 label 包裹）。
 * 打开时顺手解锁一次 AudioContext，让用户当场听到反馈；关掉时立即静音（引擎层直接返回）。
 */
export function SoundToggle() {
  const muted = useSyncExternalStore(subscribeAudioMuted, soundMutedSnapshot, () => false);

  function change(enabled: boolean) {
    const next = !enabled;
    setAudioMuted(next);
    if (!next) unlockAudio();
    void saveSoundMuted(next).catch(() => undefined);
  }

  return (
    <section className="appearance-panel sound-toggle" aria-labelledby="sound-heading">
      <div>
        <h2 id="sound-heading">音效</h2>
        <p>现场合成的提示音，不需要下载音频文件；与“减少动态效果”无关，可以单独关。</p>
      </div>
      <div className="sound-toggle__control">
        <span className={`sound-toggle__state${muted ? "" : " sound-toggle__state--on"}`} role="status">{muted ? "已静音" : "已开启"}</span>
        <Toggle aria-label="音效开关" checked={!muted} onChange={(event) => change(event.target.checked)} />
      </div>
    </section>
  );
}
