import { describe, expect, it } from "vitest";
import { gamePackRepository } from "@/lib/storage/game-pack-repository";
import type { CustomGamePack } from "@/lib/domain/schemas";

describe("custom pack repository", () => {
  it("creates, updates and deletes local packs", async () => {
    const id = `custom-test-${crypto.randomUUID()}`;
    const pack: CustomGamePack = { schemaVersion: 1, definition: { id, name: "测试包", icon: "🎲", enabledByDefault: true, mixable: true, minPlayers: 2, supportedCardTypes: ["custom"], weight: 1, source: "custom" }, cards: [], enabled: true, updatedAt: new Date().toISOString() };
    await gamePackRepository.save(pack);
    expect((await gamePackRepository.get(id))?.definition.name).toBe("测试包");
    await gamePackRepository.save({ ...pack, definition: { ...pack.definition, name: "已更新" } });
    expect((await gamePackRepository.get(id))?.definition.name).toBe("已更新");
    await gamePackRepository.delete(id);
    expect(await gamePackRepository.get(id)).toBeUndefined();
  });
});
