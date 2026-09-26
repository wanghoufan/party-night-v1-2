import { describe, expect, it } from "vitest";

import { getV2ContentAdapter } from "@/lib/v2-content/v2-content-adapter";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { SessionConfig } from "@/lib/domain/schemas";
import { createSession } from "@/lib/engine/session-engine";
import { parseSessionDraft, serializeSessionDraft } from "@/lib/engine/session-draft";
import { migrateSessionRecord } from "@/lib/storage/session-migration";
import { createMainlineContext, drawMainlineCard } from "@/lib/v2-relationship/v2-mainline";
import {
  NO_ELIGIBLE_PAIR_HINT,
  createSessionParticipants,
  eligiblePairKeys,
  normalizeParticipants,
  pairModeFor,
  withSessionParticipants,
} from "@/lib/v2-relationship/v2-participants";
import { createInitialRelationshipState, pairKey, type SessionParticipant } from "@/lib/v2-relationship/v2-state";

/* ------------------------------------------------------------------ */
/* 装置                                                                  */
/* ------------------------------------------------------------------ */

const adapter = getV2ContentAdapter();

const player = (id: string, active = true) => ({
  id,
  displayName: id,
  active,
  createdAt: "x",
  lastUsedAt: "x",
});

const players = (ids: string[]) => ids.map((id) => player(id));

const male = (playerId: string, active = true): SessionParticipant => ({ playerId, active, pairGender: "male" });
const female = (playerId: string, active = true): SessionParticipant => ({ playerId, active, pairGender: "female" });
const unset = (playerId: string, active = true): SessionParticipant => ({ playerId, active, pairGender: null });

const mainlineMeta = (cardId: string) => {
  const card = adapter.mainlineCards.find((item) => item.cardId === cardId);
  if (!card) throw new Error(`非主线 SSOT 卡：${cardId}`);
  return card;
};

const config = (overrides: Partial<SessionConfig> = {}): SessionConfig => ({
  players: players(["a", "b", "c", "d"]),
  relationship: "friends",
  vibes: ["funny"],
  intensity: 5,
  boundaries: DEFAULT_BOUNDARIES,
  enabledPackIds: ["truth-dare", "never-have", "pointing-game", "compatibility-test"],
  mode: "mixed",
  ...overrides,
});

/** 连续抽 n 张（把已出的卡记入 usedCardIds 向前推进），返回抽到的卡 id。 */
function drawSeveral(participants: SessionParticipant[], count: number, packId = "never-have"): string[] {
  let context = createMainlineContext({
    sessionId: "s-d4",
    participants,
    packId,
    intensityLimit: 5,
  });
  const drawn: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const { outcome, context: next } = drawMainlineCard(context);
    if (outcome.kind !== "CARD") break;
    drawn.push(outcome.cardId);
    context = {
      ...next,
      state: {
        ...next.state,
        relationship: {
          ...next.state.relationship,
          usedCardIds: [...next.state.relationship.usedCardIds, outcome.cardId],
        },
      },
    };
  }
  return drawn;
}

/* ------------------------------------------------------------------ */
/* D4：性别录入、男女 pair、普通玩法降级                                     */
/* ------------------------------------------------------------------ */

