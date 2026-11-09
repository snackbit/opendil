// @vitest-environment happy-dom
import { act, createElement, lazy, Suspense, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownRenderer } from "../../packages/opendil/src/entries/markdown";
import { serializeRenderedDocument } from "../../packages/opendil/src/entries/serialize";
import type { DilButtonProps } from "../../packages/opendil/src/dil/ui-primitives";
import {
  DilRenderer,
  preloadHostRenderer,
} from "../../packages/opendil/src/dil/dil-renderer";
import { installInlineWorkers } from "../../packages/opendil/src/testing";
import type {
  DilMarkdownCodeProps,
  DilMarkdownComponents,
  DilMarkdownHeadingProps,
  DilMarkdownImageProps,
  DilMarkdownLinkProps,
} from "../../packages/opendil/src/dil/markdown/markdown-components";

// happy-dom cannot lay out a diagram; the stub stands in for Mermaid's renderer.
const mermaidRender = vi.hoisted(() =>
  vi.fn((_id: string, _source: string) =>
    Promise.resolve({ svg: '<svg><g data-drawn="true"></g></svg>' }),
  ),
);
vi.mock("mermaid", () => ({
  default: { initialize: () => {}, render: mermaidRender },
}));
const links: Omit<DilMarkdownLinkProps, "children">[] = [];
const codes: Omit<DilMarkdownCodeProps, "Default">[] = [];
const HOST: DilMarkdownComponents = {
  link: ({ href, title, streaming, children }: DilMarkdownLinkProps) => {
    links.push({ href, title, streaming });
    return createElement("a", { href, "data-host-link": "" }, children);
  },
  image: ({ src, alt }: DilMarkdownImageProps) =>
    createElement("img", { src, alt, "data-host-image": "" }),
  code: ({ Default, ...props }: DilMarkdownCodeProps) => {
    codes.push(props);
    return props.language === "chart"
      ? createElement("figure", { "data-host-chart": "" }, props.source)
      : createElement(Default, props);
  },
  heading: ({ level, children }: DilMarkdownHeadingProps) =>
    createElement("h" + level, { "data-heading-level": level }, children),
  blockquote: ({ children }: { children: ReactNode }) =>
    createElement("aside", { "data-host-quote": "" }, children),
  table: ({ children }: { children: ReactNode }) =>
    createElement(
      "div",
      { "data-host-table": "" },
      createElement("table", null, children),
    ),
};
const DOCUMENT = [
  "# One",
  "#### Four",
  "###### Six",
  'See [the docs](https://example.com/docs "Docs") and ![chart](https://example.com/a.png).',
  "Run `npm test` <Button onClick={go}/> {1+1}.",
  "> Quoted",
  "| A | B |\n| - | - |\n| 1 | 2 |",
  '```chart\n{"type":"bar"}\n```',
  "```js\nconst x = 1;\n```",
  "```\nplain\n```",
  "- first\n- second\n\n1. ordered",
  "[empty]() trailing",
].join("\n\n");
let mount: HTMLDivElement;
let root: Root;
beforeEach(() => {
  links.length = 0;
  codes.length = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mount = document.createElement("div");
  document.body.append(mount);
  root = createRoot(mount);
});
afterEach(async () => {
  await act(() => root.unmount());
  mount.remove();
  vi.unstubAllGlobals();
});

