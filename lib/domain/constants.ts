import type { BoundaryTag, Intensity } from "./schemas";

export const RELATIONSHIPS = [
  ["first-meet", "第一次见 / 拼桌"],
  ["new", "刚认识"],
  ["friends", "普通朋友"],
  ["familiar", "熟人局"],
  ["close", "很熟"],
  ["couple", "情侣 / 暧昧"],
] as const;

export const VIBES = [
  ["icebreaker", "破冰"],
  ["funny", "搞笑"],
  ["flirty", "暧昧"],
  ["wild", "放开玩"],
  ["random", "随机"],
] as const;

export const INTENSITIES: ReadonlyArray<{ value: Intensity; label: string }> = [
  { value: 1, label: "安全破冰" },
  { value: 2, label: "熟悉起来" },
  { value: 3, label: "有点刺激" },
  { value: 4, label: "明显暧昧" },
  { value: 5, label: "高能但有边界" },
];

export const BOUNDARIES: ReadonlyArray<{
  key: keyof Omit<import("./schemas").BoundaryProfile, "customText">;
  tag: BoundaryTag;
  label: string;
  description: string;
}> = [
  { key: "noPhysicalContact", tag: "physical-contact", label: "身体接触", description: "如拥抱、触碰等" },
  { key: "noAlcoholPenalty", tag: "alcohol", label: "喝酒惩罚", description: "如罚酒、劝酒等" },
  { key: "noExPartners", tag: "ex-partner", label: "前任相关", description: "旧感情与前任话题" },
  { key: "noSexualHistory", tag: "sexual-history", label: "性 / 两性经历", description: "亲密经历类话题" },
  { key: "noMoneyIncome", tag: "money", label: "收入 / 财富", description: "薪资与资产问题" },
  { key: "noPhonePrivacy", tag: "phone-privacy", label: "手机隐私", description: "查看相册或聊天" },
  { key: "noPublicPosting", tag: "public-posting", label: "公开发布", description: "发朋友圈或动态" },
  { key: "noStrangerContact", tag: "stranger-contact", label: "联系陌生人", description: "给陌生人发消息" },
  { key: "noPhotoVideo", tag: "photo-video", label: "拍照 / 视频", description: "录制或拍摄内容" },
  { key: "noSocialAccounts", tag: "social-account", label: "社交账号", description: "关注或公开账号" },
];

export const DEFAULT_BOUNDARIES = {
  noPhysicalContact: false,
  noAlcoholPenalty: true,
  noExPartners: false,
  noSexualHistory: false,
  noMoneyIncome: false,
  noPhonePrivacy: true,
  noPublicPosting: true,
  noStrangerContact: true,
  noPhotoVideo: false,
  noSocialAccounts: false,
  customText: "",
} as const;

export const BUILTIN_PACK_IDS = ["truth-dare", "most-likely", "never-have", "ai-improv"] as const;
