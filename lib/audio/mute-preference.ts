import { preferencesRepository } from "@/lib/storage/preferences-repository";
import { setAudioMuted } from "./engine";

/**
 * 音效总静音的持久化（V1.7）：复用既有 preferences 表（不新增第二套存储），默认**开**（未静音）。
 * 只读写 soundMuted 一个字段，其余偏好原样保留（preferencesRepository.save 是合并写）。
 */

export const SOUND_MUTED_DEFAULT = false;

export async function loadSoundMuted(): Promise<boolean> {
  return (await preferencesRepository.get()).soundMuted ?? SOUND_MUTED_DEFAULT;
}

export async function saveSoundMuted(muted: boolean): Promise<void> {
  const current = await preferencesRepository.get();
  await preferencesRepository.save({ recentPlayers: current.recentPlayers, soundMuted: muted });
}

/** 启动时把持久化偏好灌进引擎（App 挂载一次）：读失败就当默认开，不影响其它功能。 */
export async function hydrateSoundPreference(): Promise<boolean> {
  const muted = await loadSoundMuted();
  setAudioMuted(muted);
  return muted;
}
