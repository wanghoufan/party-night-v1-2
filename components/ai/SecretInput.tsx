"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

export interface SecretInputHandle {
  read: () => string;
  clear: () => void;
}

export const SecretInput = forwardRef<SecretInputHandle>(function SecretInput(_, ref) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({
    read: () => inputRef.current?.value ?? "",
    clear: () => { if (inputRef.current) inputRef.current.value = ""; },
  }), []);
  useEffect(() => () => { if (inputRef.current) inputRef.current.value = ""; }, []);
  return <label className="secret-field"><span>API Key</span><span className="secret-field__input"><input ref={inputRef} type={visible ? "text" : "password"} defaultValue="" autoComplete="off" spellCheck={false} placeholder="sk-••••••••••••" aria-label="API Key" /><button type="button" aria-label={visible ? "隐藏 API Key" : "显示 API Key"} onClick={() => setVisible((shown) => !shown)}><Icon name="eye" /></button></span></label>;
});
