import { expect, test } from "@playwright/test";
import { redirects } from "../../apps/site/redirects";
import { basePathOf } from "./site-helpers";

for (const { source, destination, permanent } of redirects) {
  test(`${source} redirects to ${destination}`, async ({
    request,
    baseURL,
  }) => {
    const base = basePathOf(baseURL);
    const relative = source.slice(1);

    const direct = await request.get(relative, { maxRedirects: 0 });
    expect(direct.status()).toBe(permanent ? 308 : 307);
    expect(direct.headers()["location"]).toBe(base + destination);

    // The destination is a real page, also when the request omits the trailing slash.
    for (const path of [relative, relative.replace(/\/$/, "")]) {
      const followed = await request.get(path);
      expect(followed.status(), path).toBe(200);
      expect(new URL(followed.url()).pathname, path).toBe(base + destination);
      expect(followed.headers()["content-type"], path).toMatch(/^text\/html/);
    }
  });
}

/**
 * Every URL the Astro site published (its build output, minus Pagefind's search index
 * and 404.html). The list is frozen history: it must not follow later catalog changes.
 */
const astroRoutes = [
  "./",
  "favicon.svg",
  "sitemap-index.xml",
  "sitemap-0.xml",
  "opendil/frame.html",
  "opendil/frame.js",
  "agent-spec/",
  "demo/",
  ...[
    "release-planner",
    "service-console",
    "team-budget",
    "deployment",
    "pricing",
    "form",
    "tabs",
    "charts",
    "graph",
    "table",
    "code",
    "media",
    "overlays",
    "mermaid",
    "vector",
    "layout",
    "status",
    "showcase",
    "large",
    "list",
    "long-table",
    "isolation",
    "customization",
  ].map((id) => `demo/${id}/`),
  "docs/",
  ...[
    "getting-started",
    "streaming",
    "language",
    "renderer",
    "isolation",
    "ui",
  ].map((name) => `docs/${name}/`),
  ...[
    "actions",
    "charts",
    "code",
    "diagrams",
    "inputs",
    "layout",
    "media",
    "overlays",
    "tables",
    "text",
  ].map((name) => `docs/components/${name}/`),
  ...["overview", "styling", "components", "configuration"].map(
    (name) => `docs/customization/${name}/`,
  ),
];

test("every URL the Astro site published still resolves", async ({
  request,
}) => {
  const failures: string[] = [];
  for (const path of astroRoutes) {
    const response = await request.get(path);
    if (response.status() !== 200)
      failures.push(`${path} -> ${response.status()} ${response.url()}`);
  }
  expect(failures).toEqual([]);
});

/**
 * Heading slugs that old links point at. Browsers carry the #fragment across a redirect,
 * so each must still name an element on the page the old URL now lands on.
 */
const keptAnchors = [
  {
    from: "docs/customization/styling/",
    to: "/docs/theming/",
    ids: ["class-overrides", "shadow-dom-css", "tailwind-v4"],
  },
  {
    from: "docs/customization/components/",
    to: "/docs/custom-components/",
    ids: ["register-components", "limitations", "iframe-restrictions"],
  },
  {
    from: "docs/customization/configuration/",
    to: "/docs/custom-components/",
    ids: ["named-slots"],
  },
  {
    from: "docs/getting-started/",
    to: "/docs/getting-started/",
    ids: ["install"],
  },
];

for (const { from, to, ids } of keptAnchors) {
  test(`old anchors on ${from} still land on a heading`, async ({
    page,
    baseURL,
  }) => {
    const base = basePathOf(baseURL);
    for (const id of ids) {
      await page.goto(`${from}#${id}`);
      await expect(page).toHaveURL(new URL(`${base}${to}#${id}`, baseURL).href);
      await expect(page.locator(`[id="${id}"]`), id).toBeAttached();
    }
  });
}
