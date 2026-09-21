import { describe, expect, it } from "vitest";
import { providerErrorCodeForException, providerErrorCodeForStatus, providerErrorMessage } from "@/lib/ai/provider-errors";

describe("provider error mapping", () => {
  it.each([[401, "AUTH_FAILED"], [402, "BALANCE_REQUIRED"], [404, "MODEL_UNAVAILABLE"], [429, "RATE_LIMITED"], [500, "UPSTREAM_FAILED"]] as const)("maps status %s", (status, code) => expect(providerErrorCodeForStatus(status)).toBe(code));
  it("identifies Node DNS lookup failures", () => expect(providerErrorCodeForException("ERR_INVALID_IP_ADDRESS")).toBe("NETWORK_ERROR"));
  it("renders actionable messages without upstream response text", () => expect(providerErrorMessage("BALANCE_REQUIRED")).toContain("余额不足"));
});
