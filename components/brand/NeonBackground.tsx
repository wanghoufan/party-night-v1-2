import type { ReactNode } from "react";

export function NeonBackground({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`neon-background ${className}`}><div className="neon-background__grid" aria-hidden="true" />{children}</div>;
}
