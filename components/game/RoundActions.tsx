import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

export function RoundActions({ onComplete, onSwap, onSkip }: { onComplete: () => void; onSwap: () => void; onSkip: () => void }) {
  return <div className="round-actions"><Button className="round-action--complete" type="button" onClick={onComplete}><Icon name="check" />完成</Button><Button variant="secondary" type="button" onClick={onSwap}><Icon name="refresh" />换一个</Button><Button className="round-action--skip" variant="secondary" type="button" onClick={onSkip}><Icon name="skip" />跳过</Button></div>;
}
