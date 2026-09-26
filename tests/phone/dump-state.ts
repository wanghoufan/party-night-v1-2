/**
 * 只读：dump 两台真机 WebView 内的 IndexedDB / localStorage 现状。
 * 不改任何东西。用于判断是否有未完成局、AI 是否已配置。
 */
import { chromium, type Page } from "playwright";

const ENDPOINTS: ReadonlyArray<[string, string]> = [
  ["dev31", "http://127.0.0.1:9331"],
  ["dev63", "http://127.0.0.1:9363"],
];

const DUMP = `(() => new Promise((resolve) => {
  const out = { url: location.href, ls: {}, idb: {} };
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k) out.ls[k] = String(localStorage.getItem(k)).slice(0, 300);
    }
  } catch (e) { out.lsError = String(e); }
  const req = indexedDB.open("party-night-v1");
  req.onerror = () => resolve({ ...out, idbError: String(req.error) });
  req.onsuccess = () => {
    const db = req.result;
    const stores = Array.from(db.objectStoreNames);
    out.idb.stores = stores;
    let pending = stores.length;
    if (!pending) { db.close(); resolve(out); return; }
    for (const name of stores) {
      try {
        const tx = db.transaction(name, "readonly");
        const all = tx.objectStore(name).getAll();
        all.onsuccess = () => {
          const rows = all.result || [];
          out.idb[name] = rows.slice(0, 30).map((r) => {
            if (name === "sessions") {
              return { id: r.id, status: r.status, rounds: (r.rounds||[]).length, completed: (r.rounds||[]).filter(x=>x.status==="completed").length, pack: r.currentPackId, players: (r.config?.players||[]).map(p=>p.displayName), participants: r.participants, eff: r.relationshipState?.relationshipEffectiveCardCount, matches: Object.keys(r.relationshipState?.matches||{}) };
            }
            if (name === "aiProviderProfiles") return { id: r.id, provider: r.provider, hasKey: !!r.hasKey, enabled: r.enabled, model: r.model };
            if (name === "aiSecrets") return { providerProfileId: r.providerProfileId, keys: Object.keys(r) };
            return { keys: Object.keys(r).slice(0, 12) };
          });
          pending -= 1;
          if (pending === 0) { db.close(); resolve(out); }
        };
        all.onerror = () => { pending -= 1; out.idb[name] = "ERR"; if (pending === 0) { db.close(); resolve(out); } };
      } catch (e) { pending -= 1; out.idb[name] = "THROW " + String(e); if (pending === 0) { db.close(); resolve(out); } }
    }
  };
}))()`;

async function dump(label: string, endpoint: string) {
  console.log(`\n########## ${label} ${endpoint} ##########`);
  const browser = await chromium.connectOverCDP(endpoint, { timeout: 15000 });
  try {
    for (const ctx of browser.contexts()) {
      for (const page of ctx.pages()) {
        const data = await page.evaluate(DUMP as unknown as string);
        console.log(JSON.stringify(data, null, 2));
      }
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  for (const [label, endpoint] of ENDPOINTS) await dump(label, endpoint);
}

void main();
