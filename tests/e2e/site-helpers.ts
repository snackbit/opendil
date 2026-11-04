import { existsSync, readFileSync } from "node:fs";
import type { Page, Request } from "@playwright/test";

/** The deployment base path ("" or "/opendil"), taken from the configured baseURL. */
export function basePathOf(baseURL: string | undefined): string {
  return new URL(baseURL ?? "/").pathname.replace(/\/$/, "");
}

/** Docs content, read relative to the repository root where Playwright runs. */
const docsContent = "apps/site/content/docs/";

/**
 * The docs pages a meta.json lists, in sidebar order, relative to the base URL.
 * Separators ("---Guides---") and the rest marker ("...") name no page. A folder entry
 * adds its own page (index.mdx) and the pages its meta.json lists; an extracted folder
 * ("...components") adds only the listed pages. Listed pages that have no file yet are
 * kept, so a missing page fails the specs instead of dropping out of them.
 */
function pagesListedIn(folder: string): string[] {
  const meta = JSON.parse(
    readFileSync(docsContent + folder + "meta.json", "utf8"),
  ) as { pages?: string[] };
  return (meta.pages ?? []).flatMap((entry) => {
    if (/^---.*---$/.test(entry) || entry === "..." || entry.startsWith("["))
      return [];
    const extracted = entry.startsWith("...");
    const name = entry.replace(/^\.\.\./, "");
    if (name === "index") return [`docs/${folder}`];
    if (existsSync(docsContent + folder + name + "/meta.json"))
      return [
        ...(extracted ? [] : [`docs/${folder}${name}/`]),
        ...pagesListedIn(`${folder}${name}/`),
      ];
    return [`docs/${folder}${name}/`];
  });
}

/** Every docs page in the information architecture, taken from content/docs/meta.json. */
export const docsPages = pagesListedIn("");

/** Requests still in flight per tracked page, read by settle(). */
const openRequests = new WeakMap<Page, Set<Request>>();

/** Starts counting the page's in-flight requests (all frames) so settle() can wait for quiet. */
export function trackRequests(page: Page): void {
  if (openRequests.has(page)) return;
  const open = new Set<Request>();
  openRequests.set(page, open);
  page.on("request", (request) => open.add(request));
  page.on("requestfinished", (request) => open.delete(request));
  page.on("requestfailed", (request) => open.delete(request));
  // Next.js leaves the body of a failed (404) prefetch open; the status is reported elsewhere.
  page.on("response", (response) => {
    if (response.status() >= 400) open.delete(response.request());
  });
}

/**
 * Collects uncaught exceptions, console errors (including hydration errors), and
 * same-origin responses with an error status. The array fills while the page runs.
 */
export function watchPageProblems(
  page: Page,
  baseURL: string | undefined,
): string[] {
  const origin = new URL(baseURL ?? "/").origin;
  const problems: string[] = [];
  trackRequests(page);
  page.on("pageerror", (error) => problems.push("pageerror: " + error.message));
  page.on("console", (message) => {
    if (message.type() === "error")
      problems.push(`console (${page.url()}): ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && new URL(response.url()).origin === origin)
      problems.push(`${response.status()} ${response.url()}`);
  });
  return problems;
}

/**
 * Waits until no request has been in flight for 500 ms. Unlike the one-shot
 * "networkidle" load state this also covers work started later (scrolling, prefetch).
 * A request still open at the deadline is named in the error.
 */
export async function settle(page: Page, timeout = 10_000): Promise<void> {
  trackRequests(page);
  const open = openRequests.get(page)!;
  const deadline = Date.now() + timeout;
  let quietSince = Date.now();
  while (Date.now() - quietSince < 500) {
    if (open.size > 0) quietSince = Date.now();
    if (Date.now() > deadline)
      throw new Error(
        `network still busy after ${timeout} ms; open requests: ` +
          [...open].map((request) => request.url()).join(", "),
      );
    await page.waitForTimeout(50);
  }
}

/** Scrolls to the bottom in viewport steps so lazy islands mount and in-view links prefetch. */
export async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (
      let y = 0;
      y < document.documentElement.scrollHeight;
      y += innerHeight
    ) {
      scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    scrollTo(0, document.documentElement.scrollHeight);
  });
}
