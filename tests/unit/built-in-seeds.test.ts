import { describe, expect, it } from "vitest";
import { boundaryTagSchema, gameCardSchema, type GameCard, type Intensity } from "@/lib/domain/schemas";
import { isHardBlocked } from "@/lib/ai/safety-filter";
import { BUILTIN_SEED_CARDS, SEED_INSIGHT_POSITIONS, SEED_INTENSITY_PATTERN } from "@/lib/game-packs/built-in-seeds";
import { RANDOM_LAUNCHER_PACK_ID } from "@/lib/game-packs/random-launcher";

/** 需要可离线 seed 的 AI 玩法（转瓶子纯本地，按 Plan 7.1 不配 seed）。 */
const SEEDED_PACKS: Array<{ packId: string; type: string }> = [
  { packId: "would-you-rather", type: "would-you-rather" },
  { packId: "pointing-game", type: "pointing" },
  { packId: "compatibility-test", type: "compatibility" },
];

/** 7 类题卡：packId + type（真心话/大冒险同属 truth-dare，是两类）。 */
const CARD_TYPES: Array<{ packId: string; type: string }> = [
  { packId: "truth-dare", type: "truth" },
  { packId: "truth-dare", type: "dare" },
  { packId: "most-likely", type: "vote" },
  { packId: "never-have", type: "statement" },
  { packId: "would-you-rather", type: "would-you-rather" },
  { packId: "pointing-game", type: "pointing" },
  { packId: "compatibility-test", type: "compatibility" },
];

const seedsOf = (packId: string) => BUILTIN_SEED_CARDS.filter((card) => card.packId === packId);
const typeOf = (packId: string, type: string) => BUILTIN_SEED_CARDS.filter((card) => card.packId === packId && card.type === type);

