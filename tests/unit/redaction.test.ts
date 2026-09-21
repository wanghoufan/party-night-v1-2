import { describe, expect, it } from "vitest";
import { redactText, redactUnknown, safeErrorMessage } from "@/lib/ai/redaction";

describe("secret redaction", () => {
  const secret = "sk-ThisMustNeverLeak123";
  it("redacts bearer and sk tokens", () => expect(redactText(`Bearer ${secret} / ${secret}`)).not.toContain(secret));
  it("redacts sensitive object keys", () => expect(JSON.stringify(redactUnknown({ apiKey: secret, nested: { authorization: `Bearer ${secret}` } }))).not.toContain(secret));
  it("redacts errors", () => expect(safeErrorMessage(new Error(`request ${secret} failed`))).not.toContain(secret));
});
