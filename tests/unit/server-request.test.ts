import { describe, expect, it, vi } from "vitest";
import { createPinnedLookup } from "@/lib/ai/server-request";

describe("pinned DNS lookup", () => {
  const addresses = [{ address: "1.1.1.1", family: 4 as const }, { address: "2606:4700:4700::1111", family: 6 as const }];

  it("returns an address array when Node requests all results", () => {
    const callback = vi.fn();
    createPinnedLookup(addresses)("api.example.com", { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, addresses);
  });

  it("returns one matching address for legacy single-result lookup", () => {
    const callback = vi.fn();
    createPinnedLookup(addresses)("api.example.com", { family: 4 }, callback);
    expect(callback).toHaveBeenCalledWith(null, "1.1.1.1", 4);
  });
});
