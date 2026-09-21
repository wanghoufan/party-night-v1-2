import { defineRuleEntry } from "../types";

/**
 * King's Cup / Ring of Fire（T169）。
 * 常见版本之一：牌义属于 house rules，各地区、各酒局差异很大，不是官方标准。
 * 公开资料交叉核验（T177，2026-09-21，联网）：DrinkCountr《Kings Cup Rules: Every Card Meaning》、partyplay.games《Kings Cup Rules》。
 */
export const kingsCupRule = defineRuleEntry({
  id: "kings-cup",
  title: "King's Cup（国王杯）",
  aliases: ["Ring of Fire", "Circle of Death", "国王杯"],
  category: "cards",
  props: ["一副扑克牌", "桌中央一只大空杯", "酒水／饮料"],
  playerRange: "4–10 人",
  quickSummary: "桌中央放一只空杯，扑克摊成一圈，轮流抽牌执行牌义；抽到第 4 张 K 的人喝掉整杯。",
  hasHouseRules: true,
  steps: [
    { label: "A", detail: "瀑布：所有人开始喝，直到自己右边的人停下才能停。" },
    { label: "2", detail: "你：指定任意一人喝。" },
    { label: "3", detail: "我：抽到者自己喝。" },
    { label: "4", detail: "地板：最后一个碰到地板的人喝。" },
    { label: "5", detail: "拇指王：抽到者随时把拇指放桌上，最后一个照做的人喝；权力保留到下一张 5。" },
    { label: "6", detail: "我从来没有：玩一轮，先丢掉三根手指的人喝（部分版本改为“全场同饮”）。" },
    { label: "7", detail: "天堂：抽到者指向天花板，最后一个照做的人喝。" },
    { label: "8", detail: "伙伴：指定一位“酒友”，此后你喝他也喝，直到下一张 8 换人。" },
    { label: "9", detail: "押韵：抽到者说一个词，大家依次押韵接词，接不上的人喝。" },
    { label: "10", detail: "类别：抽到者定一个类别（车型、鸡尾酒…），依次说，接不上的人喝。" },
    { label: "J", detail: "立规矩：抽到者定一条规矩，违反的人喝，直到下一张 J 替换。" },
    { label: "Q", detail: "提问官：直到下一张 Q 出现，谁回答了抽到者的问题谁喝。" },
    { label: "K", detail: "倒进国王杯：抽到者往中央杯倒一些酒；第 4 张 K 出现时，由抽到者喝掉整杯，游戏结束。" },
  ],
  variants: [
    { name: "三种叫法", region: "欧美", detail: "Kings Cup（美）、Ring of Fire（英澳）、Circle of Death 是同一玩法的不同名字，个别牌义有出入。" },
    { name: "6 的两种口径", detail: "6 常见是“我从来没有”，也有版本直接改成“全场同饮”；9／10 的接龙主题可自由更换。" },
    { name: "规矩／酒友可叠加", detail: "有的局让每张 J 的规矩一直累加不清空，也有的 8 允许连锁指定酒友；开局前先约定。" },
    { name: "抽牌断圈与罚则", detail: "抽牌后把圈抽出缺口的人通常要喝一口，严格程度由同桌决定。" },
    { name: "无酒精版", detail: "中央杯改放饮料，或约定不喝酒的人用罚分代替；第 4 张 K 也照此执行。" },
  ],
});