describe("built-in offline seeds", () => {
  it("keeps every seed a schema-valid builtin card", () => {
    for (const card of BUILTIN_SEED_CARDS) {
      expect(gameCardSchema.safeParse(card).success).toBe(true);
      expect(card.source).toBe("builtin");
    }
  });

  it("ships the V1.6 终稿：7 类 × 50 = 350 张", () => {
    expect(BUILTIN_SEED_CARDS).toHaveLength(350);
    for (const { packId, type } of CARD_TYPES) {
      const cards = typeOf(packId, type);
      expect(cards, `${packId}/${type}`).toHaveLength(50);
      expect(cards.every((card) => card.type === type)).toBe(true);
      expect(new Set(cards.map((card) => card.id)).size).toBe(50);
      // id 沿用 seed-<pack>-<type>-N 到 50
      expect(cards.map((card) => card.id)).toEqual(
        Array.from({ length: 50 }, (_, index) => `seed-${packId}-${type}-${index + 1}`),
      );
    }
  });

  it("gives the three AI packs offline seeds with their own card type and unique ids", () => {
    for (const { packId, type } of SEEDED_PACKS) {
      const cards = seedsOf(packId);
      expect(cards.length).toBeGreaterThanOrEqual(4);
      expect(cards.every((card) => card.type === type)).toBe(true);
      expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
    }
  });

  it("keeps the same globally unique id across every seed, even when a pack has several card types", () => {
    // 真心话/大冒险同属 truth-dare 却分属两个 type：id 撞车会让按 id 查卡串到另一类型的题面。
    const ids = BUILTIN_SEED_CARDS.map((card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(typeOf("truth-dare", "truth")).toHaveLength(50);
    expect(typeOf("truth-dare", "dare")).toHaveLength(50);
  });

  /** 08 新题纲 §7.1/§7.2：每类 互动 35／了解 15／看戏 0，且 4–5 档 35／1–3 档 15。 */
  it("hits the 70/30/0 生态比与 70/30 强度比 per card type", () => {
    for (const { packId, type } of CARD_TYPES) {
      const cards = typeOf(packId, type);
      const marks = cards.map((card) => card.tags[0]);
      expect(marks.filter((mark) => mark === "互动"), `${packId}/${type} 互动`).toHaveLength(35);
      expect(marks.filter((mark) => mark === "了解"), `${packId}/${type} 了解`).toHaveLength(15);
      expect(marks.filter((mark) => mark === "看戏"), `${packId}/${type} 看戏`).toHaveLength(0);
      const high = cards.filter((card) => card.intensity >= 4).length;
      expect(high, `${packId}/${type} 4–5 档`).toBe(35);
      expect(cards.length - high, `${packId}/${type} 1–3 档`).toBe(15);
      // 档内分配：5 档 21、4 档 14、3 档 7、2 档 5、1 档 3
      const byIntensity = (value: Intensity) => cards.filter((card) => card.intensity === value).length;
      expect([byIntensity(1), byIntensity(2), byIntensity(3), byIntensity(4), byIntensity(5)]).toEqual([3, 5, 7, 14, 21]);
    }
  });

  /** 08 §七：每类前 19 张固定陡坡序列；牌堆 round-robin 只取前 7 张，所以顺序就是抽法的一部分。 */
  it("keeps the 指数陡坡 prefix order（每类强度序列＝SEED_INTENSITY_PATTERN）", () => {
    expect(SEED_INTENSITY_PATTERN).toHaveLength(50);
    for (const { packId, type } of CARD_TYPES) {
      expect(typeOf(packId, type).map((card) => card.intensity), `${packId}/${type}`).toEqual(SEED_INTENSITY_PATTERN);
    }
  });

  /** 滑 N 档过滤后，每类前 7 张仍是「就近档补配满」的邻近档配比（滑 3/2 档直接验算）。 */
  it("keeps the first 7 allowed cards on the steep slope at every scale", () => {
    const firstSeven = (cards: GameCard[], scale: Intensity) =>
      cards.filter((card) => card.intensity <= scale).slice(0, 7).map((card) => card.intensity);
    for (const { packId, type } of CARD_TYPES) {
      const cards = typeOf(packId, type);
      expect(firstSeven(cards, 5).sort(), `${packId}/${type} 滑5档`).toEqual([3, 4, 4, 5, 5, 5, 5]);
      expect(firstSeven(cards, 4).sort(), `${packId}/${type} 滑4档`).toEqual([2, 3, 3, 4, 4, 4, 4]);
      expect(firstSeven(cards, 3).sort(), `${packId}/${type} 滑3档`).toEqual([1, 2, 2, 3, 3, 3, 3]);
      expect(firstSeven(cards, 2).sort(), `${packId}/${type} 滑2档`).toEqual([1, 1, 2, 2, 2, 2, 2]);
    }
  });

  it("keeps the 了解 positions fixed so 打标与顺序可复算", () => {
    for (const { packId, type } of CARD_TYPES) {
      const insight = typeOf(packId, type).flatMap((card, index) => (card.tags[0] === "了解" ? [index + 1] : []));
      expect(insight, `${packId}/${type}`).toEqual([...SEED_INSIGHT_POSITIONS]);
    }
  });

  it("never repeats the same content inside one pack", () => {
    const seen = new Set<string>();
    for (const card of BUILTIN_SEED_CARDS) {
      const fingerprint = `${card.packId}:${card.content}`;
      expect(seen.has(fingerprint), `duplicate ${fingerprint}`).toBe(false);
      seen.add(fingerprint);
    }
  });

  it("covers the session intensity scale so every setting can start offline", () => {
    for (const { packId } of SEEDED_PACKS) {
      const intensities = new Set(seedsOf(packId).map((card) => card.intensity));
      expect(intensities.size).toBeGreaterThanOrEqual(3);
      expect(intensities.has(1)).toBe(true);
      expect(intensities.has(5)).toBe(true);
    }
  });

  it("never ships a seed that trips the hard safety rules（黄赌毒/危险/强迫/露骨）", () => {
    for (const card of BUILTIN_SEED_CARDS) {
      expect(isHardBlocked(`${card.content} ${card.instruction ?? ""}`), card.id).toBe(false);
    }
  });

  it("only uses boundary tags the session model knows", () => {
    for (const card of BUILTIN_SEED_CARDS) {
      for (const tag of card.boundaryTags) expect(boundaryTagSchema.safeParse(tag).success).toBe(true);
    }
  });

  /**
   * 08 §3.1/§3.3：接触题必须挂在「双方同意＋可跳过＋说明写清流程」上（2–3 档的破冰动作同样受管），
   * 亲脸颊／公主抱一级只出现在 4–5 档。
   */
  it("keeps every 接触题 on the consent + skip rails", () => {
    const contact = BUILTIN_SEED_CARDS.filter((card) => card.boundaryTags.includes("physical-contact"));
    expect(contact.length).toBeGreaterThan(0);
    expect(contact.some((card) => card.intensity >= 4)).toBe(true);
    for (const card of contact) {
      const text = `${card.content} ${card.instruction ?? ""}`;
      expect(text, card.id).toMatch(/同意/);
      expect(card.instruction, card.id).toContain("不愿意可无惩罚跳过");
    }
    // 4–5 档的接触／暧昧题：低尺度局整体看不到（§3.4 靠 intensity 过滤），说明里必须有流程
    for (const card of contact.filter((item) => item.intensity >= 4)) {
      expect(card.instruction!.length, card.id).toBeGreaterThan(10);
    }
  });

  /** 08 §二：陌生人挑战强制三件套（先征得同意／拒绝无惩罚／可跳过），且绝不交换联系方式。 */
  it("keeps every 陌生人挑战 card on the three-piece rails", () => {
    const stranger = BUILTIN_SEED_CARDS.filter((card) => card.boundaryTags.includes("stranger-contact"));
    expect(stranger.length).toBeGreaterThan(0);
    for (const card of stranger) {
      expect(card.intensity, card.id).toBeLessThanOrEqual(4);
      expect(card.instruction, card.id).toContain("先问对方愿不愿意");
      expect(card.instruction, card.id).toMatch(/拒绝后本轮不得有任何后续/);
      expect(card.instruction, card.id).toContain("跳过");
      expect(`${card.content} ${card.instruction ?? ""}`, card.id).not.toMatch(/(扫码|加好友|留个电话|微信|联系方式)/);
    }
  });

  it("never seeds the purely-local spin-bottle pack", () => {
    expect(seedsOf("spin-bottle")).toHaveLength(0);
  });

  /** V1.4 R-047：`ai-improv` 的题卡玩法已退役（id 只留作迁移锚），不能再有 seed 进任意牌堆。 */
  it("never seeds the retired ai-improv launcher", () => {
    expect(seedsOf(RANDOM_LAUNCHER_PACK_ID)).toHaveLength(0);
  });
});
