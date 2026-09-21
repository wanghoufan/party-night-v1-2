import type { AIProviderProfile } from "@/lib/ai/provider";
import { Tag } from "@/components/ui/Tag";

export function ProviderSelector({ profiles, value, onChange }: { profiles: AIProviderProfile[]; value: string; onChange: (id: string) => void }) {
  return <fieldset className="provider-selector"><legend>选择提供商</legend>{profiles.map((profile) => <label key={profile.id} className={value === profile.id ? "is-selected" : ""}><input type="radio" name="provider" value={profile.id} checked={value === profile.id} onChange={() => onChange(profile.id)} /><span className="provider-selector__copy"><strong>{profile.name}</strong><small>{profile.type === "deepseek-official" ? "稳定可靠 · 推荐" : profile.type === "opencode-go" ? "面向 coding agents，兼容性可能变化" : "支持其他 OpenAI 兼容接口"}</small></span>{profile.isDefault && <Tag>默认</Tag>}{profile.experimental && <Tag>实验性</Tag>}</label>)}</fieldset>;
}
