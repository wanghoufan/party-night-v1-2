import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CustomGamePack, GameSession, Player, SessionConfig, SessionSummary } from "@/lib/domain/schemas";
import type { AIProviderProfile } from "@/lib/ai/provider";

export interface AppPreferences {
  id: "main";
  recentPlayers: Player[];
  lastSessionConfig?: SessionConfig;
  activeProviderId?: string;
  /** 用户在“游戏包”里禁用的内置玩法：内置默认启用，这里只记禁用名单（FR-044）。 */
  disabledPackIds?: string[];
  updatedAt: string;
}

export interface AISecretRecord {
  providerProfileId: string;
  ciphertext: ArrayBuffer;
  iv: Uint8Array<ArrayBuffer>;
  algorithm: "AES-GCM";
  cryptoVersion: 1;
  updatedAt: string;
}

export interface AICryptoKeyRecord {
  id: "party-night-ai-secret-key-v1";
  key: CryptoKey;
  createdAt: string;
}

/**
 * 反序列化失败的 Session 原始副本（T190）：隔离坏记录，既不重复失败也不直接清掉用户数据。
 * 主页/主局的读取路径只认 sessions，隔离区不参与正常流程。
 */
export interface QuarantinedSessionRecord {
  id: string;
  reason: string;
  quarantinedAt: string;
  raw: unknown;
}

interface PartyNightDB extends DBSchema {
  players: { key: string; value: Player };
  preferences: { key: string; value: AppPreferences };
  gamePacks: { key: string; value: CustomGamePack };
  sessions: { key: string; value: GameSession; indexes: { "by-updatedAt": string; "by-status": string } };
  sessionQuarantine: { key: string; value: QuarantinedSessionRecord };
  sessionSummaries: { key: string; value: SessionSummary };
  aiProviderProfiles: { key: string; value: AIProviderProfile };
  aiSecrets: { key: string; value: AISecretRecord };
  aiCryptoKeys: { key: string; value: AICryptoKeyRecord };
}

let dbPromise: Promise<IDBPDatabase<PartyNightDB>> | undefined;

export function getDb(): Promise<IDBPDatabase<PartyNightDB>> {
  if (!dbPromise) {
    // v1 → v2：新增 sessionQuarantine（坏记录隔离位）。升级只补缺失的 store，不动 sessions 里的任何一条记录。
    dbPromise = openDB<PartyNightDB>("party-night-v1", 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("players")) db.createObjectStore("players", { keyPath: "id" });
        if (!db.objectStoreNames.contains("preferences")) db.createObjectStore("preferences", { keyPath: "id" });
        if (!db.objectStoreNames.contains("gamePacks")) db.createObjectStore("gamePacks", { keyPath: "definition.id" });
        if (!db.objectStoreNames.contains("sessions")) {
          const sessions = db.createObjectStore("sessions", { keyPath: "id" });
          sessions.createIndex("by-updatedAt", "updatedAt");
          sessions.createIndex("by-status", "status");
        }
        if (!db.objectStoreNames.contains("sessionQuarantine")) db.createObjectStore("sessionQuarantine", { keyPath: "id" });
        if (!db.objectStoreNames.contains("sessionSummaries")) db.createObjectStore("sessionSummaries", { keyPath: "id" });
        if (!db.objectStoreNames.contains("aiProviderProfiles")) db.createObjectStore("aiProviderProfiles", { keyPath: "id" });
        if (!db.objectStoreNames.contains("aiSecrets")) db.createObjectStore("aiSecrets", { keyPath: "providerProfileId" });
        if (!db.objectStoreNames.contains("aiCryptoKeys")) db.createObjectStore("aiCryptoKeys", { keyPath: "id" });
      },
      blocked() { console.warn("Party Night 数据库升级被其他页面阻塞"); },
    });
  }
  return dbPromise;
}

export async function resetDbForTests(): Promise<void> {
  const db = await dbPromise;
  db?.close();
  dbPromise = undefined;
}
