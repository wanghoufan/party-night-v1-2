import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface SafeEndpoint {
  url: URL;
  addresses: Array<{ address: string; family: 4 | 6 }>;
}

function isBlockedIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  const [a, b] = parts;
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b! >= 64 && b! <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b! >= 16 && b! <= 31)
    || (a === 192 && (b === 0 || b === 168))
    || (a === 198 && (b === 18 || b === 19 || b === 51))
    || (a === 203 && b === 0)
    || a! >= 224;
}

function isBlockedIPv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0]!;
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("ff") || normalized.startsWith("2001:db8")) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mapped) return isBlockedIPv4(mapped);
  const hexMapped = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hexMapped) return false;
  const high = Number.parseInt(hexMapped[1]!, 16);
  const low = Number.parseInt(hexMapped[2]!, 16);
  return isBlockedIPv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !isBlockedIPv4(address);
  if (family === 6) return !isBlockedIPv6(address);
  return false;
}

export async function resolveSafeEndpoint(rawUrl: string, allowDevLocalhost = false): Promise<SafeEndpoint> {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error("provider-url-invalid"); }
  const localDev = allowDevLocalhost && process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.username || url.password) throw new Error("provider-url-credentials-forbidden");
  if (url.protocol !== "https:" && !(localDev && url.protocol === "http:")) throw new Error("provider-url-https-required");
  if (["localhost", "localhost.localdomain", "metadata.google.internal"].includes(url.hostname) && !localDev) throw new Error("provider-host-forbidden");
  const resolved = await lookup(url.hostname, { all: true, verbatim: true });
  if (!resolved.length) throw new Error("provider-host-unresolved");
  const addresses = resolved.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
  if (!localDev && addresses.some(({ address }) => !isPublicAddress(address))) throw new Error("provider-host-not-public");
  return { url, addresses };
}
