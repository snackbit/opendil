// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDocumentCache,
  DilRenderer,
  preloadHostRenderer,
} from "../../../packages/opendil/src/dil/dil-renderer";
import { MarkdownRenderer } from "../../../packages/opendil/src/dil/markdown/markdown-renderer";
import type { DilDiagram } from "../../../packages/opendil/src/dil/customization";
import { installInlineWorkers } from "../../../packages/opendil/src/testing";
import { MermaidDiagram } from "../../../packages/opendil/src/dil/widgets/mermaid-diagram";

// happy-dom has no layout for Mermaid, and DOMPurify's SVG profile drops the
// svg root under happy-dom, so both are stand-ins here. The browser suites
// render and sanitize real diagrams.
const rendered = vi.hoisted(() => ({
  size: 'width="100%" style="max-width: 180px;" viewBox="0 0 180 90"',
  includeId: false,
  calls: [] as string[],
}));
vi.mock("mermaid", () => ({
  default: {
    initialize: () => {},
    render: (id: string) => {
      rendered.calls.push(id);
      const label = rendered.includeId ? `Ship ${id}` : "Ship";
      const title = rendered.includeId ? `Release flow ${id}` : "Release flow";
      return Promise.resolve({
        svg: `<svg xmlns="http://www.w3.org/2000/svg" id="${id}" ${rendered.size} aria-labelledby="title-${id} fixed-title"><title id="title-${id}">${title}</title><defs><marker id="${id}-arrow"/><marker id="fixed-marker"/></defs><g class="node" aria-label="${label}" fill="url(https://evil.example/p)" marker-end="url(#${id}-arrow)" marker-start="url(#fixed-marker)"><text>${label}</text></g><style>#${id} .node {marker-end:url(#${id}-arrow)} #fixed-marker {fill:red}</style></svg>`,
      });
    },
  },
}));
vi.mock("dompurify", () => ({
  default: {
    sanitize: (markup: string) => {
      const fragment = document.createDocumentFragment();
      fragment.append(
        new DOMParser().parseFromString(markup, "image/svg+xml")
          .documentElement,
      );
      return fragment;
    },
  },
}));

