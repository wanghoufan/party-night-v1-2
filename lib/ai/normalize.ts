import type { GameCard } from "@/lib/domain/schemas";

export function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function normalizedCardFingerprint(card: Pick<GameCard, "content" | "packId">): string {
  return `${card.packId}:${normalizeText(card.content).toLocaleLowerCase("zh-CN").replace(/[，。！？、,.!?\s]/g, "")}`;
}

export function dedupeCards(cards: GameCard[]): GameCard[] {
  const seenIds = new Set<string>();
  const seenContent = new Set<string>();
  return cards.filter((card) => {
    const fingerprint = normalizedCardFingerprint(card);
    if (seenIds.has(card.id) || seenContent.has(fingerprint)) return false;
    seenIds.add(card.id);
    seenContent.add(fingerprint);
    return true;
  });
}
