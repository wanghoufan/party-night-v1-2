"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/Icon";

type Theme = "dark" | "light";
const STORAGE_KEY = "party-night-theme";
const THEME_EVENT = "party-night-theme-change";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f7f5ff" : "#080b1a");
}

function currentTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return document.documentElement.dataset.theme === "light" ? "light" : "dark";
  }
}

export function ThemeSelector() {
  const theme = useSyncExternalStore(
    (onChange) => { window.addEventListener(THEME_EVENT, onChange); return () => window.removeEventListener(THEME_EVENT, onChange); },
    currentTheme,
    () => "dark" as Theme,
  );

  useEffect(() => { applyTheme(theme); }, [theme]);

  function choose(next: Theme) {
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <section className="appearance-panel" aria-labelledby="appearance-heading">
      <div>
        <h2 id="appearance-heading">外观</h2>
        <p>选择更适合当前环境的显示模式</p>
      </div>
      <div className="theme-selector" role="group" aria-label="颜色模式">
        <button type="button" aria-pressed={theme === "dark"} onClick={() => choose("dark")}><Icon name="moon" /><span>深色</span></button>
        <button type="button" aria-pressed={theme === "light"} onClick={() => choose("light")}><Icon name="sun" /><span>浅色</span></button>
      </div>
    </section>
  );
}
