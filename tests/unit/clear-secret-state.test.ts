import { describe, expect, it } from "vitest";
import { clearSecretReducer, initialClearSecretState } from "@/lib/ai/clear-secret-state";

describe("clear secret state", () => {
  it("open only displays confirmation", () => expect(clearSecretReducer(initialClearSecretState, { type: "open" })).toMatchObject({ confirmOpen: true, clearing: false, cleared: false }));
  it("cancel preserves non-cleared state", () => expect(clearSecretReducer(clearSecretReducer(initialClearSecretState, { type: "open" }), { type: "cancel" })).toMatchObject({ confirmOpen: false, cleared: false }));
  it("only explicit success marks it cleared", () => expect(clearSecretReducer(initialClearSecretState, { type: "success" })).toMatchObject({ cleared: true }));
});