describe("V2-B7 D4｜当局参与者 pairGender 与普通玩法降级", () => {
  it("默认不填：participants 全为 pairGender=null，pair 池为空 → NO_ELIGIBLE_PAIR（提示不暴露字段）", () => {
    const participants = createSessionParticipants(players(["a", "b", "c", "d"]));

    expect(participants).toHaveLength(4);
    expect(participants.every((item) => item.pairGender === null)).toBe(true);
    expect(participants.every((item) => item.active)).toBe(true);
    expect(eligiblePairKeys(participants)).toEqual([]);
    expect(pairModeFor(participants)).toBe("NO_ELIGIBLE_PAIR");

    expect(NO_ELIGIBLE_PAIR_HINT).toContain("普通玩法");
    expect(NO_ELIGIBLE_PAIR_HINT).not.toMatch(/男|女/);
  });

  it("一男一女即生成合法 pair（ACTIVE），pairKey 为无向稳定键", () => {
    const participants = [male("a"), female("b"), unset("c")];

    expect(eligiblePairKeys(participants)).toEqual([pairKey("a", "b")]);
    expect(pairModeFor(participants)).toBe("ACTIVE");

    // 4 人 2男2女 → 全部 4 条异性边，且与录入顺序无关
    const four = [female("d"), male("a"), male("b"), female("c")];
    expect(eligiblePairKeys(four).sort()).toEqual(
      [pairKey("a", "c"), pairKey("a", "d"), pairKey("b", "c"), pairKey("b", "d")].sort(),
    );
  });

  it("无合法 pair 时降级普通玩法：连抽多张全是全桌卡，pair/MATCH 卡一张不出", () => {
    const participants = [unset("a"), unset("b"), unset("c"), unset("d")];
    expect(pairModeFor(participants)).toBe("NO_ELIGIBLE_PAIR");

    // 全桌玩法（never-have 49 张、either-or 42 张、most-likely 34 张）照常可玩
    const drawn = drawSeveral(participants, 8);
    expect(drawn.length).toBeGreaterThan(0);
    for (const cardId of drawn) {
      const meta = mainlineMeta(cardId);
      expect(meta.targetMode, cardId).toBe("all-players");
      expect(meta.matchRequired, cardId).toBe(false);
    }
  });

  it("无合法 pair + 定向玩法（求真话/指人/默契）：不出卡也不猜人，直接给全局耗尽指引", () => {
    // truth-dare / pointing / chemistry 全部是定向卡（system/choose-opposite-sex、match-pair），
    // 全员未填性别时无法在不猜人的前提下出这些卡 —— 按 R4 §4.1 完整降级，不空转、不补边。
    const participants = [unset("a"), unset("b"), unset("c"), unset("d")];
    const { outcome } = drawMainlineCard(
      createMainlineContext({ sessionId: "s-downgrade", participants, packId: "truth-dare", intensityLimit: 5 }),
    );

    expect(outcome.kind).toBe("RELATIONSHIP_GLOBAL_EXHAUSTED");
    if (outcome.kind !== "RELATIONSHIP_GLOBAL_EXHAUSTED") return;
    expect(outcome.guidance).toContain("关系玩法");
  });

  it("单目标性别（全男或全女）按 NO_ELIGIBLE_PAIR 完整降级，不创建同性别边", () => {
    for (const all of [[male("a"), male("b"), male("c")], [female("a"), female("b")]]) {
      expect(eligiblePairKeys(all)).toEqual([]);
      expect(pairModeFor(all)).toBe("NO_ELIGIBLE_PAIR");
    }
  });

  it("中途退出：active=false 立即让该边失效；仅剩一条边时退出直接转 NO_ELIGIBLE_PAIR", () => {
    const two = [male("a"), female("b"), unset("c")];
    expect(pairModeFor(two)).toBe("ACTIVE");

    const exited = [male("a"), female("b", false), unset("c")];
    expect(eligiblePairKeys(exited)).toEqual([]);
    expect(pairModeFor(exited)).toBe("NO_ELIGIBLE_PAIR");
  });

  it("非法枚举 / 缺字段 / 悬空与重复 playerId 一律规范化为 null 或丢弃（绝不猜性别）", () => {
    const raw = [
      { playerId: "a", active: true, pairGender: "x" },
      { playerId: "b", active: true },
      { playerId: "b", active: true, pairGender: "female" },
      { playerId: "ghost", active: true, pairGender: "male" },
      { playerId: "c", active: true, pairGender: "female" },
      "not-a-record",
    ];
    const normalized = normalizeParticipants(raw, players(["a", "b", "c"]));

    expect(normalized).toEqual([
      { playerId: "a", active: true, pairGender: null },
      { playerId: "b", active: true, pairGender: null },
      { playerId: "c", active: true, pairGender: "female" },
    ]);
    expect(pairModeFor(normalized)).toBe("NO_ELIGIBLE_PAIR");
  });

  it("Host 输入按 playerId 对齐写入：男/女/不填三态原样落到当局参与者", () => {
    const participants = createSessionParticipants(players(["a", "b", "c"]), {
      a: "male",
      b: "female",
      c: null,
    });
    expect(participants).toEqual([male("a"), female("b"), unset("c")]);
    expect(pairModeFor(participants)).toBe("ACTIVE");
  });
});

/* ------------------------------------------------------------------ */
/* D4：Session 写入与旧档兼容                                             */
/* ------------------------------------------------------------------ */

