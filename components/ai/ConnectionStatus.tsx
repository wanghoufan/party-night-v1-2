import { Icon } from "@/components/ui/Icon";

export function ConnectionStatus({ status, message }: { status: "idle" | "testing" | "success" | "error"; message?: string }) {
  if (status === "idle") return null;
  return <div className={`connection-status connection-status--${status}`} role="status"><Icon name={status === "success" ? "check" : status === "testing" ? "refresh" : "settings"} /><span>{message ?? (status === "testing" ? "正在测试连接…" : status === "success" ? "当前配置正常" : "连接失败，请检查配置")}</span></div>;
}
