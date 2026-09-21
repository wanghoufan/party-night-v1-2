import { describe, expect, it } from "vitest";
import { BUILTIN_GAME_PACKS, createGamePackRegistry } from "@/lib/game-packs/registry";

describe("game pack registry", () => {
  it("exposes four decoupled built-in packs", () => {
    expect(BUILTIN_GAME_PACKS).toHaveLength(4);
    expect(createGamePackRegistry().size).toBe(4);
    expect(BUILTIN_GAME_PACKS.every((pack) => pack.mixable)).toBe(true);
  });
});
