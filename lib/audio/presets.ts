/**
 * 音效预设表（V1.7 音效）：全部是**数据**，不含任何音频二进制，引擎按数据现场合成，离线可用。
 * 这里只放纯计算（归一化、包络、总时长、查表），不碰 AudioContext，方便单测与复用。
 */

/** 波形：正弦/方波/锯齿/三角 + 白噪声（“唰”“呼呼”这类摩擦音）。 */
export type SoundWave = "sine" | "square" | "sawtooth" | "triangle" | "noise";

/** 预设里的单个音事件（归一化前；at/duration 单位毫秒，均相对预设起点）。 */
export interface ToneEvent {
  at: number;
  duration: number;
  /** 起始频率（Hz）；noise 波形不用。 */
  freq?: number;
  /** 扫频终点：给了就从 freq 滑到 to（升调/降调/下沉/上扬都靠它）。 */
  to?: number;
  wave?: SoundWave;
  /** 峰值音量（0–1，相对总输出）。 */
  gain?: number;
  /** 起音时长（毫秒），默认 8：太短会有咔哒声。 */
  attack?: number;
  /** 释音时长（毫秒），默认把起音后的剩余时长全部用来衰减（自然收尾）。 */
  release?: number;
  /** 噪声事件的带通中心频率（Hz）。 */
  filter?: number;
}

export interface SoundPreset {
  /** one-shot＝播一次；loop＝按 repeatMs 反复（转瓶子的“呼呼”底噪）。 */
  kind: "one-shot" | "loop";
  /** 循环周期（毫秒）；不填则用 events 的总时长。 */
  repeatMs?: number;
  events: ToneEvent[];
}

/** 归一化后的事件：可选字段全部补齐，值域钳死（纯函数，引擎与单测共用同一套口径）。 */
export interface ResolvedTone {
  at: number;
  duration: number;
  freq: number;
  to?: number;
  wave: SoundWave;
  gain: number;
  attack: number;
  release: number;
  filter?: number;
}

