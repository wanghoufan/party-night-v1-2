import { BOUNDARIES } from "@/lib/domain/constants";
import type { BoundaryProfile } from "@/lib/domain/schemas";
import { Toggle } from "@/components/ui/Toggle";

/**
 * 雷区开关行：开启（=已避开）的行加一枚「已避开」态标，开关本身只用 aria-label，不用 label 包裹
 * ——label 会把冒泡的点击再转发给控件，造成双触发旧坑。
 */
export function BoundaryList({ value, onChange }: { value: BoundaryProfile; onChange: (value: BoundaryProfile) => void }) {
  return <div className="boundary-list">{BOUNDARIES.map((item) => {
    const avoided = value[item.key];
    return <div className={`boundary-row${avoided ? " boundary-row--avoided" : ""}`} key={item.key}>
      <span className="boundary-icon" aria-hidden="true">{item.tag === "physical-contact" ? "✋" : item.tag === "alcohol" ? "🥃" : item.tag === "ex-partner" ? "💔" : "⊘"}</span>
      <span><strong>{item.label}</strong><small>{item.description}</small>{avoided && <em className="boundary-avoided">已避开</em>}</span>
      <Toggle aria-label={`禁用${item.label}`} checked={avoided} onChange={(event) => onChange({ ...value, [item.key]: event.target.checked })} />
    </div>;
  })}</div>;
}
