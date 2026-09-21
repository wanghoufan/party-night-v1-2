import { describe, expect, it } from "vitest";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { GameCard, Player, SessionConfig } from "@/lib/domain/schemas";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import { MAX_RECENT_REJECTIONS, cardFingerprint, isRecentlyRejected, normalizeCardText, recordRejection, selectCard } from "@/lib/engine/card-selector";
import { createSession, startRound, swapRound } from "@/lib/engine/session-engine";

const card = (id: string, content: string): GameCard => ({
  id, packId: "truth-dare", type: "truth", content, intensity: 1, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "single", source: "builtin",
});

const base = {
  usedCardIds: [] as string[], enabledPackIds: ["truth-dare"], playerCount: 4, intensity: 3 as const,
  boundaries: { ...DEFAULT_BOUNDARIES, noAlcoholPenalty: false }, random: () => 0,
};

describe("rejection fingerprints", () => {
  it("normalises case, spacing, punctuation and fullwidth text", () => {
    expect(normalizeCardText("  谁最可能，临时买票去旅行？ ")).toBe(normalizeCardText("谁最可能临时买票去旅行"));
    expect(normalizeCardText("Let's   GO")).toBe(normalizeCardText("lets go"));
    expect(normalizeCardText("ＡＢＣ１２３")).toBe(normalizeCardText("abc123"));
  });

  it("fingerprints the same text identically and different text differently", () => {
    expect(cardFingerprint(card("a", "谁最可能去旅行"))).toBe(cardFingerprint(card("b", "谁最可能去旅行？")));
    expect(cardFingerprint(card("a", "谁最可能去旅行"))).not.toBe(cardFingerprint(card("b", "我从来没有假装看懂一部电影")));
  });

  it("flags exact and near-identical normalised text, but not unrelated text", () => {
    const rejected = [cardFingerprint(card("a", "谁最可能临时买票去旅行？"))];
    expect(isRecentlyRejected(card("b", "谁最可能临时买票去旅行"), rejected)).toBe(true);
    expect(isRecentlyRejected(card("c", "谁最可能临时买票去旅行啊"), rejected)).toBe(true);
    expect(isRecentlyRejected(card("d", "我从来没有假装看懂一部电影"), rejected)).toBe(false);
    expect(isRecentlyRejected(card("e", "谁最可能"), rejected)).toBe(false);
  });

  it("keeps the newest rejections and never repeats a fingerprint in the list", () => {
    let fingerprints = recordRejection([], card("a", "题目甲"));
    fingerprints = recordRejection(fingerprints, card("b", "题目乙"));
    expect(fingerprints).toHaveLength(2);
    expect(fingerprints.at(-1)).toBe(cardFingerprint(card("b", "题目乙")));

    fingerprints = recordRejection(fingerprints, card("c", "题目甲！"));
    expect(fingerprints).toEqual([cardFingerprint(card("b", "题目乙")), cardFingerprint(card("a", "题目甲"))]);
  });

  it("caps the stored history", () => {
    const cards = Array.from({ length: MAX_RECENT_REJECTIONS + 5 }, (_, index) => card(String(index), `题目${index}`));
    const fingerprints = cards.reduce<string[]>((list, item) => recordRejection(list, item), []);
    expect(fingerprints).toHaveLength(MAX_RECENT_REJECTIONS);
    expect(fingerprints.at(-1)).toBe(cardFingerprint(cards.at(-1)!));
    expect(fingerprints).not.toContain(cardFingerprint(cards[0]!));
  });

  it("ignores content that normalises to nothing", () => {
    expect(normalizeCardText("！！！  ")).toBe("");
    expect(recordRejection([], card("a", "！！！"))).toEqual([]);
    expect(isRecentlyRejected(card("a", "……"), ["", cardFingerprint(card("b", "题目甲"))])).toBe(false);
  });

  it("skips recently rejected cards while one still fits", () => {
    const picked = selectCard({
      ...base,
      cards: [card("a", "谁最可能临时买票去旅行？"), card("b", "谁最可能偷偷准备惊喜")],
      recentRejectedFingerprints: [cardFingerprint(card("a", "谁最可能临时买票去旅行"))],
    });
    expect(picked?.id).toBe("b");
  });

  it("still deals a rejected card when nothing else is playable", () => {
    const picked = selectCard({
      ...base,
      cards: [card("a", "谁最可能临时买票去旅行？")],
      recentRejectedFingerprints: [cardFingerprint(card("a", "谁最可能临时买票去旅行"))],
    });
    expect(picked?.id).toBe("a");
  });

  it("records a swapped card so the next deal avoids its text", () => {
    const config: SessionConfig = {
      players: ["a", "b", "c"].map((id): Player => ({ id, displayName: id, active: true, createdAt: "x", lastUsedAt: "x" })),
      relationship: "friends", vibes: ["funny"], intensity: 3, boundaries: DEFAULT_BOUNDARIES,
      enabledPackIds: ["truth-dare"], mode: "single",
    };
    const session = startRound(createSession(config, BUILTIN_SEED_CARDS), () => 0);
    const content = session.deckSnapshot.find((item) => item.id === session.currentRound?.cardId)!.content;

    const swapped = swapRound(session);

    expect(swapped.recentRejectedFingerprints).toContain(cardFingerprint({ content }));
    expect(swapped.recentRejectedFingerprints?.length).toBe(1);
  });
});
