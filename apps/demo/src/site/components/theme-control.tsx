import { useCallback, useEffect, useState } from "react";
import { DropdownMenu } from "radix-ui";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@snackbit/opendil/ui";
import { ShellScope } from "./shell-scope";
type Theme = "system" | "light" | "dark";
function readTheme(): Theme {
  try {
    const value = localStorage.getItem("opendil-theme");
    if (value === "light" || value === "dark") return value;
  } catch {
    /* Storage can be disabled. */
  }
  return "system";
}
export function ThemeControl() {
  const [theme, setTheme] = useState<Theme>("system");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setTheme(readTheme());
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme, loaded]);
  const change = useCallback((value: string) => {
    if (value !== "system" && value !== "light" && value !== "dark") return;
    setTheme(value);
    try {
      localStorage.setItem("opendil-theme", value);
    } catch {
      /* Keep the in-memory preference. */
    }
  }, []);
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <ShellScope>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={"Appearance: " + theme}
          >
            <Icon size={18} />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="od-menu" sideOffset={8} align="end">
            <DropdownMenu.RadioGroup value={theme} onValueChange={change}>
              {(["light", "dark", "system"] as const).map((value) => (
                <DropdownMenu.RadioItem
                  className="od-menu-item"
                  key={value}
                  value={value}
                >
                  <DropdownMenu.ItemIndicator className="od-menu-check">
                    <Check size={14} />
                  </DropdownMenu.ItemIndicator>
                  {value[0]?.toUpperCase()}
                  {value.slice(1)}
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </ShellScope>
  );
}
