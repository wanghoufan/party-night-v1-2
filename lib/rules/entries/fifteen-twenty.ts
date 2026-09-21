import { defineRuleEntry } from "../types";

/**
 * 十五二十（T172）。
 * 常见版本之一，非官方规则；口令与节拍各地不同。
 * 公开资料交叉核验（T177，2026-09-21，联网）：搜狐《深度解码十五二十》、百度文库《十五二十猜拳怎么玩》。
 */
export const fifteenTwentyRule = defineRuleEntry({
  id: "fifteen-twenty",
  title: "十五二十",
  aliases: ["十五二十拳", "猜拳十五二十"],
  category: "gesture",
  props: [],
  playerRange: "2 人（人多可轮流对战）",
  quickSummary: "两人同时出拳并各报一个数（0／5／10／15／20），报中双方手指总数的人赢，输的人受罚。",
  hasHouseRules: false,
  steps: [
    { label: "定手势", detail: "每人伸出双手：握拳算 0，伸一只手算 5，双手都伸算 10。" },
    { label: "喊数", detail: "出手的同时，双方各喊 0、5、10、15、20 中的一个，代表猜测两人的手指总数。" },
    { label: "比总数", detail: "亮手后统计两人手指之和（0–20）：只有一人喊中则他获胜，另一人受罚。" },
    { label: "平局重开", detail: "两人都喊中算平局，重来一轮；都没喊中则继续下一轮。" },
  ],
  variants: [
    { name: "多人对战", detail: "人多时两两配对淘汰，或围圈轮流指定对手，赢家守擂、输家受罚后换人。" },
    { name: "只喊五个数", detail: "严格版只准喊 0、5、10、15、20；也有版本只玩单手，喊 0、5、10。" },
    { name: "口令与节奏", region: "各地", detail: "开局常齐喊“十五二十”，之后每轮的口令、节拍各地不同，需同桌统一。" },
    { name: "无酒精版", detail: "把罚酒换成积分、俯卧撑或真心话，判定胜负的方式不变。" },
  ],
});
