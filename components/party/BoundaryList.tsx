import { BOUNDARIES } from "@/lib/domain/constants";
import type { BoundaryProfile } from "@/lib/domain/schemas";
import { Toggle } from "@/components/ui/Toggle";

export function BoundaryList({ value, onChange }: { value: BoundaryProfile; onChange: (value: BoundaryProfile) => void }) {
  return <div className="boundary-list">{BOUNDARIES.map((item) => <label key={item.key}><span className="boundary-icon" aria-hidden="true">{item.tag === "physical-contact" ? "✋" : item.tag === "alcohol" ? "🥃" : item.tag === "ex-partner" ? "💔" : "⊘"}</span><span><strong>{item.label}</strong><small>{item.description}</small></span><Toggle aria-label={`禁用${item.label}`} checked={value[item.key]} onChange={(event) => onChange({ ...value, [item.key]: event.target.checked })} /></label>)}</div>;
}
