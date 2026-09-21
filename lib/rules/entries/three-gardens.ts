import { defineRuleEntry } from "../types";

/**
 * 逛三园（T170）。
 * 常见版本之一，非官方规则；主题与节奏可自由组合。
 * 公开资料交叉核验（T177，2026-09-21，联网）：百度知道《逛三园游戏规则》、百度文库《趣味游戏〈逛三园〉规则玩法全攻略》。
 */
export const threeGardensRule = defineRuleEntry({
  id: "three-gardens",
  title: "逛三园",
  aliases: ["逛园子", "星期天逛三园"],
  category: "no-prop",
  props: [],
  playerRange: "3 人以上",
  quickSummary: "围着“星期天逛三园”的节奏接龙，轮到谁说不出园里的东西、卡住或重复，谁就受罚。",
  hasHouseRules: false,
  steps: [
    { label: "起头", detail: "一人按节奏说“星期天”，下一人接“逛三园”，再下一人从水果园／动物园／植物园中定一个园。" },
    { label: "接龙", detail: "众人按顺序说出该园里的一种东西，如“动物园”就接老虎、大象、猴子……不能说错类别，也不能重复。" },
    { label: "判负", detail: "说错类别、重复、或明显卡住超时的人受罚，然后由他重新起头、重定一个园。" },
  ],
  variants: [
    { name: "节奏拍手版", detail: "每句配“拍桌两下＋鼓掌两下”的固定节奏，越接越快，跟不上节奏也算输。" },
    { name: "只判重复不判超时", detail: "有的局不限时，只判“重复”和“说错类别”，人多时难度更低、更好接。" },
    { name: "主题可自创", detail: "园名不限于三园，可换成菜园、汽车园、名人园等，只要同桌认一个主题即可。" },
    { name: "改词不罚酒", detail: "常见惩罚是喝酒，也可改成表演、真心话或扣分。" },
  ],
});
