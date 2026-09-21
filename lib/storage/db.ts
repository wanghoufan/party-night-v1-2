import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CustomGamePack, GameSession, Player, SessionConfig, SessionSummary } from "@/lib/domain/schemas";
import type { AIProviderProfile } from "@/lib/ai/provider";

export interface AppPreferences {
  id: "main";
  recentPlayers: Player[];
  lastSessionConfig?: SessionConfig;
  activeProviderId?: string;
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

interface PartyNightDB extends DBSchema {
  players: { key: string; value: Player };
  preferences: { key: string; value: AppPreferences };
  gamePacks: { key: string; value: CustomGamePack };
  sessions: { key: string; value: GameSession; indexes: { "by-updatedAt": string; "by-status": string } };
  sessionSummaries: { key: string; value: SessionSummary };
  aiProviderProfiles: { key: string; value: AIProviderProfile };
  aiSecrets: { key: string; value: AISecretRecord };
  aiCryptoKeys: { key: string; value: AICryptoKeyRecord };
}

let dbPromise: Promise<IDBPDatabase<PartyNightDB>> | undefined;

export function getDb(): Promise<IDBPDatabase<PartyNightDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PartyNightDB>("party-night-v1", 1, {
      upgrade(db) {
        db.createObjectStore("players", { keyPath: "id" });
        db.createObjectStore("preferences", { keyPath: "id" });
        db.createObjectStore("gamePacks", { keyPath: "definition.id" });
        const sessions = db.createObjectStore("sessions", { keyPath: "id" });
        sessions.createIndex("by-updatedAt", "updatedAt");
        sessions.createIndex("by-status", "status");
        db.createObjectStore("sessionSummaries", { keyPath: "id" });
        db.createObjectStore("aiProviderProfiles", { keyPath: "id" });
        db.createObjectStore("aiSecrets", { keyPath: "providerProfileId" });
        db.createObjectStore("aiCryptoKeys", { keyPath: "id" });
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
