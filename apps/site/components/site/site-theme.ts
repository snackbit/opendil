"use client";
import { useSyncExternalStore } from "react";

export type SiteAppearance = "light" | "dark";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function appearance(): SiteAppearance {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * The appearance the site is painted in, for the renderer's `appearance` prop and editors.
 * It reads the class next-themes writes before hydration, so it never lags a reload; the
 * server snapshot is "light", which keeps server-rendered markup stable.
 */
export function useSiteTheme(): SiteAppearance {
  return useSyncExternalStore(subscribe, appearance, () => "light");
}
