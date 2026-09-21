import { describe, expect, it } from "vitest";
import { selectPlayerPair, selectSinglePlayer } from "@/lib/engine/player-selector";

const players = ["a", "b", "c"].map((id) => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" }));
const round = (participants: string[]) => ({ id: crypto.randomUUID(), cardId: "c", packId: "p", participantIds: participants, status: "completed" as const, startedAt: "x", endedAt: "x" });

describe("player selector", () => {
  it("avoids the previous main player", () => expect(selectSinglePlayer(players, [round(["a"])], () => 0)?.id).toBe("b"));
  it("chooses a least-used pair", () => expect(selectPlayerPair(players, [round(["a", "b"])], () => 0)?.map((p) => p.id)).toEqual(["a", "c"]));
  it("ignores inactive players", () => expect(selectSinglePlayer(players.map((p) => p.id === "a" ? { ...p, active: false } : p), [], () => 0)?.id).toBe("b"));
});