/** 缺省值：中等音量、极短起音；意外数值不写进表也不会“炸响”。 */
export const TONE_DEFAULTS = { wave: "sine" as SoundWave, gain: 0.18, attack: 8, freq: 440, minDuration: 1 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 把表里的写法补成确定值：时长有下限、起音+释音不会超过总时长。 */
export function resolveTone(event: ToneEvent): ResolvedTone {
  const duration = Math.max(TONE_DEFAULTS.minDuration, event.duration);
  const attack = clamp(event.attack ?? TONE_DEFAULTS.attack, 0, duration);
  const release = clamp(event.release ?? duration - attack, 0, duration - attack);
  return {
    at: Math.max(0, event.at),
    duration,
    freq: event.freq ?? TONE_DEFAULTS.freq,
    wave: event.wave ?? TONE_DEFAULTS.wave,
    gain: clamp(event.gain ?? TONE_DEFAULTS.gain, 0, 1),
    attack,
    release,
    ...(event.to !== undefined ? { to: clamp(event.to, 1, 20000) } : {}),
    ...(event.filter !== undefined ? { filter: clamp(event.filter, 20, 20000) } : {}),
  };
}

/**
 * 音量包络折线（时间单位毫秒、相对事件起点；值是绝对增益）。
 * 起音线性拉到峰值 → 保持 → 释音线性归零；首尾一定落在 0，避免爆音。
 */
export function envelopePoints(tone: ResolvedTone): Array<[number, number]> {
  const points: Array<[number, number]> = tone.attack > 0 ? [[0, 0], [tone.attack, tone.gain]] : [[0, tone.gain]];
  const sustainEnd = tone.duration - tone.release;
  if (sustainEnd > tone.attack) points.push([sustainEnd, tone.gain]);
  points.push([tone.duration, 0]);
  return points;
}

/** 包络折线上的取值（纯查表）：用于单测断言形状，也保证引擎与断言口径一致。 */
export function envelopeAt(tone: ResolvedTone, atMs: number): number {
  const points = envelopePoints(tone);
  if (atMs <= 0) return 0;
  for (let index = 1; index < points.length; index += 1) {
    const [endAt, endValue] = points[index]!;
    const [startAt, startValue] = points[index - 1]!;
    if (atMs <= endAt) return endAt === startAt ? endValue : startValue + ((endValue - startValue) * (atMs - startAt)) / (endAt - startAt);
  }
  return 0;
}

/** 预设总时长（毫秒）：最后一个事件结束的时刻。 */
export function presetDurationMs(preset: SoundPreset): number {
  return preset.events.reduce((total, event) => Math.max(total, resolveTone(event).at + resolveTone(event).duration), 0);
}

/** 按时间排序的归一化事件序列：引擎调度顺序稳定，测试可读。 */
export function resolvedTimeline(preset: SoundPreset): ResolvedTone[] {
  return preset.events.map(resolveTone).sort((a, b) => a.at - b.at);
}

const tone = (at: number, duration: number, freq: number, overrides: Partial<ToneEvent> = {}): ToneEvent => ({ at, duration, freq, ...overrides });
const noise = (at: number, duration: number, filter: number, overrides: Partial<ToneEvent> = {}): ToneEvent => ({ at, duration, wave: "noise", filter, gain: 0.1, ...overrides });

/**
 * 全表预设（V1.7 用户已批：全量音效、无背景乐）。命名即语义，视图只按名字埋点：
 * 首页/组局 → tap、start-whistle；AI 生成 → generate-tick/generate-done；主局 → deal/complete/swap/skip/pack-switch；
 * 二选一与指人 → countdown-tick/countdown-go；转瓶子 → spin-whoosh/spin-tick/spin-land；链入 → chain-enter；
 * 默契 → compat-same/compat-different；随机启动器 → launcher-suspense/launcher-reveal；工具 → tool-pick/tool-groups；
 * 暂停组 → pause/resume/finish-chord；总结 → fanfare。
 */
export const PRESETS = {
  /** 首页/组局按钮的轻点反馈。 */
  "tap": { kind: "one-shot", events: [tone(0, 90, 880, { to: 660, gain: 0.16 })] },
  /** 开局哨：一声上扬的长哨，用在真正“开局”的那一刻（直接开始 / 下一步生成）。 */
  "start-whistle": { kind: "one-shot", events: [tone(0, 420, 900, { to: 1800, gain: 0.2, attack: 20, release: 220 }), tone(60, 320, 1800, { gain: 0.08, release: 260 })] },
  /** AI 生成每一步推进的 tick。 */
  "generate-tick": { kind: "one-shot", events: [tone(0, 70, 520, { gain: 0.12 })] },
  /** AI 生成完成的叮。 */
  "generate-done": { kind: "one-shot", events: [tone(0, 120, 880, { gain: 0.18 }), tone(90, 260, 1320, { gain: 0.16, release: 200 })] },
  /** 每一轮出题的翻牌声。 */
  "deal": { kind: "one-shot", events: [noise(0, 180, 2600, { gain: 0.12, release: 150 }), tone(40, 70, 660, { gain: 0.1 })] },
  /** 完成本轮的叮。 */
  "complete": { kind: "one-shot", events: [tone(0, 140, 1046, { gain: 0.2 }), tone(80, 300, 1568, { gain: 0.16, release: 240 })] },
  /** 换一个：短促的“唰”。 */
  "swap": { kind: "one-shot", events: [noise(0, 150, 3400, { gain: 0.11, release: 120 })] },
  /** 跳过：下沉音（明确表示这一轮轻轻略过）。 */
  "skip": { kind: "one-shot", events: [tone(0, 230, 440, { to: 200, gain: 0.16, release: 180 })] },
  /** 切换玩法：先唰再上滑。 */
  "pack-switch": { kind: "one-shot", events: [noise(0, 200, 3000, { gain: 0.12, release: 170 }), tone(40, 170, 620, { to: 1180, gain: 0.12, release: 130 })] },
  /** 倒数“滴”。 */
  "countdown-tick": { kind: "one-shot", events: [tone(0, 80, 1180, { gain: 0.14, wave: "square" })] },
  /** 倒数定音（“一起指 / 一起说”）。 */
  "countdown-go": { kind: "one-shot", events: [tone(0, 300, 1760, { gain: 0.2, release: 240 }), tone(60, 220, 1318, { gain: 0.12, release: 180 })] },
  /** 转瓶子开始转的“呼呼”（循环底噪）。 */
  "spin-whoosh": { kind: "loop", repeatMs: 360, events: [noise(0, 320, 900, { gain: 0.075, attack: 40, release: 280 }), tone(0, 320, 240, { to: 180, gain: 0.04, attack: 40, release: 280, wave: "triangle" })] },
  /** 转中减速的 tick（越转越慢靠播报间隔变长表达）。 */
  "spin-tick": { kind: "one-shot", events: [tone(0, 55, 900, { gain: 0.1, wave: "square" })] },
  /** 转瓶子落定的叮。 */
  "spin-land": { kind: "one-shot", events: [tone(0, 160, 1318, { gain: 0.2 }), tone(100, 340, 1760, { gain: 0.15, release: 280 })] },
  /** 链入真心话/大冒险的跳转音。 */
  "chain-enter": { kind: "one-shot", events: [tone(0, 200, 700, { to: 1400, gain: 0.16, release: 150 }), tone(150, 140, 1046, { gain: 0.12 })] },
  /** 默契「一样」：两声上行。 */
  "compat-same": { kind: "one-shot", events: [tone(0, 140, 784, { gain: 0.18 }), tone(150, 260, 1046, { gain: 0.17, release: 200 })] },
  /** 默契「不一样」：两声下行。 */
  "compat-different": { kind: "one-shot", events: [tone(0, 140, 660, { gain: 0.18 }), tone(150, 260, 440, { gain: 0.16, release: 200 })] },
  /** 随机启动器悬念：一段抖动的不确定音。 */
  "launcher-suspense": { kind: "one-shot", events: [tone(0, 520, 420, { to: 640, gain: 0.12, attack: 60, release: 380, wave: "triangle" }), tone(120, 380, 315, { to: 480, gain: 0.07, attack: 60, release: 300 })] },
  /** 随机启动器揭晓：三音上行。 */
  "launcher-reveal": { kind: "one-shot", events: [tone(0, 130, 659, { gain: 0.17 }), tone(120, 130, 880, { gain: 0.17 }), tone(240, 320, 1174, { gain: 0.17, release: 260 })] },
  /** 随机点名（小版）。 */
  "tool-pick": { kind: "one-shot", events: [tone(0, 100, 988, { gain: 0.15 }), tone(110, 200, 1319, { gain: 0.14, release: 160 })] },
  /** 随机分组（小版）。 */
  "tool-groups": { kind: "one-shot", events: [tone(0, 90, 523, { gain: 0.14 }), tone(90, 90, 659, { gain: 0.14 }), tone(180, 200, 784, { gain: 0.14, release: 160 })] },
  /** 暂停：下沉。 */
  "pause": { kind: "one-shot", events: [tone(0, 220, 620, { to: 300, gain: 0.16, release: 170 })] },
  /** 继续：上扬。 */
  "resume": { kind: "one-shot", events: [tone(0, 220, 300, { to: 620, gain: 0.16, release: 170 })] },
  /** 结束本局：收尾和弦。 */
  "finish-chord": { kind: "one-shot", events: [tone(0, 480, 523, { gain: 0.13, attack: 20, release: 400 }), tone(0, 480, 659, { gain: 0.12, attack: 20, release: 400 }), tone(0, 480, 784, { gain: 0.12, attack: 20, release: 400 })] },
  /** 总结页 fanfare。 */
  "fanfare": { kind: "one-shot", events: [tone(0, 150, 523, { gain: 0.16, wave: "triangle" }), tone(150, 150, 659, { gain: 0.16, wave: "triangle" }), tone(300, 150, 784, { gain: 0.16, wave: "triangle" }), tone(450, 520, 1046, { gain: 0.18, attack: 16, release: 440 }), tone(450, 520, 1318, { gain: 0.12, attack: 16, release: 440 })] },
} satisfies Record<string, SoundPreset>;

/** 预设名＝埋点用的唯一键（视图里只出现这些字符串）。 */
export type SoundName = keyof typeof PRESETS;

export const SOUND_NAMES = Object.keys(PRESETS) as SoundName[];

export function getPreset(name: SoundName): SoundPreset | undefined {
  return PRESETS[name];
}

export function isSoundName(value: string): value is SoundName {
  return Object.prototype.hasOwnProperty.call(PRESETS, value);
}
