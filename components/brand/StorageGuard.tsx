"use client";

import { useEffect } from "react";
import { reconcileSessionStore } from "@/lib/storage/session-maintenance";

/**
 * 启动时的本地数据 guard（T201）：跑一次事务化迁移 + 版本错位检查。
 * 只读不动更高版本写的数据、坏记录进隔离区、绝不 clear；任何失败都静默，绝不影响首屏渲染。
 */
export function StorageGuard() {
  useEffect(() => { void reconcileSessionStore(); }, []);
  return null;
}
