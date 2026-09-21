"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";

const items = [
  ["/", "home", "首页"], ["/setup", "users", "组局"], ["/packs", "cube", "游戏包"], ["/settings/ai", "settings", "设置"],
] as const;

export function BottomTabBar() {
  const pathname = usePathname();
  const isActive = (href: string) => href === "/" ? pathname === "/" : href === "/setup" ? pathname === "/setup" || pathname === "/boundaries" : pathname.startsWith(href);
  return <nav className="bottom-tabs" aria-label="主导航">{items.map(([href, icon, label]) => <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}><Icon name={icon} /><span>{label}</span></Link>)}</nav>;
}
