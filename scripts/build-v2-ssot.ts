/**
 * V2 内容真源生成门禁（B1）。
 * 只从冻结 ZIP 的精确 archive member 读取原始 bytes → SHA256 fail-closed →
 * 解析 schema 2.3 → 校验 350+40 / 唯一 cardId / runtimeRules → 写出只读 SSOT 生成物（含 provenance）。
 *
 * 运行：pnpm build:v2-ssot  （vite-node 执行；可用环境变量 V2_ZIP_PATH 覆盖归档路径）
 * 约束：不 commit / 不 push / 不改旧 seed-* / 不改旧 T037 冲突句。
 */

import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { inflateRawSync } from "node:zlib";

import {
  V2_SSOT_ARCHIVE_REL_PATH,
  V2_SSOT_ARCHIVE_SCHEMA,
  V2_SSOT_EXPANSION_MEMBER,
  V2_SSOT_EXPANSION_SHA256,
  V2_SSOT_MAINLINE_MEMBER,
  V2_SSOT_MAINLINE_SHA256,
  V2_SSOT_SCHEMA_VERSION,
  type V13RuntimeConfig,
  type V2ContentSnapshot,
} from "../lib/v2-content/v2-types";
import { validateV13Envelope } from "../lib/v2-content/v2-validation";

const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const EOCD_SIG = 0x06054b50;

interface CentralEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function findEocd(buf: Buffer): number {
  // EOCD 位于结尾 `len - 22 - commentLen`；取最后一次命中并留出 4 字节签名，允许尾部带注释。
  let found = -1;
  for (let i = Math.max(0, buf.length - 22 - 65536); i <= buf.length - 4; i++) {
    if (buf.readUInt32LE(i) === EOCD_SIG) found = i;
  }
  return found;
}

function readCentralDirectories(buf: Buffer): CentralEntry[] {
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error("ZIP 缺少 EOCD（End of Central Directory）签名");
  const totalEntries = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const entries: CentralEntry[] = [];
  let cursor = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(cursor) !== CENTRAL_SIG) throw new Error("ZIP 中央目录条目签名非法");
    const method = buf.readUInt16LE(cursor + 10);
    const compressedSize = buf.readUInt32LE(cursor + 20);
    const uncompressedSize = buf.readUInt32LE(cursor + 24);
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    const localHeaderOffset = buf.readUInt32LE(cursor + 42);
    const name = buf.toString("utf8", cursor + 46, cursor + 46 + nameLen);
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export function readMemberRawBytes(zipBytes: Buffer, memberPath: string): Buffer {
  const entry = readCentralDirectories(zipBytes).find((e) => e.name === memberPath);
  if (!entry) throw new Error(`ZIP 内未找到精确 member：${memberPath}`);
  const local = entry.localHeaderOffset;
  if (zipBytes.readUInt32LE(local) !== LOCAL_SIG) throw new Error(`member 本地头签名非法：${memberPath}`);
  const localNameLen = zipBytes.readUInt16LE(local + 26);
  const localExtraLen = zipBytes.readUInt16LE(local + 28);
  const dataStart = local + 30 + localNameLen + localExtraLen;
  const compressed = zipBytes.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(compressed);
  if (entry.method === 8) {
    const raw = inflateRawSync(compressed);
    if (raw.length !== entry.uncompressedSize) throw new Error(`member 解压长度不符：${memberPath}`);
    return raw;
  }
  throw new Error(`member 使用不支持的压缩方法 ${entry.method}: ${memberPath}`);
}

export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

interface GateInput {
  mainlineBytes: Buffer;
  expansionBytes: Buffer;
}

export function materializeFromBytes(input: GateInput): V2ContentSnapshot {
  const mainlineHash = sha256Hex(input.mainlineBytes);
  const expansionHash = sha256Hex(input.expansionBytes);

  if (mainlineHash !== V2_SSOT_MAINLINE_SHA256) {
    throw new Error(`V2 SSOT SHA256 Gate FAILED（主线）：期望 ${V2_SSOT_MAINLINE_SHA256}，实得 ${mainlineHash}。fail closed，中止生成。`);
  }
  if (expansionHash !== V2_SSOT_EXPANSION_SHA256) {
    throw new Error(`V2 SSOT SHA256 Gate FAILED（扩圈）：期望 ${V2_SSOT_EXPANSION_SHA256}，实得 ${expansionHash}。fail closed，中止生成。`);
  }

  const mainline = JSON.parse(input.mainlineBytes.toString("utf8")) as Record<string, unknown>;
  const expansion = JSON.parse(input.expansionBytes.toString("utf8")) as Record<string, unknown>;

  const validation = validateV13Envelope({
    mainlineSchemaVersion: mainline.schemaVersion,
    mainlineCards: mainline.cards,
    expansionSchemaVersion: expansion.schemaVersion,
    expansionCards: expansion.cards,
    runtimeRules: mainline.runtimeRules,
  });

  if (!validation.ok) {
    throw new Error(`V2 SSOT 校验失败：\n${validation.issues.join("\n")}`);
  }

  return {
    $schema: V2_SSOT_ARCHIVE_SCHEMA,
    provenance: {
      generator: "scripts/build-v2-ssot.ts",
      archivePath: V2_SSOT_ARCHIVE_REL_PATH,
      migrationIdPolicy: "NONE",
      mainline: { memberPath: V2_SSOT_MAINLINE_MEMBER, sha256: mainlineHash, schemaVersion: V2_SSOT_SCHEMA_VERSION, cardCount: validation.stats.mainline },
      expansion: { memberPath: V2_SSOT_EXPANSION_MEMBER, sha256: expansionHash, schemaVersion: V2_SSOT_SCHEMA_VERSION, cardCount: validation.stats.expansion },
    },
    runtimeRules: mainline.runtimeRules as V13RuntimeConfig,
    mainlineCards: mainline.cards as V2ContentSnapshot["mainlineCards"],
    expansionCards: expansion.cards as V2ContentSnapshot["expansionCards"],
  };
}

const OUT_PATH = resolve(join("lib", "v2-content", "generated", "v2-ssot.generated.json"));

export function run(): void {
  const resolvedArchive = resolve(process.env.V2_ZIP_PATH ?? V2_SSOT_ARCHIVE_REL_PATH);
  const zipBytes = readFileSync(resolvedArchive);
  const mainlineBytes = readMemberRawBytes(zipBytes, V2_SSOT_MAINLINE_MEMBER);
  const expansionBytes = readMemberRawBytes(zipBytes, V2_SSOT_EXPANSION_MEMBER);
  const snapshot = materializeFromBytes({ mainlineBytes, expansionBytes });
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`V2 SSOT 已生成：${OUT_PATH}（mainline=${snapshot.provenance.mainline.cardCount}，expansion=${snapshot.provenance.expansion.cardCount}，sha 已过 Gate）`);
}

const entry = process.argv[1] ?? "";
if (entry.includes("build-v2-ssot")) run();