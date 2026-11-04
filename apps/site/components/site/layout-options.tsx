import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

/**
 * Options for Fumadocs layouts. The root layout's SiteHeader already provides navigation,
 * search, the GitHub link, and the theme control, so the layouts render none of their own.
 */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: { enabled: false },
    themeSwitch: { enabled: false },
    searchToggle: { enabled: false },
  };
}