describe("MarkdownRenderer", () => {
  it("renders Markdown with stock defaults: inert links, no images, literal DIL", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownRenderer, { text: DOCUMENT }),
    );
    expect(html).toContain('data-dil-theme="stock"');
    expect(html).toContain("<h4>Four</h4>");
    expect(html).toContain("<h6>Six</h6>");
    expect(html).toContain("<span>the docs</span>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;Button onClick={go}/&gt; {1+1}");
    expect(html).toContain("<blockquote>");
    const dom = document.createElement("div");
    dom.innerHTML = html;
    // The only buttons are code block controls; the DIL tag stays text.
    expect(
      [...dom.querySelectorAll("button")].map((button) =>
        button.getAttribute("aria-label"),
      ),
    ).toEqual(Array(3).fill(["Word wrap", "Copy code"]).flat());
    // Every fence, with or without a language, gets the CodeBlock frame.
    expect(
      [...dom.querySelectorAll(".dil-code-block")].map((block) => [
        block.getAttribute("data-dil-copy-language"),
        block.querySelector("pre")?.textContent,
      ]),
    ).toEqual([
      ["chart", '{"type":"bar"}'],
      ["js", "const x = 1;"],
      ["", "plain"],
    ]);
  });
  it("hands links, images, code, headings, quotes, and tables to host overrides", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownRenderer, {
        text: DOCUMENT,
        markdownComponents: HOST,
        theme: "inherit",
        appearance: "dark",
        className: "host-root",
        tokens: { "--font-dil": "serif" },
      }),
    );
    expect(html).toContain('data-dil-theme="inherit"');
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain("--font-dil:serif");
    expect(html).toContain('<h4 data-heading-level="4">Four</h4>');
    expect(html).toContain(
      '<a href="https://example.com/docs" data-host-link="">the docs</a>',
    );
    expect(links).toEqual([
      { href: "https://example.com/docs", title: "Docs", streaming: false },
    ]);
    expect(html).toContain(
      '<img src="https://example.com/a.png" alt="chart" data-host-image=""/>',
    );
    expect(html).toContain('<aside data-host-quote="">');
    expect(html).toContain('<div data-host-table=""><table>');
    expect(html).toContain(
      '<figure data-host-chart="">{&quot;type&quot;:&quot;bar&quot;}</figure>',
    );
    expect(codes).toEqual([
      { language: "", source: "npm test", block: false, streaming: false },
      {
        language: "chart",
        source: '{"type":"bar"}',
        block: true,
        streaming: false,
      },
      { language: "js", source: "const x = 1;", block: true, streaming: false },
      { language: "", source: "plain", block: true, streaming: false },
    ]);
    // A link without a destination stays inert.
    expect(html).toContain("<span>empty</span>");
    expect(html).toMatch(/<ul>\s*<li>first<\/li>/);
    // Default is the stock rendering, including the code block frame.
    expect(html).toContain("<code>npm test</code>");
    const dom = document.createElement("div");
    dom.innerHTML = html;
    const js = dom.querySelector('[data-dil-copy-language="js"]');
    expect(js?.classList.contains("dil-code-block")).toBe(true);
    expect(js?.querySelector("pre")?.textContent).toBe("const x = 1;");
    // The host's chart override replaced its fence's frame.
    expect(dom.querySelector('[data-dil-copy-language="chart"]')).toBeNull();
  });
  it("completes unfinished formatting while streaming and accepts replaced text", async () => {
    await act(() =>
      root.render(
        createElement(MarkdownRenderer, {
          text: "Intro\n\nSome **bold",
          isStreaming: true,
          markdownComponents: HOST,
        }),
      ),
    );
    expect(mount.querySelector("strong")?.textContent).toBe("bold");
    await act(() =>
      root.render(
        createElement(MarkdownRenderer, {
          text: "Intro\n\n[link](https://example.com)",
          isStreaming: true,
          markdownComponents: HOST,
        }),
      ),
    );
    expect(links.at(-1)).toEqual({
      href: "https://example.com",
      title: undefined,
      streaming: true,
    });
    await act(() =>
      root.render(createElement(MarkdownRenderer, { text: "Replaced" })),
    );
    expect(mount.textContent).toBe("Replaced");
    for (const [text, isStreaming] of [
      ["Replaced text", false],
      ["Replaced text grows", true],
      ["Replaced text grows again", false],
    ] as const) {
      await act(() =>
        root.render(createElement(MarkdownRenderer, { text, isStreaming })),
      );
      expect(
        [...mount.querySelectorAll("p")].map(
          (paragraph) => paragraph.textContent,
        ),
      ).toEqual([text]);
    }
  });
  it("renders stock Mermaid fences lazily, with or without an override", async () => {
    await act(() =>
      root.render(
        createElement(MarkdownRenderer, {
          text: "```mermaid\ngraph TD; A-->B\n```",
        }),
      ),
    );
    const drawn = () =>
      mount.querySelector('[aria-label="Mermaid diagram"] [data-drawn]');
    await vi.waitFor(() => expect(drawn()).not.toBeNull());
    expect(mount.querySelector(".dil-code-block")).toBeNull();
    await act(() =>
      root.render(
        createElement(MarkdownRenderer, {
          text: "```mermaid\ngraph TD; A-->B\n```",
          markdownComponents: {
            code: ({ Default, ...props }) => createElement(Default, props),
          },
        }),
      ),
    );
    await vi.waitFor(() => expect(drawn()).not.toBeNull());
  });
});

