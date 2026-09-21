"use client";

import Link from "next/link";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ProviderSelector } from "@/components/ai/ProviderSelector";
import { SecretInput, type SecretInputHandle } from "@/components/ai/SecretInput";
import { ConnectionStatus } from "@/components/ai/ConnectionStatus";
import { DangerZone } from "@/components/ai/DangerZone";
import { NeonBackground } from "@/components/brand/NeonBackground";
import { BottomTabBar } from "@/components/ui/BottomTabBar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { clearSecretReducer, initialClearSecretState } from "@/lib/ai/clear-secret-state";
import { createCustomProfile, DEEPSEEK_PROFILE } from "@/lib/ai/presets";
import { providerErrorMessage } from "@/lib/ai/provider-errors";
import type { AIProviderProfile } from "@/lib/ai/provider";
import { aiProviderRepository } from "@/lib/storage/ai-provider-repository";
import { preferencesRepository } from "@/lib/storage/preferences-repository";

type Connection = { status: "idle" | "testing" | "success" | "error"; message?: string };

export default function AISettingsPage() {
  const [profiles, setProfiles] = useState<AIProviderProfile[]>([]);
  const [activeId, setActiveIdState] = useState(DEEPSEEK_PROFILE.id);
  const secretRef = useRef<SecretInputHandle>(null);
  const [configured, setConfigured] = useState(false);
  const [persist, setPersist] = useState(true);
  const [connection, setConnection] = useState<Connection>({ status: "idle" });
  const [notice, setNotice] = useState("");
  const [clearState, dispatchClear] = useReducer(clearSecretReducer, initialClearSecretState);
  const active = useMemo(() => profiles.find((profile) => profile.id === activeId) ?? DEEPSEEK_PROFILE, [profiles, activeId]);

  useEffect(() => {
    void Promise.all([aiProviderRepository.ensurePresets(), preferencesRepository.get()]).then(([savedProfiles, preference]) => {
      setProfiles(savedProfiles);
      if (preference.activeProviderId && savedProfiles.some((profile) => profile.id === preference.activeProviderId)) setActiveIdState(preference.activeProviderId);
    });
  }, []);
  useEffect(() => { void aiProviderRepository.hasSecret(activeId).then(setConfigured); }, [activeId]);

  function setActiveId(id: string) {
    setActiveIdState(id);
    secretRef.current?.clear();
    setConnection({ status: "idle" });
    setNotice("");
  }

  async function testConnection() {
    const key = secretRef.current?.read() || await aiProviderRepository.getSecret(activeId);
    if (!key) return setConnection({ status: "error", message: "请先填写 API Key" });
    setConnection({ status: "testing" });
    try {
      const response = await fetch("/api/test-provider", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ profile: active, sessionId: `settings-${active.id}` }) });
      const result = await response.json() as { ok: boolean; latencyMs?: number; code?: string };
      setConnection(result.ok ? { status: "success", message: `连接成功 · ${result.latencyMs ?? 0} ms` } : { status: "error", message: providerErrorMessage(result.code) });
    } catch { setConnection({ status: "error", message: "网络请求失败" }); }
  }

  async function save() {
    const secret = secretRef.current?.read() ?? "";
    if (!secret && !configured) return setNotice("请先填写 API Key");
    try {
      await aiProviderRepository.saveProfile({ ...active, enabled: true, updatedAt: new Date().toISOString() });
      const preference = await preferencesRepository.get();
      await preferencesRepository.save({ recentPlayers: preference.recentPlayers, lastSessionConfig: preference.lastSessionConfig, activeProviderId: active.id });
      if (secret) {
        const mode = await aiProviderRepository.saveSecret(activeId, secret, persist);
        secretRef.current?.clear(); setConfigured(true);
        setNotice(mode === "persistent" ? "配置已加密保存到本设备" : "当前浏览器无法安全持久化，仅本次会话使用");
      } else setNotice("配置已保存");
      setProfiles(await aiProviderRepository.listProfiles());
    } catch {
      setNotice("配置无效，请检查名称、HTTPS 地址与模型 ID");
    }
  }

  async function clear() {
    dispatchClear({ type: "confirm" });
    try {
      await aiProviderRepository.clearSecret(activeId);
      if (await aiProviderRepository.hasSecret(activeId)) throw new Error("clear-verification-failed");
      secretRef.current?.clear(); setConfigured(false); dispatchClear({ type: "success" }); setNotice("API 密钥已清空");
    } catch { dispatchClear({ type: "failure", error: "清空失败，请重试" }); }
  }

  function addCustom() {
    const profile = createCustomProfile({ name: "自定义 OpenAI Compatible", baseUrl: "https://", modelId: "" });
    setProfiles((items) => [...items, profile]); setActiveId(profile.id);
  }

  return <NeonBackground><main className="screen ai-settings"><header className="screen-header"><Link href="/" aria-label="返回首页"><Icon name="back" /></Link><h1>AI 模型设置</h1><span /></header><ThemeSelector /><ProviderSelector profiles={profiles} value={activeId} onChange={setActiveId} /><section className="settings-panel">{active.type === "custom-openai" && <label><span>提供商名称</span><input value={active.name} onChange={(event) => setProfiles((items) => items.map((item) => item.id === active.id ? { ...item, name: event.target.value } : item))} /></label>}<label><span>Base URL</span><input value={active.baseUrl} readOnly={active.type !== "custom-openai"} onChange={(event) => setProfiles((items) => items.map((item) => item.id === active.id ? { ...item, baseUrl: event.target.value } : item))} /></label><label><span>模型</span><input value={active.modelId} readOnly={active.type !== "custom-openai"} onChange={(event) => setProfiles((items) => items.map((item) => item.id === active.id ? { ...item, modelId: event.target.value } : item))} /></label><SecretInput ref={secretRef} /><label className="persist-choice"><input type="checkbox" checked={persist} onChange={(event) => setPersist(event.target.checked)} /><span>使用 Web Crypto 加密后保存到本设备</span></label><p className="settings-note">浏览器本地保存只是个人自用的便利模式：加密只保护静态存储，不等同于强机密存储。需要更高机密性时请改用服务端代理，别在共享设备上填写 Key。</p><div className="settings-actions"><Button variant="secondary" type="button" onClick={() => void testConnection()}>⚡ 测试连接</Button><Button type="button" onClick={() => void save()}>保存配置</Button></div><ConnectionStatus {...connection} />{notice && <p className="settings-notice" role="status">{notice}</p>}{active.type === "opencode-go" && <aside className="provider-note"><strong>实验性 Provider</strong><p>OpenCode Go 官方主要面向 OpenCode / 同类 coding agents。Party Night 属非典型流量，兼容性可能变化；仅在你主动选择后启用，绝不自动 fallback。</p></aside>}{active.type === "custom-openai" && <aside className="provider-note"><strong>安全限制</strong><p>仅允许 HTTPS 公网地址。服务器会拒绝本机、私网、link-local、metadata 地址和跨主机重定向。</p></aside>}<button className="custom-provider-link" type="button" onClick={addCustom}>＋ 添加自定义 OpenAI Compatible</button></section><DangerZone configured={configured} confirmOpen={clearState.confirmOpen} clearing={clearState.clearing} onOpen={() => dispatchClear({ type: "open" })} onCancel={() => dispatchClear({ type: "cancel" })} onConfirm={() => void clear()} /></main><BottomTabBar /></NeonBackground>;
}
