"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { packIconName } from "@/components/game/pack-icon";
import type { GamePackDefinition } from "@/lib/domain/schemas";

export function PackSwitcherSheet({ open, packs, currentPackId, onSelect, onClose }: {
  open: boolean;
  packs: GamePackDefinition[];
  currentPackId: string;
  onSelect: (packId: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label="切换玩法">
        <header className="sheet__header"><h2>切换玩法</h2><p>同一局里换玩法，玩家、关系、氛围、尺度和雷区都保持不变</p></header>
        <div className="sheet__list">
          {packs.map((pack) => {
            const current = pack.id === currentPackId;
            return <button className="sheet-option" type="button" key={pack.id} aria-current={current ? "true" : undefined} disabled={current} onClick={() => onSelect(pack.id)}><Icon name={packIconName(pack.icon)} /><strong>{pack.name}</strong>{current && <span className="tag">当前</span>}</button>;
          })}
        </div>
        <Button variant="ghost" type="button" onClick={onClose}>取消</Button>
      </section>
    </div>, document.body,
  );
}