const SOURCE = "flowchart LR\n  Build --> Ship";
let mount: HTMLDivElement;
let root: Root;
let uninstall: () => void;
beforeEach(async () => {
  rendered.calls = [];
  rendered.includeId = false;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("__DIL_PARSER_WORKER__", "");
  vi.stubGlobal("__DIL_VM_WORKER__", "");
  vi.stubGlobal("__DIL_STYLES__", ".dil-scope{color:black}");
  uninstall = installInlineWorkers();
  await preloadHostRenderer();
  mount = document.createElement("div");
  document.body.append(mount);
  root = createRoot(mount);
});
afterEach(async () => {
  await act(() => root.unmount());
  mount.remove();
  // Cases draw one source differently; a kept diagram would outlive its case.
  clearDocumentCache();
  uninstall();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function settle(selector: string) {
  await vi.waitFor(() => {
    if (!mount.querySelector(selector)) throw new Error("Missing " + selector);
  });
}
const openButton = () =>
  mount.querySelector<HTMLButtonElement>('button[aria-label="Open diagram"]');

describe("opening diagrams in the host", () => {
  it("reuses a diagram with scoped IDs while preserving authored labels and titles", async () => {
    const inserted = vi.spyOn(Element.prototype, "innerHTML", "set");
    rendered.includeId = true;
    await act(() =>
      root.render(createElement(MermaidDiagram, { source: SOURCE })),
    );
    await settle("svg");
    const first = mount.querySelector("svg")!;
    const label = `Ship ${first.id}`;
    const calls = rendered.calls.length;
    await act(() => root.render(null));
    await act(() =>
      root.render(createElement(MermaidDiagram, { source: SOURCE })),
    );
    const reused = mount.querySelector("svg")!;
    expect(rendered.calls).toHaveLength(calls);
    expect(reused.id).not.toBe(first.id);
    expect(reused.querySelector("text")?.textContent).toBe(label);
    expect(reused.querySelector("g")?.getAttribute("aria-label")).toBe(label);
    expect(reused.querySelector("title")?.textContent).toBe(
      `Release flow ${first.id}`,
    );
    expect(reused.getAttribute("aria-labelledby")).toBe(
      `title-${reused.id} fixed-title`,
    );
    expect(reused.querySelector("marker")?.id).toBe(`${reused.id}-arrow`);
    expect(reused.querySelector("g")?.getAttribute("marker-end")).toBe(
      `url(#${reused.id}-arrow)`,
    );
    expect(reused.querySelector("g")?.getAttribute("marker-start")).toBe(
      "url(#fixed-marker)",
    );
    // happy-dom drops SVG style text on insertion; inspect the markup React
    // handed the DOM. The browser suites retain real SVG style elements.
    expect(inserted.mock.calls.at(-1)?.[0]).toContain(`#${reused.id} .node`);
    expect(inserted.mock.calls.at(-1)?.[0]).toContain(
      "#fixed-marker {fill:red}",
    );
  });
  it("hands the host the rendered SVG, source, title and natural size", async () => {
    const opened: DilDiagram[] = [];
    await act(() =>
      root.render(
        createElement(DilRenderer, {
          mode: "host",
          showStatus: false,
          text: `<Mermaid source={${JSON.stringify(SOURCE)}}/>`,
          onOpenDiagram: (diagram) => opened.push(diagram),
        }),
      ),
    );
    await settle('[aria-label="Mermaid diagram"] svg');
    const button = openButton();
    if (!button) throw new Error("Missing open button");
    expect(
      button.closest("[data-dil-copy]")?.getAttribute("data-dil-copy"),
    ).toBe("skip");
    await act(() => button.click());
    expect(opened).toHaveLength(1);
    const [diagram] = opened;
    expect(diagram).toMatchObject({
      kind: "mermaid",
      source: SOURCE,
      title: "Release flow",
      width: 180,
      height: 90,
    });
    expect(diagram?.svg).toMatch(
      /^<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/,
    );
    expect(diagram?.svg).toContain('width="180"');
    expect(diagram?.svg).not.toContain("evil");
  });
  it("opens mermaid fences from MarkdownRenderer through the same hook", async () => {
    const opened: DilDiagram[] = [];
    await act(() =>
      root.render(
        createElement(MarkdownRenderer, {
          text: "```mermaid\n" + SOURCE + "\n```",
          onOpenDiagram: (diagram: DilDiagram) => opened.push(diagram),
        }),
      ),
    );
    await settle('[aria-label="Mermaid diagram"] svg');
    expect(
      mount
        .querySelector("[data-dil-document]")
        ?.getAttribute("data-dil-document"),
    ).toBe("markdown");
    await act(() => openButton()?.click());
    expect(opened.map((diagram) => diagram.source)).toEqual([SOURCE]);
  });
  it("keeps stock diagrams without the button when the host has no hook", async () => {
    await act(() =>
      root.render(
        createElement(DilRenderer, {
          mode: "host",
          showStatus: false,
          text: `<Mermaid source={${JSON.stringify(SOURCE)}}/>`,
        }),
      ),
    );
    await settle('[aria-label="Mermaid diagram"] svg');
    expect(openButton()).toBeNull();
  });
  it("shows no open button for a diagram without a natural size", async () => {
    rendered.size = 'width="100%"';
    try {
      await act(() =>
        root.render(
          createElement(DilRenderer, {
            mode: "host",
            showStatus: false,
            text: `<Mermaid source={${JSON.stringify(SOURCE)}}/>`,
            onOpenDiagram: () => {},
          }),
        ),
      );
      await settle('[aria-label="Mermaid diagram"] svg');
      expect(openButton()).toBeNull();
    } finally {
      rendered.size =
        'width="100%" style="max-width: 180px;" viewBox="0 0 180 90"';
    }
  });
  it("rejects the hook in the iframe mode", () => {
    expect(() =>
      // @ts-expect-error The hook needs host or shadow mode.
      DilRenderer({ text: "", onOpenDiagram: () => {} }),
    ).toThrow(/onOpenDiagram\) requires mode="host" or mode="shadow"/);
  });
});
