import { envelopePoints, getPreset, presetDurationMs, resolveTone, type ResolvedTone, type SoundName } from "./presets";

/**
 * 现场合成引擎（V1.7）：不加载任何音频文件，全部用 WebAudio 振荡器/噪声按预设表实时合成，离线可用。
 * 三条硬约束：
 * 1）首个用户手势之前**不出声也不报错**——没有 AudioContext（含 SSR/jsdom/老浏览器）时一律静默 no-op；
 * 2）总静音是独立开关，落在 preferences（见 ./mute-preference），默认开；muted 时所有 play 直接返回；
 * 3）reduced-motion 与静音无关：本文件完全不读 prefers-reduced-motion，用户不因减少动效被迫静音。
 */

type AudioContextCtor = typeof AudioContext;

let context: AudioContext | undefined;
let master: GainNode | undefined;
let noiseBuffer: AudioBuffer | undefined;
let muted = false;
const mutedListeners = new Set<() => void>();

export interface SoundLoop {
  stop: () => void;
}

function contextClass(): AudioContextCtor | undefined {
  if (typeof window === "undefined") return undefined;
  // 老 Safari 只有 webkitAudioContext；两者都没有（SSR / jsdom）时返回 undefined，调用方静默。
  const legacy = (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  return window.AudioContext ?? legacy;
}

export function isAudioSupported(): boolean {
  return Boolean(contextClass());
}

export function isAudioUnlocked(): boolean {
  return Boolean(context);
}

/** 首个用户手势调用一次：建 AudioContext 并 resume。没有 WebAudio 时返回 false，不抛、不提示。 */
export function unlockAudio(): boolean {
  const Ctor = contextClass();
  if (!Ctor) return false;
  if (!context) {
    try {
      context = new Ctor();
    } catch {
      context = undefined;
      return false;
    }
    master = context.createGain();
    master.gain.value = 1;
    master.connect(context.destination);
  }
  if (context.state === "suspended") void context.resume().catch(() => undefined);
  return true;
}

/** 可用的音频图：未解锁 / 已关闭 / 未静音之外的其它原因都返回 undefined（调用方一律静默返回）。 */
function readyGraph(): { ctx: AudioContext; out: GainNode } | undefined {
  if (!context || !master || context.state === "closed") return undefined;
  if (context.state === "suspended") void context.resume().catch(() => undefined);
  return { ctx: context, out: master };
}

/** 白噪声缓冲只建一次（0.5s，够所有噪声事件循环取样）。 */
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = Math.floor(ctx.sampleRate * 0.5);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

/** 把一个归一化事件排进音频图：振荡器/噪声 →（可选带通）→ 包络 gain → 总输出。 */
function renderTone(ctx: AudioContext, out: GainNode, tone: ResolvedTone, startAt: number): GainNode {
  const start = startAt + tone.at / 1000;
  const end = start + tone.duration / 1000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  for (const [atMs, value] of envelopePoints(tone)) gain.gain.linearRampToValueAtTime(value, start + atMs / 1000);

  let source: AudioScheduledSourceNode;
  if (tone.wave === "noise") {
    const buffer = ctx.createBufferSource();
    buffer.buffer = getNoiseBuffer(ctx);
    buffer.loop = true;
    source = buffer;
  } else {
    const oscillator = ctx.createOscillator();
    oscillator.type = tone.wave;
    oscillator.frequency.setValueAtTime(tone.freq, start);
    if (tone.to !== undefined) oscillator.frequency.exponentialRampToValueAtTime(tone.to, end);
    source = oscillator;
  }

  if (tone.wave === "noise") {
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = tone.filter ?? 1200;
    filter.Q.value = 0.9;
    source.connect(filter);
    filter.connect(gain);
  } else {
    source.connect(gain);
  }
  gain.connect(out);
  source.start(start);
  source.stop(end + 0.02);
  source.onended = () => { try { gain.disconnect(); } catch { /* 已断开：忽略 */ } };
  return gain;
}

/** 统一播放入口：静音 / 未解锁 / 未知预设时都是 no-op，绝不抛错、绝不阻塞交互。 */
export function play(name: SoundName): void {
  if (muted) return;
  const preset = getPreset(name);
  const graph = readyGraph();
  if (!preset || preset.kind !== "one-shot" || !graph) return;
  const startAt = graph.ctx.currentTime + 0.015;
  for (const event of preset.events) renderTone(graph.ctx, graph.out, resolveTone(event), startAt);
}

/** 循环音效（转瓶子的“呼呼”）：返回 stop，停止时对已排的节点做 120ms 淡出，避免硬切爆音。 */
export function startSoundLoop(name: SoundName): SoundLoop | undefined {
  if (muted) return undefined;
  const preset = getPreset(name);
  const graph = readyGraph();
  if (!preset || preset.kind !== "loop" || !graph) return undefined;
  const { ctx, out } = graph;
  const cycle = Math.max(120, preset.repeatMs ?? presetDurationMs(preset)) / 1000;
  let recent: GainNode[] = [];
  let nextAt = ctx.currentTime + 0.02;
  const schedule = () => {
    if (ctx.state === "closed") return;
    const horizon = ctx.currentTime + 0.25;
    let guard = 0;
    while (nextAt < horizon && guard < 8) {
      for (const event of preset.events) recent.push(renderTone(ctx, out, resolveTone(event), nextAt));
      nextAt += cycle;
      guard += 1;
    }
    recent = recent.slice(-16);
  };
  schedule();
  const timer = window.setInterval(schedule, 120);
  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      window.clearInterval(timer);
      if (!ctx) return;
      const now = ctx.currentTime;
      for (const gain of recent) {
        try {
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
          gain.gain.linearRampToValueAtTime(0, now + 0.12);
        } catch { /* 节点已结束：忽略 */ }
      }
      recent = [];
    },
  };
}

export function isAudioMuted(): boolean {
  return muted;
}

/** useSyncExternalStore 用：静音状态是布尔快照，订阅/取消订阅成套。 */
export function soundMutedSnapshot(): boolean {
  return muted;
}

export function subscribeAudioMuted(listener: () => void): () => void {
  mutedListeners.add(listener);
  return () => { mutedListeners.delete(listener); };
}

export function setAudioMuted(next: boolean): void {
  if (muted === next) return;
  muted = next;
  for (const listener of mutedListeners) listener();
}

/** 单测复位：清掉 Context/静音状态/订阅者，避免用例互相污染。 */
export function resetAudioState(): void {
  context = undefined;
  master = undefined;
  noiseBuffer = undefined;
  muted = false;
  mutedListeners.clear();
}
