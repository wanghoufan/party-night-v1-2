import { defineRuleEntry } from "../types";

/**
 * 逢七过（T171）。
 * 常见版本之一，非官方规则；数字与动作可换。
 * 公开资料交叉核验（T177，2026-09-21，联网）：百度文库《逢七过、敲七、数七规则》、百度知道“数 7 游戏”条目。
 */
export const sevenPassRule = defineRuleEntry({
  id: "seven-pass",
  title: "逢七过",
  aliases: ["数七", "过七", "逢七拍手"],
  category: "no-prop",
  props: [],
  playerRange: "3 人以上",
  quickSummary: "从 1 开始轮流报数，遇到 7 的倍数或含 7 的数字要说“过”，说错或反应慢的人受罚。",
  hasHouseRules: false,
  steps: [
    { label: "起数", detail: "从 1 开始，按顺序每人报一个数。" },
    { label: "逢七", detail: "凡是 7 的倍数（7、14、21…）或数字里含 7 的（7、17、27…），不能说出数字，要拍手或喊“过”。" },
    { label: "判负", detail: "报错数字、该过没过、或明显卡顿迟疑的人受罚。" },
    { label: "重开", detail: "受罚的人从约定的数字重新起一个数，继续下一轮。" },
  ],
  variants: [
    { name: "只过 7 的倍数", detail: "有些局只要求 7 的倍数说“过”，含 7 的数字照常报，难度更低。" },
    { name: "动作分开", detail: "常见细化：含 7 的数字拍手，7 的倍数拍桌或举杯，两种动作不能混。" },
    { name: "换数字／复合规则", detail: "可把 7 换成 3、4、9 变成“逢三过”“逢九过”；也可加“逢七必过＋逢八回头”等复合规则。" },
    { name: "速度递增", detail: "有的局每过一圈就加快报数节奏，卡顿即判负。" },
  ],
});
