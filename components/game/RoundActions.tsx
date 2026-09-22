import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

export interface RoundActionsProps {
  onComplete: () => void;
  onSwap: () => void;
  /** 不传则不渲染“跳过”：二选一/指人这类玩法只保留一主一辅，避免抢主按钮。 */
  onSkip?: () => void;
  /** 主按钮文案；不同玩法对“推进本轮”的叫法不同（二选一＝下一题）。 */
  completeLabel?: string;
  /** 只有主按钮＋弱按钮时用的两列布局。 */
  compact?: boolean;
  /** 局中暂停时整套推进动作禁用（V1.5 暂停禁用矩阵：暂停冻结现场，不能偷偷推进一轮）。 */
  disabled?: boolean;
}

export function RoundActions({ onComplete, onSwap, onSkip, completeLabel = "完成", compact = false, disabled = false }: RoundActionsProps) {
  return <div className={`round-actions ${compact && !onSkip ? "round-actions--compact" : ""}`}><Button className="round-action--complete" type="button" disabled={disabled} onClick={onComplete}><Icon name="check" />{completeLabel}</Button><Button variant="secondary" type="button" disabled={disabled} onClick={onSwap}><Icon name="refresh" />换一个</Button>{onSkip && <Button className="round-action--skip" variant="secondary" type="button" disabled={disabled} onClick={onSkip}><Icon name="skip" />跳过</Button>}</div>;
}
