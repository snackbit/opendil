"use client";
import { useDocsLayout } from "fumadocs-ui/layouts/docs";
import { Menu } from "lucide-react";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { docsMenuSlotId } from "./header-nav";

const noop = () => () => {};

/**
 * Replaces the Fumadocs mobile header. On narrow screens the button that opens the docs
 * sidebar drawer sits in the site header, as it did on the Astro site, instead of a second bar.
 */
export function DocsMenuButton() {
  const { slots } = useDocsLayout();
  const target = useSyncExternalStore(
    noop,
    () => document.getElementById(docsMenuSlotId),
    () => null,
  );
  if (!target) return null;
  return createPortal(
    <slots.sidebar.trigger
      className="od-icon-button od-docs-menu"
      aria-label="Docs menu"
    >
      <Menu size={18} aria-hidden="true" />
    </slots.sidebar.trigger>,
    target,
  );
}

/** Replaces the sidebar's title slot: the site header already shows the brand. */
export function NoNavTitle() {
  return null;
}
