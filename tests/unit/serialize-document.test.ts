// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MarkdownRenderer,
  type DilMarkdownRendererHandle,
} from "../../packages/opendil/src/entries/markdown";
import { serializeRenderedDocument } from "../../packages/opendil/src/entries/serialize";
import {
  DilRenderer,
  preloadHostRenderer,
} from "../../packages/opendil/src/dil/dil-renderer";
import type { DilRendererHandle } from "../../packages/opendil/src/dil/renderer-handle";
import { installInlineWorkers } from "../../packages/opendil/src/testing";
import {
  chartTable,
  registerChartCopy,
} from "../../packages/opendil/src/dil/serialize/chart-copy";

function serialize(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  return serializeRenderedDocument(root);
}

describe("serializeRenderedDocument", () => {
  it("keeps semantic formatting in both formats", () => {
    const copy = serialize(
      [
        "<h1>Title</h1>",
        "<h4>Small <em>heading</em></h4>",
        "<p>Some <strong>bold</strong>, <b>also bold</b>, <i>italic</i>, <del>gone</del> and <code>a`b</code>.</p>",
        '<p><a href="https://example.com/a b">a link</a> and <a href="javascript:alert(1)">unsafe</a> and <a href="mailto:x@example.com">mail</a></p>',
        '<p><img src="https://example.com/i.png" alt="chart"><img src="data:image/png;base64,AA" alt="inline"><img src="data:x"></p>',
        "<ul><li>one<ul><li>nested</li></ul></li><li><p>two</p><p>more</p></li></ul>",
        '<ol start="3"><li>three</li></ol>',
        "<blockquote><p>quoted</p><p>twice</p></blockquote>",
        '<pre><code class="language-ts">const a = 1;\n```\n</code></pre>',
        "<hr>",
        "<p>line<br>break</p>",
      ].join(""),
    );
    expect(copy.markdown).toBe(
      [
        "# Title",
        "#### Small *heading*",
        "Some **bold**, **also bold**, *italic*, ~~gone~~ and ``a`b``.",
        "[a link](https://example.com/a%20b) and unsafe and [mail](mailto:x@example.com)",
        "![chart](https://example.com/i.png)inline",
        "- one\n  - nested\n- two\n\n  more",
        "3. three",
        "> quoted\n>\n> twice",
        "````ts\nconst a = 1;\n```\n````",
        "---",
        "line\\\nbreak",
      ].join("\n\n"),
    );
    expect(copy.html).toBe(
      [
        "<h1>Title</h1>",
        "<h4>Small <em>heading</em></h4>",
        "<p>Some <strong>bold</strong>, <strong>also bold</strong>, <em>italic</em>, <del>gone</del> and <code>a`b</code>.</p>",
        '<p><a href="https://example.com/a%20b">a link</a> and unsafe and <a href="mailto:x@example.com">mail</a></p>',
        '<p><img src="https://example.com/i.png" alt="chart">inline</p>',
        "<ul><li><p>one</p><ul><li><p>nested</p></li></ul></li><li><p>two</p><p>more</p></li></ul>",
        '<ol start="3"><li><p>three</p></li></ol>',
        "<blockquote><p>quoted</p><p>twice</p></blockquote>",
        '<pre><code class="language-ts">const a = 1;\n```</code></pre>',
        "<hr>",
        "<p>line<br>break</p>",
      ].join(""),
    );
  });
  it("writes tables with a header row and escaped cells", () => {
    const copy = serialize(
      "<table><thead><tr><th>A</th><th>B|C</th></tr></thead><tbody><tr><td>1</td><td><p>x</p><p>y</p></td></tr><tr><td>only</td></tr></tbody></table>" +
        "<table><tr><td>no</td><td>header</td></tr></table>" +
        "<table><tr><th>Key</th></tr><tr><td><code>a|b</code></td></tr></table>" +
        "<table></table>",
    );
    expect(copy.markdown).toBe(
      [
        "| A | B\\|C |\n| --- | --- |\n| 1 | x<br>y |\n| only |  |",
        "|  |  |\n| --- | --- |\n| no | header |",
        "| Key |\n| --- |\n| `a\\|b` |",
      ].join("\n\n"),
    );
    expect(copy.html).toContain(
      "<table><thead><tr><th>A</th><th>B|C</th></tr></thead><tbody><tr><td>1</td><td>x<br>y</td></tr>",
    );
    expect(copy.html).toContain(
      "<table><tbody><tr><td>no</td><td>header</td></tr></tbody></table>",
    );
  });
  it("escapes Markdown syntax and HTML in text", () => {
    const copy = serialize(
      "<p># not a heading</p><p>1. not a list</p><p>- nor this</p><p>&gt; nor a quote</p>" +
        "<p>a*b* [c] `d` &lt;e&gt; snake_case _edge_ ~f~ \\g</p>",
    );
    expect(copy.markdown).toBe(
      [
        "\\# not a heading",
        "1\\. not a list",
        "\\- nor this",
        "\\> nor a quote",
        "a\\*b\\* \\[c\\] \\`d\\` \\<e> snake_case \\_edge\\_ \\~f\\~ \\\\g",
      ].join("\n\n"),
    );
    expect(copy.html).toContain("&lt;e&gt;");
  });
  it("escapes block syntax after a line break and keeps headings on one line", () => {
    const copy = serialize(
      "<p>first<br># second<br>&gt; third<br>- fourth</p><h2>one<br>two</h2>",
    );
    expect(copy.markdown).toBe(
      "first\\\n\\# second\\\n\\> third\\\n\\- fourth\n\n## one<br>two",
    );
  });
  it("reads the document as it is now, after it changed", () => {
    const root = document.createElement("div");
    root.innerHTML = "<span>intro</span>";
    expect(serializeRenderedDocument(root).markdown).toBe("intro");
    root.querySelector("span")?.append(document.createElement("p"));
    const paragraph = root.querySelector("p");
    if (paragraph) paragraph.textContent = "added";
    expect(serializeRenderedDocument(root).markdown).toBe("intro\n\nadded");
  });
  it("leaves out hidden content, chrome, actions, and overlays", () => {
    const copy = serialize(
      [
        "<p>kept</p>",
        "<p hidden>hidden</p>",
        '<p aria-hidden="true">aria hidden</p>',
        "<p inert>inert</p>",
        '<p class="sr-only">screen reader only</p>',
        '<p class="sr-only" data-dil-copy="include">included</p>',
        '<p style="display: none">none</p>',
        '<p style="visibility: hidden">invisible</p>',
        '<div role="status">Copied</div>',
        '<div role="alert">Problem</div>',
        '<div data-dil-copy="skip">skipped</div>',
        "<button>Action</button>",
        '<button data-dil-copy="content"><div>Card body</div></button>',
        '<div role="tablist"><span role="tab">Tab</span></div>',
        '<div data-dil-portals=""><div>Overlay</div></div>',
        "<script>alert(1)</script><style>p{}</style><template><p>t</p></template>",
        '<p>an icon <svg role="img" aria-label="warning"></svg> and art <svg><text>x</text></svg></p>',
      ].join(""),
    );
    expect(copy.markdown).toBe(
      "kept\n\nincluded\n\nCard body\n\nan icon warning and art",
    );
  });
  it("keeps blocks that are inert only while progressive reveal fades them in", () => {
    const copy = serialize(
      [
        '<h2 inert data-dil-phase="ready">Waiting</h2>',
        '<p inert data-dil-phase="revealing">Fading <a href="https://example.test/guide">guide</a></p>',
        '<p inert data-dil-phase="visible">Inert after reveal</p>',
      ].join(""),
    );
    expect(copy.markdown).toBe(
      "## Waiting\n\nFading [guide](https://example.test/guide)",
    );
    expect(copy.html).toContain(
      '<a href="https://example.test/guide">guide</a>',
    );
  });
  it("serializes controls and hint replacements as their current state", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<p><label><input type="checkbox" checked> Done</label></p>',
      '<label><input type="radio"> Other</label>',
      '<p><input value="typed"> <input type="hidden" value="secret"> <input type="file"></p>',
      "<textarea>first\nsecond</textarea>",
      "<p><select><option>a</option><option selected>b</option></select></p>",
      '<p><span role="switch" aria-checked="false">Wi-Fi</span> <button aria-pressed="true">Bold</button></p>',
      '<p><span role="slider" aria-valuenow="3" aria-valuetext="three"></span> <span role="slider"></span></p>',
      '<p><button role="combobox">Chosen</button></p>',
      '<div data-dil-copy-text="Replaced value"><span>internal</span></div>',
      '<div data-dil-copy="code" data-dil-copy-language="js"><div data-dil-copy="skip">js Copy</div><textarea>let x = 1;</textarea></div>',
      '<div data-dil-copy="code" data-dil-copy-language="mermaid" data-dil-copy-source="graph TD; A-->B"><svg></svg></div>',
      '<div data-dil-copy="code"><pre>plain</pre></div>',
      '<div data-dil-copy="code"></div>',
    ].join("");
    const area = root.querySelector("textarea");
    if (area) area.value = "first\nedited";
    const copy = serializeRenderedDocument(root);
    expect(copy.markdown.split("\n\n")).toEqual([
      "[x] Done",
      "( ) Other",
      "typed",
      "first\\\nedited",
      "b",
      "[ ] Wi-Fi [x] Bold",
      "three",
      "Chosen",
      "Replaced value",
      "```js\nlet x = 1;\n```",
      "```mermaid\ngraph TD; A-->B\n```",
      "```\nplain\n```",
    ]);
    expect(copy.html).toContain("<p>\u2611 Done</p><p>\u25cb Other</p>");
    expect(copy.html).toContain("<p>\u2610 Wi-Fi \u2611 Bold</p>");
  });
  it("reads a chart as its title, caption, and data table", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<div role="group" aria-label="Revenue" data-dil-copy="chart"><p data-dil-chart-title>Revenue</p><p data-dil-chart-description>By month</p>' +
      "<div><button>Legend</button></div></div>" +
      '<div role="group" aria-label="bar chart" data-dil-copy="chart"></div>' +
      '<div data-dil-copy="chart"></div>';
    const chart = root.firstElementChild;
    if (!chart) throw new Error("Missing chart");
    registerChartCopy(chart, () =>
      chartTable(
        [
          { key: "month", label: "Month" },
          { key: "usd", label: "USD" },
        ],
        [{ month: "Jan", usd: 10 }, { month: null }],
      ),
    );
    expect(serializeRenderedDocument(root).markdown).toBe(
      "**Revenue**\n\nBy month\n\n| Month | USD |\n| --- | --- |\n| Jan | 10 |\n|  |  |\n\n**bar chart**",
    );
  });
  it("reads open shadow roots and ignores unknown wrappers", () => {
    const root = document.createElement("div");
    const host = document.createElement("span");
    host.attachShadow({ mode: "open" }).innerHTML =
      "<section><h2>Shadow</h2><p>content <em>here</em></p></section>";
    root.append(host);
    const copy = serializeRenderedDocument(root);
    expect(copy.markdown).toBe("## Shadow\n\ncontent *here*");
    expect(copy.html).toBe("<h2>Shadow</h2><p>content <em>here</em></p>");
  });
  it("pads code spans and fences that touch backticks", () => {
    const copy = serialize(
      '<p><code>`tick`</code> <code> spaced </code></p><pre><code class="language-x y">a</code></pre><ul></ul><blockquote></blockquote><h3> </h3>',
    );
    expect(copy.markdown).toBe("`` `tick` `` `  spaced  `\n\n```x\na\n```");
    expect(copy.html).toContain('<pre><code class="language-x">a</code></pre>');
  });
});