describe("MarkdownRenderer inline mode", () => {
  it("renders phrasing content inside spans, without block wrappers", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownRenderer, {
        inline: true,
        theme: "inherit",
        text: "# Head **bold** [link](https://example.com)\n\n- item `code`\n\n```mermaid\ngraph TD\n```\n\n> quote",
        markdownComponents: HOST,
      }),
    );
    expect(html).toMatch(/^<span class="dil-scope"/);
    expect(html).toContain('data-dil-inline="true"');
    expect(html).not.toMatch(
      /<(div|p|section|h1|ul|li|pre|blockquote|table)[\s>]/,
    );
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('<a href="https://example.com" data-host-link="">');
    expect(html).toContain("<code>code</code>");
    // A diagram is a block, so its source shows as code.
    expect(html).toContain("graph TD");
    expect(html).toContain('<span data-dil-portals=""></span>');
  });
  it("keeps the source's line breaks between blocks, so pre-wrap shows paragraphs", async () => {
    await act(() =>
      root.render(
        createElement(MarkdownRenderer, {
          inline: true,
          text: "# Plan\nFirst **one**.\n\nThen two.\n\n\n- a\n- b\n\nDone.",
        }),
      ),
    );
    const inline = mount.querySelector('[data-dil-inline="true"]');
    expect(inline?.querySelector("p, div, ul, li, h1")).toBeNull();
    expect(inline?.textContent).toBe(
      "Plan\nFirst one.\n\nThen two.\n\n\na\nb\n\nDone.",
    );
    // Under normal white space the breaks collapse, so words stay apart.
    expect(inline?.textContent?.replace(/\s+/g, " ")).toBe(
      "Plan First one. Then two. a b Done.",
    );
  });
});

describe("MarkdownRenderer fenced code", () => {
  const HostButton = ({ variant, size, ...props }: DilButtonProps) =>
    createElement("button", {
      ...props,
      "data-host-button": `${variant ?? ""}:${size ?? ""}`,
    });
  it("gives fences the CodeBlock frame with the host's primitives and copies the shown source", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await act(() =>
      root.render(
        createElement(MarkdownRenderer, {
          text: "```ts\n  const indented = 1;\n```",
          uiPrimitives: { Button: HostButton },
        }),
      ),
    );
    const block = mount.querySelector(".dil-code-block");
    expect(block?.getAttribute("data-dil-copy-language")).toBe("ts");
    expect(block?.textContent).toContain("ts");
    const copy = mount.querySelector<HTMLButtonElement>(
      'button[aria-label="Copy code"]',
    );
    expect(copy?.dataset.hostButton).toBe("ghost:icon-sm");
    await act(() => copy?.click());
    // Fenced code keeps its leading indentation.
    expect(writeText).toHaveBeenCalledWith("  const indented = 1;");
    expect(mount.querySelector('[role="status"]')?.textContent).toBe(
      "Code copied.",
    );
  });
  it("waits for a streaming fence to finish before it can be copied", async () => {
    const render = (isStreaming: boolean) =>
      act(() =>
        root.render(
          createElement(MarkdownRenderer, {
            text: "Intro\n\n```sh\nnpm test\n```",
            isStreaming,
          }),
        ),
      );
    const copy = () =>
      mount.querySelector<HTMLButtonElement>('button[aria-label="Copy code"]');
    await render(true);
    expect(copy()?.disabled).toBe(true);
    await render(false);
    expect(copy()?.disabled).toBe(false);
  });
});

