import { describe, expect, it } from "vitest";
import { SOUND_NAMES, envelopeAt, envelopePoints, getPreset, isSoundName, presetDurationMs, resolveTone, resolvedTimeline, type SoundName } from "@/lib/audio/presets";

/**
 * 音效预设表（V1.7）：全部是数据，引擎按数据现场合成。
 * 这里锁死三件事——表要全（需求点名的预设一个都不能少）、数值合法（不会爆音/负时长）、纯函数口径稳定。
 */

/** 需求点名的全量预设。 */
const REQUIRED: SoundName[] = [
  "tap", "start-whistle",
  "generate-tick", "generate-done",
  "deal", "complete", "swap", "skip", "pack-switch",
  "countdown-tick", "countdown-go",
  "spin-whoosh", "spin-tick", "spin-land",
  "chain-enter", "compat-same", "compat-different",
  "launcher-suspense", "launcher-reveal",
  "tool-pick", "tool-groups",
  "pause", "resume", "finish-chord", "fanfare",
];

describe("音效预设表", () => {
  it("全表与需求点名的一一对应（不多不少）", () => {
    expect(SOUND_NAMES.slice().sort()).toEqual(REQUIRED.slice().sort());
    for (const name of REQUIRED) expect(isSoundName(name), name).toBe(true);
    expect(isSoundName("no-such-sound")).toBe(false);
  });

  it("每个预设都有事件、时长为正、音量/频率在合法值域内", () => {
    for (const name of SOUND_NAMES) {
      const preset = getPreset(name)!;
      expect(preset.events.length, name).toBeGreaterThan(0);
      expect(presetDurationMs(preset), name).toBeGreaterThan(0);
      for (const event of resolvedTimeline(preset)) {
        expect(event.at, name).toBeGreaterThanOrEqual(0);
        expect(event.duration, name).toBeGreaterThan(0);
        expect(event.gain, name).toBeGreaterThan(0);
        expect(event.gain, name).toBeLessThanOrEqual(1);
        expect(event.freq, name).toBeGreaterThan(0);
        expect(event.attack + event.release, name).toBeLessThanOrEqual(event.duration);
      }
    }
  });

  it("只有转瓶子呼呼是循环，循环预设必须给 repeatMs", () => {
    const loops = SOUND_NAMES.filter((name) => getPreset(name)!.kind === "loop");
    expect(loops).toEqual(["spin-whoosh"]);
    for (const name of loops) expect(getPreset(name)!.repeatMs, name).toBeGreaterThan(0);
  });

  it("噪声事件必须带带通中心频率（否则只会是一整片白噪）", () => {
    for (const name of SOUND_NAMES) {
      for (const event of getPreset(name)!.events) {
        if (event.wave === "noise") expect(event.filter, name).toBeGreaterThan(0);
      }
    }
  });
});

describe("预设纯函数", () => {
  it("resolveTone 补齐缺省值", () => {
    expect(resolveTone({ at: 0, duration: 100 })).toMatchObject({ at: 0, duration: 100, wave: "sine", freq: 440, gain: 0.18, attack: 8, release: 92 });
  });

  it("resolveTone 把越界值钳回合法区间（时长有下限、起音+释音不超过总时长）", () => {
    expect(resolveTone({ at: -50, duration: 0, gain: 5, attack: 999, release: 999 })).toMatchObject({ at: 0, duration: 1, gain: 1, attack: 1, release: 0 });
    expect(resolveTone({ at: 0, duration: 200, to: 0, filter: 1 })).toMatchObject({ to: 1, filter: 20 });
  });

  it("包络是 0 → 峰值 → 保持 → 0，首尾都落在 0（不爆音）", () => {
    const tone = resolveTone({ at: 0, duration: 400, gain: 0.5, attack: 100, release: 100 });

    expect(envelopeAt(tone, -1)).toBe(0);
    expect(envelopeAt(tone, 0)).toBe(0);
    expect(envelopeAt(tone, 50)).toBeCloseTo(0.25);
    expect(envelopeAt(tone, 100)).toBeCloseTo(0.5);
    expect(envelopeAt(tone, 300)).toBeCloseTo(0.5);
    expect(envelopeAt(tone, 400)).toBe(0);
    expect(envelopeAt(tone, 900)).toBe(0);
    expect(envelopePoints(tone)[0]).toEqual([0, 0]);
    expect(envelopePoints(tone).at(-1)).toEqual([400, 0]);
  });

  it("零起音＝打击型包络：从峰值直接衰减，不会出现 NaN", () => {
    const tone = resolveTone({ at: 0, duration: 100, attack: 0, gain: 0.4 });
    expect(envelopePoints(tone)[0]).toEqual([0, 0.4]);
    expect(envelopeAt(tone, 0)).toBe(0);
    expect(envelopeAt(tone, 50)).toBeCloseTo(0.2);
    expect(envelopeAt(tone, 100)).toBe(0);
  });

  it("总时长＝最后一个事件的结束时刻；时间线按开始时间排序", () => {
    const preset = { kind: "one-shot" as const, events: [{ at: 200, duration: 100 }, { at: 0, duration: 50 }] };
    expect(presetDurationMs(preset)).toBe(300);
    expect(resolvedTimeline(preset).map((tone) => tone.at)).toEqual([0, 200]);
  });
});