describe("renderer handles", () => {
  let mount: HTMLDivElement;
  let root: Root;
  let uninstall: () => void;
  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("__DIL_PARSER_WORKER__", "");
    vi.stubGlobal("__DIL_VM_WORKER__", "");
    uninstall = installInlineWorkers();
    await preloadHostRenderer();
    mount = document.createElement("div");
    document.body.append(mount);
    root = createRoot(mount);
  });
  afterEach(async () => {
    await act(() => root.unmount());
    mount.remove();
    uninstall();
    vi.unstubAllGlobals();
  });
  it("serializes a MarkdownRenderer, block or inline", async () => {
    let handle: DilMarkdownRendererHandle | null = null;
    const ref = (value: DilMarkdownRendererHandle | null) => {
      handle = value;
    };
    await act(() =>
      root.render(
        createElement(MarkdownRenderer, {
          ref,
          text: "# Notes\n\n- **one**\n- two {1+1}",
        }),
      ),
    );
    const current = () => handle as DilMarkdownRendererHandle | null;
    expect(current()?.serialize()).toEqual({
      html: "<h1>Notes</h1><ul><li><p><strong>one</strong></p></li><li><p>two {1+1}</p></li></ul>",
      markdown: "# Notes\n\n- **one**\n- two {1+1}",
    });
    await act(() =>
      root.render(
        createElement(MarkdownRenderer, { ref, inline: true, text: "*a* b" }),
      ),
    );
    expect(current()?.serialize().markdown).toBe("*a* b");
  });
  it("serializes what a DilRenderer shows, without its chrome", async () => {
    let handle: DilRendererHandle | null = null;
    await act(() =>
      root.render(
        createElement(DilRenderer, {
          mode: "host",
          ref: (value: DilRendererHandle | null) => {
            handle = value;
          },
          text: [
            "## Report",
            '<CodeBlock language="py">print(1)</CodeBlock>',
            '<Chart content={{"chartType":"bar","title":"Sales","description":"Units by region","xKey":"region","xLabel":"Region","yLabel":"Units","series":[{"dataKey":"units","label":"Units"}],"data":[{"region":"North","units":3},{"region":"South","units":5}]}}/>',
            "<button>Retry</button>",
          ].join("\n\n"),
        }),
      ),
    );
    const copy = (handle as DilRendererHandle | null)?.serialize();
    expect(copy?.markdown).toBe(
      [
        "## Report",
        "```py\nprint(1)\n```",
        "**Sales**",
        "Units by region",
        "| Region | Units |\n| --- | --- |\n| North | 3 |\n| South | 5 |",
      ].join("\n\n"),
    );
    expect(copy?.html).not.toMatch(/Complete|Retry|data-|class="(?!language)/);
    // The chart is named by its title and colored through --dil-chart-N.
    const chart = mount.querySelector('[data-dil-copy="chart"]');
    expect(chart?.getAttribute("aria-label")).toBe("Sales");
    const described = chart?.getAttribute("aria-describedby") ?? "";
    expect(mount.querySelector(`[id="${described}"]`)?.textContent).toBe(
      "Units by region",
    );
    expect(mount.innerHTML).toContain(
      "--color-units: var(--dil-chart-1, var(--chart-1, #6580d9))",
    );
  });
  it("copies only the chart series the legend shows", async () => {
    let handle: DilRendererHandle | null = null;
    await act(() =>
      root.render(
        createElement(DilRenderer, {
          mode: "host",
          ref: (value: DilRendererHandle | null) => {
            handle = value;
          },
          text: '<Chart content={{"chartType":"line","xKey":"m","series":[{"dataKey":"a","label":"Alpha"},{"dataKey":"b","label":"Beta"}],"data":[{"m":"Jan","a":1,"b":2}]}}/>',
        }),
      ),
    );
    const copy = () => (handle as DilRendererHandle | null)?.serialize();
    // Without a title, the chart's accessible name heads it.
    expect(copy()?.markdown).toBe(
      "**line chart**\n\n| m | Alpha | Beta |\n| --- | --- | --- |\n| Jan | 1 | 2 |",
    );
    const alpha = mount.querySelector<HTMLElement>('[data-series-id="a"]');
    if (!alpha) throw new Error("Missing legend item");
    // A plain click on a legend item shows that series alone.
    await act(() => alpha.click());
    expect(copy()?.markdown).toBe(
      "**line chart**\n\n| m | Alpha |\n| --- | --- |\n| Jan | 1 |",
    );
  });
  it("puts a caption on its own line inside a table cell", async () => {
    await act(() =>
      root.render(
        createElement(DilRenderer, {
          mode: "host",
          text: "<table><table-row><table-cell><text>Payroll</text><caption>Income</caption></table-cell></table-row></table>",
        }),
      ),
    );
    const caption = mount.querySelector<HTMLElement>(
      '[data-d-component="caption"]',
    );
    const text = mount.querySelector<HTMLElement>('[data-d-component="text"]');
    expect(caption?.textContent).toBe("Income");
    expect(caption?.style.display).toBe("block");
    expect(text?.style.display).toBe("");
  });
  it("answers null in the iframe mode, whose document the page cannot read", async () => {
    let handle: DilRendererHandle | null = null;
    await act(() =>
      root.render(
        createElement(DilRenderer, {
          text: "# Framed",
          ref: (value: DilRendererHandle | null) => {
            handle = value;
          },
        }),
      ),
    );
    expect((handle as DilRendererHandle | null)?.serialize()).toBeNull();
  });
});