describe("Mermaid fences beyond the limits", () => {
  const notice = () => mount.querySelector('[role="alert"]');
  it.each([
    [
      "oversized",
      "graph TD\n" + Array(1000).fill("  A --> B").join("\n"),
      "Diagram source is longer than 8,192 characters.",
    ],
    [
      "unsupported",
      "%%{init: {}}%%\ngraph TD\n  A --> B",
      "Diagram uses a Mermaid feature that is not supported.",
    ],
    [
      "edges",
      "graph TD\n  A --> B",
      "Diagram has more than 100 edges.",
      "Edge limit exceeded. 101 edges found, but the limit is 100.",
    ],
    [
      "unsupported",
      'flowchart TD\nA@{ img: "https://audit.invalid/pixel.svg" }',
      "Diagram uses a Mermaid feature that is not supported.",
    ],
    [
      "invalid",
      "graph TD\n  A -->",
      "Diagram is incomplete or invalid.",
      "Parse error on line 2",
    ],
  ])(
    "explains a %s diagram and shows its source with copy",
    async (problem, source, reason, failure?: string) => {
      const rendered = mermaidRender.mock.calls.length;
      if (failure) mermaidRender.mockRejectedValueOnce(new Error(failure));
      await act(() =>
        root.render(
          createElement(MarkdownRenderer, {
            text: "```mermaid\n" + source + "\n```",
          }),
        ),
      );
      await vi.waitFor(() => expect(notice()).not.toBeNull());
      expect(notice()?.textContent).toBe(
        reason + " Its source is shown instead.",
      );
      if (problem === "unsupported" || problem === "oversized")
        expect(mermaidRender.mock.calls).toHaveLength(rendered);
      const diagram = mount.querySelector('[aria-label="Mermaid diagram"]');
      expect(
        diagram
          ?.querySelector("[data-dil-mermaid-problem]")
          ?.getAttribute("data-dil-mermaid-problem"),
      ).toBe(problem);
      expect(diagram?.querySelector("pre")?.textContent).toBe(source);
      expect(
        diagram?.querySelector('button[aria-label="Copy code"]'),
      ).not.toBeNull();
      // Copying the message keeps the diagram's fence once.
      expect(serializeRenderedDocument(mount).markdown).toBe(
        "```mermaid\n" + source + "\n```",
      );
    },
  );
});

describe("host URL policy", () => {
  const scheme = (url: string) =>
    url.startsWith("sandbox:") || url.startsWith("https:") ? url : undefined;
  it("admits schemes the default policy drops, and drops what the host refuses", () => {
    const seen: [string, string][] = [];
    const html = renderToStaticMarkup(
      createElement(MarkdownRenderer, {
        text: "[file](sandbox:/mnt/data/a.csv) [web](https://example.com) [js](javascript:alert(1)) ![img](sandbox:/a.png)",
        markdownComponents: {
          ...HOST,
          urlTransform: (url, attribute) => {
            seen.push([url, attribute]);
            return scheme(url);
          },
        },
      }),
    );
    expect(html).toContain(
      '<a href="sandbox:/mnt/data/a.csv" data-host-link="">',
    );
    expect(html).toContain('<a href="https://example.com" data-host-link="">');
    expect(html).toContain("<span>js</span>");
    expect(html).toContain('<img src="sandbox:/a.png" alt="img"');
    expect(seen).toContainEqual(["sandbox:/a.png", "src"]);
    expect(seen).toContainEqual(["javascript:alert(1)", "href"]);
  });
  it("keeps the safe default without a host policy", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownRenderer, {
        text: "[file](sandbox:/mnt/data/a.csv) [web](https://example.com)",
        markdownComponents: HOST,
      }),
    );
    expect(html).toContain("<span>file</span>");
    expect(html).toContain('<a href="https://example.com" data-host-link="">');
  });
});

