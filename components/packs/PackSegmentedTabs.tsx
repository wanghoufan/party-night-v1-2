"use client";

export type PacksTabId = "packs" | "rules";

const TABS: ReadonlyArray<{ id: PacksTabId; label: string }> = [
  { id: "packs", label: "玩法" },
  { id: "rules", label: "规则" },
];

/**
 * “我的游戏包”页内二级分区（T163 / US8 / FR-029）：默认仍是玩法，
 * 规则是同一页面的轻量切换，不动底部导航、不新增 Tab。
 */
export function PackSegmentedTabs({ value, onChange }: { value: PacksTabId; onChange: (tab: PacksTabId) => void }) {
  return (
    <div className="pack-segments">
      {TABS.map((tab) => (
        <button key={tab.id} type="button" aria-pressed={value === tab.id} onClick={() => { if (tab.id !== value) onChange(tab.id); }}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
