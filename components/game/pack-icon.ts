import type { GamePackDefinition } from "@/lib/domain/schemas";

/** pack.icon 用的是玩法语义名，落到现有图标集上；认不出的一律 spark，避免出现空白图标。 */
const ICON_NAMES: Record<string, "heart" | "users" | "glass" | "bottle" | "point" | "spark"> = {
  heart: "heart", people: "users", users: "users", glass: "glass", bottle: "bottle", point: "point", spark: "spark",
};

export function packIconName(icon: GamePackDefinition["icon"]): "heart" | "users" | "glass" | "bottle" | "point" | "spark" {
  return ICON_NAMES[icon] ?? "spark";
}
