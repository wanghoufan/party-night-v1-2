import { VIBES } from "@/lib/domain/constants";

export function VibeSelector({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  return <section className="setup-section"><h2>今晚的氛围是？</h2><div className="choice-grid">{VIBES.map(([id, label]) => <button type="button" aria-pressed={value.includes(id)} className={value.includes(id) ? "is-selected" : ""} key={id} onClick={() => onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id])}>{label}</button>)}</div></section>;
}
