import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isAudioMuted, isAudioSupported, isAudioUnlocked, play, resetAudioState, setAudioMuted, soundMutedSnapshot, startSoundLoop, subscribeAudioMuted, unlockAudio } from "@/lib/audio/engine";

/**
 * 音效引擎（V1.7）：WebAudio 现场合成，没有音频文件。
 * 两种环境都要安全——没有 AudioContext（SSR/jsdom/老浏览器）＝静默 no-op；有 AudioContext＝真的排节点。
 */

class FakeParam {
  value = 0;
  events: Array<[string, number, number]> = [];
  setValueAtTime(value: number, at: number) { this.value = value; this.events.push(["set", value, at]); return this; }
  linearRampToValueAtTime(value: number, at: number) { this.value = value; this.events.push(["linear", value, at]); return this; }
  exponentialRampToValueAtTime(value: number, at: number) { this.value = value; this.events.push(["exp", value, at]); return this; }
  cancelScheduledValues() { this.events.push(["cancel", 0, 0]); return this; }
}

class FakeNode { connect() { return this; } disconnect() { return this; } }
class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakeFilter extends FakeNode { type = "bandpass"; frequency = new FakeParam(); Q = new FakeParam(); }
class FakeBufferSource extends FakeNode { buffer: unknown; loop = false; onended: (() => void) | null = null; startedAt?: number; stoppedAt?: number; start(at: number) { this.startedAt = at; } stop(at: number) { this.stoppedAt = at; } }

class FakeOscillator extends FakeNode {
  type = "sine";
  frequency = new FakeParam();
  onended: (() => void) | null = null;
  startedAt?: number;
  stoppedAt?: number;
  start(at: number) { this.startedAt = at; }
  stop(at: number) { this.stoppedAt = at; }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static reset() { FakeAudioContext.instances = []; }
  state: "suspended" | "running" | "closed" = "suspended";
  currentTime = 0;
  sampleRate = 48000;
  destination = new FakeNode();
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  buffers = 0;
  resumed = 0;
  constructor() { FakeAudioContext.instances.push(this); }
  createGain() { const node = new FakeGain(); this.gains.push(node); return node; }
  createOscillator() { const node = new FakeOscillator(); this.oscillators.push(node); return node; }
  createBufferSource() { return new FakeBufferSource(); }
  createBiquadFilter() { return new FakeFilter(); }
  createBuffer(_channels: number, length: number) { this.buffers += 1; return { sampleRate: this.sampleRate, length, getChannelData: () => new Float32Array(length) }; }
  resume() { this.resumed += 1; this.state = "running"; return Promise.resolve(); }
}

const lastContext = () => FakeAudioContext.instances.at(-1)!;

afterEach(() => {
  resetAudioState();
  FakeAudioContext.reset();
  vi.unstubAllGlobals();
});

describe("没有 WebAudio 的环境（jsdom / SSR / 老浏览器）", () => {
  beforeEach(() => resetAudioState());

  it("解锁返回 false，播放与循环一律 no-op，绝不抛错", () => {
    expect(isAudioSupported()).toBe(false);
    expect(unlockAudio()).toBe(false);
    expect(isAudioUnlocked()).toBe(false);
    expect(() => play("tap")).not.toThrow();
    expect(() => play("spin-whoosh")).not.toThrow();
    expect(startSoundLoop("spin-whoosh")).toBeUndefined();
  });
});

describe("有 WebAudio 的环境", () => {
  beforeEach(() => {
    resetAudioState();
    FakeAudioContext.reset();
    vi.stubGlobal("AudioContext", FakeAudioContext);
  });

  it("首个手势解锁后才有图；未解锁前 play 静默（不建节点）", () => {
    play("tap");
    expect(FakeAudioContext.instances).toHaveLength(0);

    expect(unlockAudio()).toBe(true);
    expect(isAudioUnlocked()).toBe(true);
    play("tap");
    expect(lastContext().oscillators.length).toBeGreaterThan(0);
  });

  it("play 按预设排振荡器：起止时间递增、包络首尾归零；扫频事件用指数滑音", () => {
    unlockAudio();
    play("skip");
    const [oscillator] = lastContext().oscillators;
    expect(oscillator!.startedAt).toBeGreaterThanOrEqual(0);
    expect(oscillator!.stoppedAt!).toBeGreaterThan(oscillator!.startedAt!);
    expect(oscillator!.frequency.events.some(([type]) => type === "exp")).toBe(true);
    const envelope = lastContext().gains.at(-1)!.gain.events.filter(([type]) => type === "linear");
    expect(envelope[0]![1]).toBe(0);
    expect(envelope.at(-1)![1]).toBe(0);
  });

  it("噪声事件另走 buffer + 带通，不建振荡器", () => {
    unlockAudio();
    play("swap");
    expect(lastContext().oscillators).toHaveLength(0);
    expect(lastContext().buffers).toBe(1);
  });

  it("静音后 play/loop 都是 no-op（连图都不碰）", () => {
    unlockAudio();
    setAudioMuted(true);
    play("tap");
    expect(lastContext().oscillators).toHaveLength(0);
    expect(startSoundLoop("spin-whoosh")).toBeUndefined();
    setAudioMuted(false);
    expect(play("tap")).toBeUndefined();
    expect(lastContext().oscillators.length).toBeGreaterThan(0);
  });

  it("循环音效返回 stop：停止后把已排节点淡出到 0", () => {
    unlockAudio();
    const loop = startSoundLoop("spin-whoosh");
    expect(loop).toBeDefined();
    const gainsBeforeStop = lastContext().gains.length;
    loop!.stop();
    const faded = lastContext().gains.slice(gainsBeforeStop - 4);
    expect(faded.some((gain) => gain.gain.events.some(([type, value]) => type === "linear" && value === 0))).toBe(true);
    expect(startSoundLoop("tap")).toBeUndefined();
  });
});

describe("静音状态订阅（设置页开关用）", () => {
  beforeEach(() => resetAudioState());

  it("默认不静音；同值不重复通知；取消订阅后不再收到", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAudioMuted(listener);

    expect(isAudioMuted()).toBe(false);
    expect(soundMutedSnapshot()).toBe(false);

    setAudioMuted(true);
    expect(isAudioMuted()).toBe(true);
    expect(soundMutedSnapshot()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    setAudioMuted(true);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setAudioMuted(false);
    expect(isAudioMuted()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
