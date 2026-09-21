import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import type { SafeEndpoint } from "@/lib/security/ssrf-guard";

export function createPinnedLookup(addresses: SafeEndpoint["addresses"]): LookupFunction {
  let index = 0;
  return (_hostname, options, callback) => {
    const optionFamily = typeof options === "number" ? options : options?.family;
    const candidates = optionFamily ? addresses.filter((item) => item.family === optionFamily) : addresses;
    const available = candidates.length ? candidates : addresses;
    if (typeof options === "object" && options?.all) {
      callback(null, available.map(({ address, family }) => ({ address, family })));
      return;
    }
    const selected = available[index++ % available.length]!;
    callback(null, selected.address, selected.family);
  };
}

export async function requestJsonPinned(endpoint: SafeEndpoint, path: string, init: { method?: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }): Promise<{ status: number; body: unknown }> {
  const target = new URL(path.replace(/^\//, ""), endpoint.url.href.endsWith("/") ? endpoint.url : `${endpoint.url.href}/`);
  if (target.origin !== endpoint.url.origin) throw new Error("provider-cross-host-path-forbidden");
  const pinnedLookup = createPinnedLookup(endpoint.addresses);
  const transport = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(target, {
      method: init.method ?? "POST", headers: init.headers, lookup: pinnedLookup,
      servername: target.hostname, timeout: 120_000,
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk) => {
        const buffer = Buffer.from(chunk);
        size += buffer.length;
        if (size > 4 * 1024 * 1024) return request.destroy(new Error("provider-response-too-large"));
        chunks.push(buffer);
      });
      response.on("end", () => {
        const status = response.statusCode ?? 502;
        if (status >= 300 && status < 400) return reject(new Error("provider-redirect-blocked"));
        const text = Buffer.concat(chunks).toString("utf8");
        try { resolve({ status, body: text ? JSON.parse(text) : {} }); } catch { reject(new Error("provider-invalid-json")); }
      });
    });
    request.on("timeout", () => request.destroy(new Error("provider-timeout")));
    request.on("error", reject);
    init.signal?.addEventListener("abort", () => request.destroy(new Error("provider-aborted")), { once: true });
    if (init.body) request.write(init.body);
    request.end();
  });
}
