import { INTENSITIES } from "@/lib/domain/constants";
import type { Intensity } from "@/lib/domain/schemas";
import { Slider } from "@/components/ui/Slider";

export function IntensitySelector({ value, onChange }: { value: Intensity; onChange: (value: Intensity) => void }) {
  return <section className="setup-section"><h2>游戏尺度</h2><Slider min={1} max={5} step={1} value={value} aria-label="游戏强度" onChange={(event) => onChange(Number(event.target.value) as Intensity)} /><div className="intensity-label"><span>安全</span><strong>{value} · {INTENSITIES.find((item) => item.value === value)?.label}</strong><span>高能</span></div></section>;
}
