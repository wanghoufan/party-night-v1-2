/**
 * V2ContentAdapter｜只读内容真源接口（B1）。
 * 加载由 scripts/build-v2-ssot.ts 生成、且已过 SHA256 fail-closed Gate 的只读 SSOT 生成物，
 * 深冻结后对外暴露只读访问器。本模块不读 ZIP、不算哈希——那些属于构建门禁，
 * 运行期唯一真源是这份已校验的生成物（provenance 内记录 archive/member/sha256/cardCount）。
 *
 * 旧 seed-* 卡原样不动；同类序号只是审计坐标（ID 映射 = NONE），本适配器不提供任何 seed→PN 映射。
 */

import type {
  V13ExpansionCard,
  V13MainlineCard,
  V13RuntimeConfig,
  V2ContentSnapshot,
  V2SnapshotProvenance,
} from "./v2-types";
import rawSnapshot from "./generated/v2-ssot.generated.json";

type DeepReadonly<T> = T extends (...args: unknown[]) => unknown
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value) as Array<keyof typeof value>) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

function assertSnapshotShape(snapshot: V2ContentSnapshot): void {
  if ((snapshot as { $schema?: unknown }).$schema !== "party-night/v2-content-ssot/v1") {
    throw new Error("V2 SSOT 生成物 $schema 非法");
  }
}

export class V2ContentAdapter {
  private readonly snapshot: DeepReadonly<V2ContentSnapshot>;
  private readonly cardsById: ReadonlyMap<string, DeepReadonly<V13MainlineCard> | DeepReadonly<V13ExpansionCard>>;

  constructor(snapshot: V2ContentSnapshot) {
    assertSnapshotShape(snapshot);
    this.snapshot = deepFreeze(snapshot);
    const map = new Map<string, DeepReadonly<V13MainlineCard> | DeepReadonly<V13ExpansionCard>>();
    for (const card of snapshot.mainlineCards) map.set(card.cardId, card as DeepReadonly<V13MainlineCard>);
    for (const card of snapshot.expansionCards) map.set(card.cardId, card as DeepReadonly<V13ExpansionCard>);
    this.cardsById = map;
  }

  get provenance(): DeepReadonly<V2SnapshotProvenance> {
    return this.snapshot.provenance;
  }

  get runtimeRules(): DeepReadonly<V13RuntimeConfig> {
    return this.snapshot.runtimeRules;
  }

  get mainlineCards(): readonly DeepReadonly<V13MainlineCard>[] {
    return this.snapshot.mainlineCards as readonly DeepReadonly<V13MainlineCard>[];
  }

  get expansionCards(): readonly DeepReadonly<V13ExpansionCard>[] {
    return this.snapshot.expansionCards as readonly DeepReadonly<V13ExpansionCard>[];
  }

  get mainlineCardCount(): number {
    return this.snapshot.mainlineCards.length;
  }

  get expansionCardCount(): number {
    return this.snapshot.expansionCards.length;
  }

  cardById(cardId: string): DeepReadonly<V13MainlineCard> | DeepReadonly<V13ExpansionCard> | undefined {
    return this.cardsById.get(cardId);
  }

  mainlineByType(gameType: string): readonly DeepReadonly<V13MainlineCard>[] {
    return this.snapshot.mainlineCards.filter((card) => card.gameType === gameType);
  }
}

let adapter: V2ContentAdapter | null = null;

export function getV2ContentAdapter(): V2ContentAdapter {
  if (!adapter) adapter = new V2ContentAdapter(rawSnapshot as unknown as V2ContentSnapshot);
  return adapter;
}