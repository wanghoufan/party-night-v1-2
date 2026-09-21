import type { HTMLAttributes } from "react";

export function NeonCard({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`neon-card ${className}`} {...props} />;
}
