import type { SessionConfig } from "@/lib/domain/schemas";

export function deriveQuickStartConfig(previous: SessionConfig | undefined, packId: string): SessionConfig | undefined {
  if (!previous || previous.players.filter((player) => player.active).length < 2 || !packId) return undefined;
  return { ...structuredClone(previous), mode: "single", enabledPackIds: [packId] };
}
