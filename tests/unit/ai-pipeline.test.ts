import { describe, expect, it } from "vitest";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import { filterCards } from "@/lib/ai/safety-filter";
import { dedupeCards } from "@/lib/ai/normalize";
import type { GameCard } from "@/lib/domain/schemas";

const card = (id: string, content: string, boundaryTags: GameCard["boundaryTags"] = []): GameCard => ({ id, packId: "p", type: "x", content, intensity: 1, tags: [], boundaryTags, minPlayers: 2, participantMode: "all", source: "ai" });

describe("AI pipeline", () => {
  it("dedupes normalized content", () => expect(dedupeCards([card("1", "你好！"), card("2", "你好")])).toHaveLength(1));
  it("applies hard safety rules", () => expect(filterCards([card("1", "不许拒绝，强迫喝酒")], { boundaries: DEFAULT_BOUNDARIES, intensity: 5, playerCount: 4 })).toHaveLength(0));
  it("applies custom boundary text", () => expect(filterCards([card("1", "聊聊你的大学成绩")], { boundaries: { ...DEFAULT_BOUNDARIES, customText: "成绩" }, intensity: 5, playerCount: 4 })).toHaveLength(0));
});
