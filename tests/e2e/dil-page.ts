import { expect, type Page, type Locator } from "@playwright/test";
export async function replaceSource(page: Page, editor: Locator, text: string) {
  await editor.focus();
  await editor.press("ControlOrMeta+A");
  await page.keyboard.insertText(text);
}
/**
 * Closes the demo settings popover with Escape. The popover returns focus to its trigger
 * after its exit animation, so wait for that before typing elsewhere; otherwise the late
 * focus move can steal keystrokes meant for the source editor.
 */
export async function closeSettings(page: Page, scope: Page | Locator = page) {
  await page.keyboard.press("Escape");
  await expect(
    scope.getByRole("button", { name: "Demo settings", exact: true }),
  ).toBeFocused();
}
export async function openShowcase(page: Page, query = "") {
  await page.goto("/demo/showcase/" + query);
  // Core containment regressions deliberately exercise the package's iframe mode.
  await page
    .getByRole("button", { name: "Demo settings", exact: true })
    .click();
  await page.getByRole("radio", { name: "Iframe", exact: true }).click();
  await closeSettings(page);
  await expect(page.locator("iframe")).toBeVisible();
}
/**
 * Counts programmatic scrolls of the preview pane after the page's first wheel event.
 * Install before navigation; read the count with `paneScrollsAfterWheel(page)`.
 */
export async function watchPaneScrollsAfterWheel(page: Page) {
  await page.addInitScript(() => {
    let wheeled = false;
    let count = 0;
    addEventListener("wheel", () => (wheeled = true), {
      capture: true,
      passive: true,
    });
    const counts = (element: Element) =>
      wheeled && element.getAttribute("aria-label") === "Streaming preview";
    const scrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function (this: Element, ...args: unknown[]) {
      if (counts(this)) count++;
      return Reflect.apply(scrollTo, this, args) as void;
    };
    const scrollTop = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "scrollTop",
    );
    Object.defineProperty(Element.prototype, "scrollTop", {
      ...scrollTop,
      set(this: Element, value: number) {
        if (counts(this)) count++;
        scrollTop?.set?.call(this, value);
      },
    });
    Reflect.set(window, "paneScrollsAfterWheel", () => count);
  });
}
export function paneScrollsAfterWheel(page: Page) {
  return page.evaluate(() =>
    (Reflect.get(window, "paneScrollsAfterWheel") as () => number)(),
  );
}
/** The workbench preview pane: the scroll container around the rendered document. */
export function previewPane(page: Page) {
  return page.getByLabel("Streaming preview", { exact: true });
}
/** Scrolls the preview pane, as a reader would, and waits for the next paint. */
export async function scrollPreview(page: Page, top: number) {
  await previewPane(page).evaluate(
    (element, top) =>
      new Promise<void>((done) => {
        element.scrollTo(0, top);
        requestAnimationFrame(() => requestAnimationFrame(() => done()));
      }),
    top,
  );
}
/** Distance between `target`'s bottom plus `padding` and the bottom of the preview pane. */
export function tailGap(target: Locator, padding = 0) {
  return target.evaluate((element, padding) => {
    const pane = element.ownerDocument.querySelector(".od-hero-output");
    if (!pane) throw new Error("Missing preview pane");
    const box = pane.getBoundingClientRect();
    const bottom = Math.min(
      innerHeight,
      box.top + pane.clientTop + pane.clientHeight,
    );
    return Math.abs(element.getBoundingClientRect().bottom + padding - bottom);
  }, padding);
}
/** Page object: fixture controls belong to the host; document controls belong to its frame. */
export function dilPage(page: Page) {
  const frame = page.frameLocator("iframe");
  return {
    locator: frame.locator.bind(frame),
    getByText: frame.getByText.bind(frame),
    getByLabel: frame.getByLabel.bind(frame),
    getByRole(
      role: Parameters<Page["getByRole"]>[0],
      options?: Parameters<Page["getByRole"]>[1],
    ) {
      const name = options?.name;
      const host =
        typeof name === "string" &&
        [
          "Replay",
          "Pause",
          "Resume",
          "Finish",
          "Showcase",
          "Large document",
          "Long list",
          "Long table",
          "1×",
          "4×",
          "16×",
        ].includes(name);
      return host
        ? page.getByRole(role, options)
        : frame.getByRole(role, options);
    },
  };
}
