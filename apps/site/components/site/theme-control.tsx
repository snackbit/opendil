"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback } from "react";
import { useSiteTheme } from "./site-theme";

/**
 * Switches the whole site between light and dark; next-themes stores the choice. Until a visitor
 * picks one, the site follows the system preference. Both icons render and CSS shows the one for
 * the painted theme (moon in light, sun in dark), so the server markup never mismatches.
 */
export function ThemeControl() {
  const { setTheme } = useTheme();
  const current = useSiteTheme();
  const next = current === "dark" ? "light" : "dark";
  const toggle = useCallback(() => setTheme(next), [setTheme, next]);
  return (
    <button
      type="button"
      className="od-icon-button od-theme-toggle"
      aria-label={`Switch to ${next} theme`}
      onClick={toggle}
    >
      <Moon className="od-theme-icon-light" size={18} aria-hidden="true" />
      <Sun className="od-theme-icon-dark" size={18} aria-hidden="true" />
    </button>
  );
}
