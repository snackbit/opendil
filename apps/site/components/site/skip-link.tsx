"use client";
import type { MouseEvent } from "react";

/**
 * Moves focus to the page's main landmark, past the header and, on docs pages, past the sidebar.
 * Without JavaScript the link still jumps to the content wrapper.
 */
function skipToMain(event: MouseEvent<HTMLAnchorElement>) {
  const main = document.querySelector<HTMLElement>("#od-content main");
  if (!main) return;
  event.preventDefault();
  if (!main.hasAttribute("tabindex")) main.tabIndex = -1;
  main.focus();
}

export function SkipLink() {
  return (
    <a className="od-skip" href="#od-content" onClick={skipToMain}>
      Skip to content
    </a>
  );
}
