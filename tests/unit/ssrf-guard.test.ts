import { describe, expect, it } from "vitest";
import { isPublicAddress, resolveSafeEndpoint } from "@/lib/security/ssrf-guard";

describe("SSRF guard", () => {
  it.each(["127.0.0.1", "10.1.2.3", "100.64.0.1", "172.16.1.2", "192.168.0.2", "192.0.2.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "169.254.169.254", "::1", "fc00::1", "fe80::1", "2001:db8::1", "::ffff:7f00:1"])("rejects private or reserved address %s", (address) => expect(isPublicAddress(address)).toBe(false));
  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])("accepts public address %s", (address) => expect(isPublicAddress(address)).toBe(true));
  it("rejects non-HTTPS custom URLs before DNS", async () => await expect(resolveSafeEndpoint("http://example.com")).rejects.toThrow("https"));
  it("rejects embedded credentials", async () => await expect(resolveSafeEndpoint("https://user:pass@example.com")).rejects.toThrow("credentials"));
});
