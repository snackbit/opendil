"use client";
import {
  RootProvider,
  type RootProviderProps,
} from "fumadocs-ui/provider/next";
import { lazy, useSyncExternalStore, type ReactNode } from "react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const subscribeNever = () => () => {};

/** The modifier label shown in the header search button; "⌘" until hydration, like Fumadocs. */
function ModifierKey() {
  const ctrl = useSyncExternalStore(
    subscribeNever,
    () => /Windows|Linux/i.test(navigator.userAgent),
    () => false,
  );
  return ctrl ? "Ctrl" : "⌘";
}

/**
 * Ctrl/Cmd+K opens search only where the header shows it: under /docs. Elsewhere the keys keep
 * their browser meaning. Inside docs it also fires from inputs, as Fumadocs intends; editors that
 * bind Ctrl+K chords (Monaco) call preventDefault, which the Fumadocs listener respects.
 */
const hotKey = [
  {
    key: (event: KeyboardEvent) =>
      (event.metaKey || event.ctrlKey) &&
      window.location.pathname.startsWith(`${basePath}/docs`),
    display: <ModifierKey />,
  },
  { key: "k", display: "K" },
];

/** Loaded on first open: the dialog and its search engine stay off pages nobody searches. */
const search = {
  SearchDialog: lazy(() => import("./search-dialog")),
  preload: false,
  hotKey,
} satisfies RootProviderProps["search"];

/** next-themes options: the bridge between the theme control, Fumadocs, and site components. */
const theme = {
  // Fumadocs styles key off the class; site components and Monaco observe data-theme.
  attribute: ["class", "data-theme"],
  storageKey: "opendil-theme",
  defaultTheme: "system",
  enableSystem: true,
  disableTransitionOnChange: true,
  // Typing "d" inside a generated interface must not flip the site theme.
  hotKey: false,
} satisfies RootProviderProps["theme"];

export function SiteProvider({ children }: { children: ReactNode }) {
  return (
    <RootProvider theme={theme} search={search}>
      {children}
    </RootProvider>
  );
}
