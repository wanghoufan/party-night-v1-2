import { Icon } from "@/components/ui/Icon";

export function RoundHeader({ current, planned, onSettings }: { current: number; planned: number; onSettings: () => void }) {
  return <header className="round-header"><span>第 {current} / {planned} 轮</span><button type="button" aria-label="打开局中设置" onClick={onSettings}><Icon name="settings" /></button></header>;
}
