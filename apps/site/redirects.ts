/** Permanent moves from the Astro site's URLs, plus the playground entry point. Next.js adds the base path. */
export interface SiteRedirect {
  source: string;
  destination: string;
  permanent: boolean;
}

export const redirects: SiteRedirect[] = [
  { source: "/demo/", destination: "/demo/deployment/", permanent: false },
  { source: "/agent-spec/", destination: "/docs/agent-spec/", permanent: true },
  {
    source: "/docs/isolation/",
    destination: "/docs/rendering-modes/",
    permanent: true,
  },
  {
    source: "/docs/customization/overview/",
    destination: "/docs/theming/",
    permanent: true,
  },
  {
    source: "/docs/customization/styling/",
    destination: "/docs/theming/",
    permanent: true,
  },
  {
    source: "/docs/customization/components/",
    destination: "/docs/custom-components/",
    permanent: true,
  },
  {
    source: "/docs/customization/configuration/",
    destination: "/docs/custom-components/",
    permanent: true,
  },
];

/** Files the Astro site published under other names: its favicon and its sitemaps. */
export const assetRedirects: SiteRedirect[] = [
  { source: "/favicon.svg", destination: "/icon.svg", permanent: true },
  {
    source: "/sitemap-index.xml",
    destination: "/sitemap.xml",
    permanent: true,
  },
  { source: "/sitemap-0.xml", destination: "/sitemap.xml", permanent: true },
];

/**
 * The raw full spec at /agent-spec.full.md links its siblings by file name, which resolve
 * next to it. These point at Markdown files, not pages, so they are listed separately.
 */
export const specRedirects: SiteRedirect[] = [
  { source: "/genui.agent.md", destination: "/agent-spec.md", permanent: true },
  {
    source: "/genui.agent.full.md",
    destination: "/agent-spec.full.md",
    permanent: true,
  },
  {
    source: "/genui.examples.md",
    destination: "/agent-spec.examples.md",
    permanent: true,
  },
];
