import { useEffect, useState } from "react";
function appearance(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
export function useSiteTheme() {
  const [theme, setTheme] = useState(appearance);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(appearance()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  return theme;
}
