export type ProviderErrorCode =
  | "AUTH_FAILED"
  | "BALANCE_REQUIRED"
  | "MODEL_UNAVAILABLE"
  | "RATE_LIMITED"
  | "PROVIDER_REQUEST_INVALID"
  | "UPSTREAM_FAILED"
  | "URL_REJECTED"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "REQUEST_FAILED";

export function providerErrorCodeForStatus(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) return "AUTH_FAILED";
  if (status === 402) return "BALANCE_REQUIRED";
  if (status === 404) return "MODEL_UNAVAILABLE";
  if (status === 408 || status === 504) return "TIMEOUT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 400 && status < 500) return "PROVIDER_REQUEST_INVALID";
  return "UPSTREAM_FAILED";
}

export function providerErrorCodeForException(message: string): ProviderErrorCode {
  if (message.includes("https") || message.includes("host") || message.includes("redirect") || message.includes("url")) return "URL_REJECTED";
  if (message.includes("timeout") || message.includes("ETIMEDOUT")) return "TIMEOUT";
  if (message.includes("ENOTFOUND") || message.includes("ECONN") || message.includes("EAI_AGAIN") || message.includes("certificate") || message.includes("IP_ADDRESS")) return "NETWORK_ERROR";
  return "REQUEST_FAILED";
}

export function providerErrorMessage(code?: string): string {
  switch (code) {
    case "AUTH_FAILED": return "鉴权失败，请检查 API Key";
    case "BALANCE_REQUIRED": return "DeepSeek 账户余额不足，请先充值";
    case "MODEL_UNAVAILABLE": return "当前模型不可用，请检查模型设置";
    case "RATE_LIMITED": return "请求过于频繁，请稍后再试";
    case "PROVIDER_REQUEST_INVALID": return "接口拒绝了请求，请检查模型与账户状态";
    case "TIMEOUT": return "连接 DeepSeek 超时，请稍后再试";
    case "NETWORK_ERROR": return "服务器无法连接 DeepSeek，请检查电脑网络";
    case "URL_REJECTED": return "接口地址未通过安全检查";
    default: return "AI 服务暂时不可用，请稍后再试";
  }
}