describe("V2-B7 D4｜Session 参与者落库与旧档兼容（旧档无字段视为 null）", () => {
  it("createSession 写入 participants；不传时按 players 补全且全为 null（旧调用方行为不变）", () => {
    const defaulted = createSession(config());
    expect(defaulted.participants).toEqual(createSessionParticipants(config().players));
    expect(defaulted.participants!.every((item) => item.pairGender === null)).toBe(true);

    const withGender = createSession(config(), [], [male("a"), female("b"), unset("c"), unset("d")]);
    expect(withGender.participants).toEqual([male("a"), female("b"), unset("c"), unset("d")]);
    expect(pairModeFor(withGender.participants!)).toBe("ACTIVE");
  });

  it("旧档（无 participants 字段）读取时补齐 pairGender=null，且不阻止恢复、幂等", () => {
    const legacyCurrent: Record<string, unknown> = { ...createSession(config()) };
    delete legacyCurrent.participants;

    const migrated = migrateSessionRecord(legacyCurrent);
    expect(migrated).toBeDefined();
    expect(migrated!.participants).toEqual([
      { playerId: "a", active: true, pairGender: null },
      { playerId: "b", active: true, pairGender: null },
      { playerId: "c", active: true, pairGender: null },
      { playerId: "d", active: true, pairGender: null },
    ]);
    // 旧档无合法 pair → 安全降级普通玩法（不报错、不退出）
    expect(pairModeFor(migrated!.participants!)).toBe("NO_ELIGIBLE_PAIR");
    // 幂等：再迁移一次结果完全相同，不新建 pair/signal
    expect(migrateSessionRecord(migrated)).toEqual(migrated);
  });

  it("V1 旧档（schemaVersion=1、无 participants）也能补全并保留既有字段", () => {
    const current = createSession(config());
    const v1Record: Record<string, unknown> = { ...current, schemaVersion: 1 };
    delete v1Record.participants;

    const migrated = migrateSessionRecord(v1Record);
    expect(migrated).toBeDefined();
    expect(migrated!.schemaVersion).toBe(2);
    expect(migrated!.participants).toHaveLength(4);
    expect(migrated!.participants!.every((item) => item.pairGender === null)).toBe(true);
    expect(migrated!.deckSnapshot).toEqual(current.deckSnapshot);
  });

  it("withSessionParticipants 对已规范化的 Session 不再改动（读取路径不改写历史）", () => {
    const session = createSession(config(), [], [male("a"), female("b"), unset("c"), unset("d")]);
    expect(withSessionParticipants(session)).toEqual(session);
  });

  it("pairGender 只存在当局 Session，不回写 Player 档案（档案 schema 无该字段）", () => {
    const participants = createSessionParticipants(players(["a", "b"]), { a: "male", b: "female" });
    expect(Object.keys(participants[0]).sort()).toEqual(["active", "pairGender", "playerId"]);
    expect(JSON.stringify(config().players)).not.toMatch(/pairGender|"male"|"female"/);
    // 关系态里没有任何 pairGender 字段（性别只用于路由，不落关系图）
    expect(JSON.stringify(createInitialRelationshipState())).not.toMatch(/pairGender|male|female/);
  });
});

/* ------------------------------------------------------------------ */
/* D4：组局草稿传递（setup → boundaries）                                   */
/* ------------------------------------------------------------------ */

describe("V2-B7 D4｜组局草稿：性别随当局草稿传递，旧草稿仍可读", () => {
  it("新草稿 {config, participants} 原样解析；participants 按 config.players 规范化", () => {
    const cfg = config();
    const serialized = serializeSessionDraft(cfg, [male("a"), female("b"), unset("c"), unset("d")]);
    const parsed = parseSessionDraft(JSON.parse(serialized));

    expect(parsed).toBeDefined();
    expect(parsed!.config.players).toHaveLength(4);
    expect(parsed!.participants.slice(0, 2)).toEqual([male("a"), female("b")]);
    expect(pairModeFor(parsed!.participants)).toBe("ACTIVE");
  });

  it("旧草稿（纯 SessionConfig，B7 之前写入）照旧可读，性别补 null；坏草稿返回 undefined", () => {
    const legacy = parseSessionDraft(JSON.parse(JSON.stringify(config())));
    expect(legacy).toBeDefined();
    expect(legacy!.participants).toEqual(createSessionParticipants(config().players));
    expect(legacy!.participants.every((item) => item.pairGender === null)).toBe(true);

    expect(parseSessionDraft(null)).toBeUndefined();
    expect(parseSessionDraft({ config: { players: [] } })).toBeUndefined();
    expect(parseSessionDraft("nope")).toBeUndefined();
  });
});
