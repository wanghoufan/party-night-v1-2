import type { BoundaryTag, GameCard, Intensity } from "@/lib/domain/schemas";

type Seed = [string, Intensity, string, BoundaryTag[]?];

const build = (packId: string, type: string, participantMode: GameCard["participantMode"], seeds: Seed[], minPlayers = 2): GameCard[] =>
  seeds.map(([content, intensity, instruction, boundaryTags = []], index) => ({
    id: `seed-${packId}-${index + 1}`, packId, type, content, instruction, intensity,
    tags: [], boundaryTags, minPlayers, participantMode, source: "builtin",
  }));

const truth = build("truth-dare", "truth", "single", [
  ["最近一次让你笑到停不下来的事是什么？", 1, "轮到的玩家回答"],
  ["在场谁给你的第一印象和现在差别最大？", 2, "轮到的玩家回答"],
  ["你做过最冲动但不后悔的决定是什么？", 2, "轮到的玩家回答"],
  ["说一个只有好朋友才知道的小习惯。", 3, "轮到的玩家回答"],
  ["如果能和在场一人交换一天生活，你选谁？", 2, "轮到的玩家回答"],
  ["你最容易被哪种真诚打动？", 2, "轮到的玩家回答"],
]);

const dare = build("truth-dare", "dare", "single", [
  ["用主持人的语气介绍下一位玩家。", 1, "完成后点击完成"],
  ["模仿一种大家都能猜到的动物。", 1, "让大家猜一次"],
  ["为今晚即兴想一句电影片名。", 2, "十秒内回答"],
  ["选一位玩家，和对方演一段三秒钟默契定格。", 2, "双方同意后进行", ["physical-contact"]],
  ["给通讯录里最近聊天的人发一个表情。", 4, "不愿意可无惩罚跳过", ["phone-privacy"]],
  ["把今晚的合照发到社交平台。", 4, "不愿意可无惩罚跳过", ["public-posting", "photo-video"]],
]);

const likely = build("most-likely", "vote", "all", [
  ["谁最可能临时买票去旅行？", 1, "倒数三秒，一起指向那个人"],
  ["谁最可能把冷笑话讲得很认真？", 1, "一起投票"],
  ["谁最可能在聚会结束后第一个发消息？", 2, "一起投票"],
  ["谁最可能偷偷准备惊喜？", 2, "一起投票"],
  ["谁最可能成为今晚的气氛担当？", 1, "一起投票"],
  ["谁最可能在朋友需要时第一个出现？", 2, "一起投票"],
  ["谁最可能记住所有人的生日？", 2, "一起投票"],
  ["谁最可能把陌生局变成熟人局？", 2, "一起投票"],
], 3);

const never = build("never-have", "statement", "all", [
  ["我从来没有为了吃一顿饭跨过半座城。", 1, "做过的人举手"],
  ["我从来没有在旅行出发前一晚才收行李。", 1, "做过的人举手"],
  ["我从来没有把闹钟按掉后继续睡一小时。", 1, "做过的人举手"],
  ["我从来没有因为一首歌想起某个人。", 2, "做过的人举手"],
  ["我从来没有假装看懂一部电影。", 2, "做过的人举手"],
  ["我从来没有临时改变过人生计划。", 3, "做过的人举手"],
  ["我从来没有偷偷看过朋友的手机。", 3, "做过的人举手", ["phone-privacy"]],
  ["我从来没有联系过很久没见的人。", 2, "做过的人举手"],
]);

const improv = build("ai-improv", "improv", "single", [
  ["用三个词给今晚命名。", 1, "十秒内完成"],
  ["假装你是深夜电台主播，为现场播一句开场白。", 2, "十五秒内完成"],
  ["选一件身边的物品，为它拍一段十秒广告。", 2, "不需要真的拍摄"],
  ["为下一轮设计一个不会让任何人尴尬的庆祝动作。", 2, "大家可以一起学"],
  ["把今天发生的一件小事讲成悬疑片预告。", 3, "二十秒内完成"],
  ["和另一位玩家用一句话共同编完一个故事。", 2, "每人半句"],
  ["用天气预报的方式描述今晚的气氛。", 2, "十五秒内完成"],
  ["给在场所有人颁一个有趣但友善的奖。", 3, "避免冒犯"],
]);

export const BUILTIN_SEED_CARDS: GameCard[] = [...truth, ...dare, ...likely, ...never, ...improv];