describe("Markdown overrides in DIL prose", () => {
  let uninstall: () => void;
  beforeEach(() => {
    vi.stubGlobal("__DIL_PARSER_WORKER__", "");
    vi.stubGlobal("__DIL_VM_WORKER__", "");
    uninstall = installInlineWorkers();
  });
  afterEach(() => uninstall());
  it("substitutes expressions in every heading level and keeps them out of URLs", async () => {
    await act(() =>
      root.render(
        createElement(DilRenderer, {
          mode: "host",
          showStatus: false,
          markdownComponents: HOST,
          text: [
            '#### Four {"a"}',
            '##### Five {"b"}',
            '###### Six {"c"}',
            '~~gone {"d"}~~',
            '[safe](https://example.com "Tip {"t"}") [unsafe](https://example.com/{"x"}) ![pic](https://example.com/{"y"}.png) ![alt {"z"}](https://example.com/z.png)',
          ].join("\n\n"),
        }),
      ),
    );
    await vi.waitFor(() =>
      expect(mount.querySelector("h6")?.textContent).toBe("Six c"),
    );
    expect(mount.querySelector("h4")?.textContent).toBe("Four a");
    expect(mount.querySelector("h5")?.dataset.headingLevel).toBe("5");
    expect(mount.querySelector("del")?.textContent).toBe("gone d");
    expect(mount.textContent).not.toContain("DILX");
    expect(links.map((link) => link.href)).toEqual(["https://example.com"]);
    // Attributes are not substituted, so placeholders never reach the host.
    expect(links.map((link) => link.title)).toEqual(["Tip "]);
    expect(mount.textContent).toContain("unsafe");
    // Only the image whose URL is literal reaches the host, without placeholders.
    expect(
      [...mount.querySelectorAll("img")].map((image) => [image.src, image.alt]),
    ).toEqual([["https://example.com/z.png", "alt "]]);
  });
  it("resumes a lazy host override that suspends in a complete document's first render", async () => {
    // A synchronous act(), as in Testing Library's render(), around the
    // first render: retries must not depend on act's queue.
    await preloadHostRenderer();
    const Lazy = lazy(() =>
      Promise.resolve({ default: () => createElement("b", null, "loaded") }),
    );
    const code = () =>
      createElement(
        Suspense,
        { fallback: createElement("i", null, "loading") },
        createElement(Lazy),
      );
    act(() =>
      root.render(
        createElement(DilRenderer, {
          mode: "host",
          text: "```chart\nx\n```",
          markdownComponents: { code },
        }),
      ),
    );
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", false);
    await vi.waitFor(() => expect(mount.textContent).toContain("loaded"));
  });
  it("never gives an expression URL to the host's URL policy", async () => {
    const seen: string[] = [];
    await act(() =>
      root.render(
        createElement(DilRenderer, {
          mode: "host",
          showStatus: false,
          markdownComponents: {
            ...HOST,
            urlTransform: (url) => {
              seen.push(url);
              return url;
            },
          },
          text: '[a](sandbox:/a) [b](sandbox:/{"x"})',
        }),
      ),
    );
    await vi.waitFor(() => expect(mount.textContent).toContain("b"));
    expect(seen).toEqual(["sandbox:/a"]);
    expect(links.map((link) => link.href)).toEqual(["sandbox:/a"]);
  });
});
