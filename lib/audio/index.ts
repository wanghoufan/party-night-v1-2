/**
 * 音效唯一入口（V1.7）：视图与页面只 import 这里的 `play(name)`，静音或未解锁时自动 no-op。
 * 现场 WebAudio 合成、无音频二进制、离线可用；reduced-motion 与静音是两件事，不联动。
 */
export { isAudioMuted, isAudioSupported, isAudioUnlocked, play, resetAudioState, setAudioMuted, soundMutedSnapshot, startSoundLoop, subscribeAudioMuted, unlockAudio } from "./engine";
export type { SoundLoop } from "./engine";
export { SOUND_NAMES, envelopeAt, envelopePoints, getPreset, isSoundName, presetDurationMs, resolveTone, resolvedTimeline, TONE_DEFAULTS } from "./presets";
export type { ResolvedTone, SoundName, SoundPreset, SoundWave, ToneEvent } from "./presets";
