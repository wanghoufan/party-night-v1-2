import { describe, expect, it } from "vitest";
import { createId } from "@/lib/utils/create-id";

describe("createId", () => {
  it("uses randomUUID when the secure-context API exists", () => {
    const value = "00000000-0000-4000-8000-000000000001" as `${string}-${string}-${string}-${string}-${string}`;
    const source = { randomUUID: () => value, getRandomValues: <T extends ArrayBufferView | null>(array: T) => array };
    expect(createId(source)).toBe(value);
  });

  it("creates a valid v4 UUID when randomUUID is unavailable on HTTP", () => {
    const source = { getRandomValues: <T extends ArrayBufferView | null>(array: T) => {
      if (array instanceof Uint8Array) array.fill(0xaa);
      return array;
    } };
    expect(createId(source)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
