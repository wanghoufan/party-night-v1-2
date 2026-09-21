import { RELATIONSHIPS } from "@/lib/domain/constants";

export function RelationshipSelector({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <section className="setup-section"><h2>你们之间是什么关系？</h2><div className="choice-grid">{RELATIONSHIPS.map(([id, label]) => <button type="button" className={value === id ? "is-selected" : ""} key={id} onClick={() => onChange(id)}>{label}</button>)}</div></section>;
}
