import { describe, expect, it } from "vitest";
import { providerErrorCodeForException, providerErrorCodeForStatus, providerErrorMessage } from "@/lib/ai/provider-errors";

describe("provider error mapping", () => {
  it.each([[401, "AUTH_FAILED"], [402, "BALANCE_REQUIRED"], [404, "MODEL_UNAVAILABLE"], [429, "RATE_LIMITED"], [500, "UPSTREAM_FAILED"]] as const)("maps status %s", (status, code) => expect(providerErrorCodeForStatus(status)).toBe(code));
  it("identifies Node DNS lookup failures", () => expect(providerErrorCodeForException("ERR_INVALID_IP_ADDRESS")).toBe("NETWORK_ERROR"));
  it("renders actionable messages without upstream response text", () => expect(providerErrorMessage("BALANCE_REQUIRED")).toContain("余额不足"));
});

describe("错误文案 provider 名动态化（Change B 返工）", () => {
  it("默认 DeepSeek：服务器模式文案口径不变，仅网络提示统一为手机网络", () => {
    expect(providerErrorMessage("BALANCE_REQUIRED")).toBe("DeepSeek 账户余额不足，请先充值");
    expect(providerErrorMessage("TIMEOUT")).toBe("连接 DeepSeek 超时，请稍后再试");
    expect(providerErrorMessage("NETWORK_ERROR")).toBe("服务器无法连接 DeepSeek，请检查手机网络");
    expect(providerErrorMessage("NETWORK_ERROR")).not.toContain("电脑网络");
  });

  it("自包含直连传真实 provider 名：不再写死 DeepSeek", () => {
    expect(providerErrorMessage("BALANCE_REQUIRED", "OpenCode Go")).toBe("OpenCode Go 账户余额不足，请先充值");
    expect(providerErrorMessage("TIMEOUT", "OpenCode Go")).toBe("连接 OpenCode Go 超时，请稍后再试");
    expect(providerErrorMessage("NETWORK_ERROR", "OpenCode Go")).toBe("服务器无法连接 OpenCode Go，请检查手机网络");
    expect(providerErrorMessage("NETWORK_ERROR", "OpenCode Go")).not.toContain("DeepSeek");
  });

  it.each(["DeepSeek", "OpenCode Go", "自定义 Provider"])("provider 名 %s 原样替换进相关文案", (name) => {
    expect(providerErrorMessage("BALANCE_REQUIRED", name)).toContain(name);
    expect(providerErrorMessage("TIMEOUT", name)).toContain(name);
    expect(providerErrorMessage("NETWORK_ERROR", name)).toContain(name);
  });

  it("与 provider 无关的文案不掺任何 provider 名", () => {
    for (const code of ["AUTH_FAILED", "MODEL_UNAVAILABLE", "RATE_LIMITED", "PROVIDER_REQUEST_INVALID", "URL_REJECTED", "UNKNOWN"]) {
      expect(providerErrorMessage(code, "OpenCode Go")).not.toContain("OpenCode Go");
    }
  });
});
