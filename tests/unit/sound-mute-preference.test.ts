import { afterEach, describe, expect, it } from "vitest";
import { isAudioMuted, resetAudioState, setAudioMuted } from "@/lib/audio/engine";
import { SOUND_MUTED_DEFAULT, hydrateSoundPreference, loadSoundMuted, saveSoundMuted } from "@/lib/audio/mute-preference";
import { getDb } from "@/lib/storage/db";

/**
 * 音效总静音偏好（V1.7）：复用 preferences 表、默认开（未静音）、只写自己那一个字段。
 */

afterEach(async () => {
  const db = await getDb();
  await db.clear("preferences");
  resetAudioState();
});

describe("音效静音偏好", () => {
  it("没有记录时默认开（未静音）", async () => {
    expect(SOUND_MUTED_DEFAULT).toBe(false);
    expect(await loadSoundMuted()).toBe(false);
  });

  it("写入后能读回，且不覆盖偏好里的其他字段", async () => {
    const db = await getDb();
    await db.put("preferences", {
      id: "main",
      recentPlayers: [{ id: "p1", displayName: "Alex", active: true, createdAt: "x", lastUsedAt: "x" }],
      activeProviderId: "deepseek",
      disabledPackIds: ["never-have"],
      updatedAt: "x",
    });

    await saveSoundMuted(true);

    expect(await loadSoundMuted()).toBe(true);
    const preference = await db.get("preferences", "main");
    expect(preference?.activeProviderId).toBe("deepseek");
    expect(preference?.disabledPackIds).toEqual(["never-have"]);
    expect(preference?.recentPlayers).toHaveLength(1);
    expect(preference?.soundMuted).toBe(true);
  });

  it("再打开（取消静音）会把 false 真正落库，不是删字段", async () => {
    await saveSoundMuted(true);
    await saveSoundMuted(false);

    expect(await loadSoundMuted()).toBe(false);
    const db = await getDb();
    expect((await db.get("preferences", "main"))?.soundMuted).toBe(false);
  });

  it("hydrate 把偏好灌进引擎：默认开不静音，已静音则引擎也静音", async () => {
    expect(await hydrateSoundPreference()).toBe(false);
    expect(isAudioMuted()).toBe(false);

    await saveSoundMuted(true);
    setAudioMuted(false);
    expect(await hydrateSoundPreference()).toBe(true);
    expect(isAudioMuted()).toBe(true);
  });
});
