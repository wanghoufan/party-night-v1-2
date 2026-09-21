import { expect, type Page } from "@playwright/test";
import type { GameSession } from "@/lib/domain/schemas";

export async function startLocalGame(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: /今晚开局/ }).click();
  await expect(page).toHaveURL(/\/setup/);
  await page.getByRole("button", { name: /下一步：雷区设置/ }).click();
  await expect(page).toHaveURL(/\/boundaries/);
  await page.getByRole("button", { name: /下一步：生成游戏/ }).click();
  await expect(page).toHaveURL(/\/generating/);
  await page.getByRole("button", { name: /使用本地题库开始/ }).click();
  await expect(page).toHaveURL(/\/game/);
  await expect(page.locator(".game-card")).toBeVisible();
}

/** 从首页某个玩法进入单模式一局（尚无进行中的局时走既有 quick setup）。 */
export async function startPackGame(page: Page, packName: RegExp) {
  await page.goto("/");
  await page.getByRole("link", { name: packName }).click();
  await expect(page).toHaveURL(/\/setup\?pack=/);
  await page.getByRole("button", { name: /下一步：雷区设置/ }).click();
  await expect(page).toHaveURL(/\/boundaries/);
  await page.getByRole("button", { name: /下一步：生成游戏/ }).click();
  await expect(page).toHaveURL(/\/generating/);
  await page.getByRole("button", { name: /使用本地题库开始/ }).click();
  await expect(page).toHaveURL(/\/game/);
  await expect(page.getByRole("button", { name: /切换玩法/ })).toBeVisible();
}

export function currentSessionId(page: Page): string {
  return new URL(page.url()).searchParams.get("session") ?? "";
}

type IdbRead = { mode: "get"; key: string } | { mode: "count" };

function readIndexedDb<T>(page: Page, read: IdbRead): Promise<T> {
  return page.evaluate((args: IdbRead) => new Promise<T>((resolve, reject) => {
    const request = indexedDB.open("party-night-v1");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      try {
        const db = request.result;
        const store = db.transaction("sessions").objectStore("sessions");
        const result = args.mode === "count" ? store.count() : store.get(args.key);
        result.onsuccess = () => { db.close(); resolve(result.result as T); };
        result.onerror = () => { db.close(); reject(result.error); };
      } catch (error) {
        reject(error);
      }
    };
  }), read);
}

/** 读回本地 Session 记录：断言“同一局”而不是 UI 缓存。 */
export const readSession = (page: Page, id: string): Promise<GameSession> => readIndexedDb<GameSession>(page, { mode: "get", key: id });
/** 读隔离区记录：断言坏 Session 被隔离而非删除。 */
export const readQuarantinedSession = (page: Page, id: string): Promise<{ reason: string; raw?: unknown } | undefined> =>
  page.evaluate((key) => new Promise<{ reason: string; raw?: unknown } | undefined>((resolve, reject) => {
    const request = indexedDB.open("party-night-v1");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      try {
        const db = request.result;
        if (!db.objectStoreNames.contains("sessionQuarantine")) { db.close(); resolve(undefined); return; }
        const result = db.transaction("sessionQuarantine").objectStore("sessionQuarantine").get(key);
        result.onsuccess = () => { db.close(); resolve(result.result as { reason: string } | undefined); };
        result.onerror = () => { db.close(); reject(result.error); };
      } catch (error) {
        reject(error);
      }
    };
  }), id);

export const countSessions = (page: Page): Promise<number> => readIndexedDb<number>(page, { mode: "count" });

/**
 * 直接落一个 Session 到本地库：单玩法“必须凑满 N 轮”的 E2E 用它保证题卡数量确定，
 * 不依赖混合模式的随机出题。写入的是真实落库形态，主局按正常读库路径恢复。
 */
export async function seedSession(page: Page, session: GameSession): Promise<void> {
  await page.goto("/");
  await page.evaluate((record) => new Promise<void>((resolve, reject) => {
    // 不删库：以与 App 相同的版本打开（当前 v2，见 lib/storage/db.ts），
    // 缺 store 时走 onupgradeneeded 补齐；同步异常全部转为 reject，15s 无结果直接报错不悬挂。
    let settled = false;
    const timer = window.setTimeout(() => { if (!settled) { settled = true; reject(new Error("seedSession-idb-timeout")); } }, 15000);
    const done = (fn: () => void) => { if (!settled) { settled = true; window.clearTimeout(timer); fn(); } };
    try {
      const request = indexedDB.open("party-night-v1", 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        const ensure = (name: string, keyPath: string) => { if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath }); };
        ensure("players", "id");
        ensure("preferences", "id");
        ensure("gamePacks", "definition.id");
        if (!db.objectStoreNames.contains("sessions")) {
          const sessions = db.createObjectStore("sessions", { keyPath: "id" });
          sessions.createIndex("by-updatedAt", "updatedAt");
          sessions.createIndex("by-status", "status");
        }
        ensure("sessionQuarantine", "id");
        ensure("sessionSummaries", "id");
        ensure("aiProviderProfiles", "id");
        ensure("aiSecrets", "providerProfileId");
        ensure("aiCryptoKeys", "id");
      };
      request.onerror = () => done(() => reject(request.error));
      request.onblocked = () => done(() => reject(new Error("seedSession-idb-blocked")));
      request.onsuccess = () => {
        try {
          const db = request.result;
          const transaction = db.transaction("sessions", "readwrite");
          transaction.objectStore("sessions").put(record);
          transaction.oncomplete = () => { db.close(); done(resolve); };
          transaction.onerror = () => { db.close(); done(() => reject(transaction.error)); };
          transaction.onabort = () => { db.close(); done(() => reject(transaction.error ?? new Error("seedSession-tx-abort"))); };
        } catch (error) { done(() => reject(error instanceof Error ? error : new Error(String(error)))); }
      };
    } catch (error) { done(() => reject(error instanceof Error ? error : new Error(String(error)))); }
  }), session);
}
