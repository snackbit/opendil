import { afterEach, expect, it, vi } from "vitest";
import ts from "typescript";
import { upcomingRange } from "../../apps/demo/src/workbench/generated-code";
import {
  savedDraft,
  storeDraft,
} from "../../apps/demo/src/workbench/draft-storage";
import {
  rendererPreferences,
  saveRendererPreferences,
} from "../../apps/demo/src/workbench/renderer-preferences";
import {
  reactSnippet,
  type IntegrationOptions,
} from "../../apps/demo/src/workbench/react-snippet";
import { primaryForeground } from "../../apps/demo/src/workbench/appearance";
import {
  exampleById,
  examples,
  featuredExamples,
} from "../../apps/demo/src/examples/catalog";
import { tokenOffsets } from "../../apps/demo/src/playback/token-index";
import { DilParser } from "../../packages/opendil/src/dil/parser/dil-parser";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function storage() {
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  return values;
}
it("keeps drafts per example and fails gracefully when session storage is unavailable", () => {
  storage();
  expect(savedDraft("form", "Original")).toBe("Original");
  storeDraft("form", "Edited");
  expect(savedDraft("form", "Original")).toBe("Edited");
  expect(savedDraft("charts", "Chart")).toBe("Chart");
  storeDraft("form", "x".repeat(100001));
  expect(savedDraft("form", "Original")).toBe("Edited");
  vi.stubGlobal("sessionStorage", {
    getItem() {
      throw new Error("Blocked");
    },
    setItem() {
      throw new Error("Blocked");
    },
  });
  expect(savedDraft("form", "Original")).toBe("Original");
  expect(() => storeDraft("form", "Edited")).not.toThrow();
});
it("validates renderer preferences without trusting arbitrary stored JSON", () => {
  const values = storage();
  values.set(
    "opendil:renderer-preferences",
    '{"mode":"isolated","reveal":true}',
  );
  expect(rendererPreferences()).toEqual({ mode: "shadow", reveal: true });
  for (const mode of ["isolated", "shadow", "host"] as const) {
    saveRendererPreferences({ mode, reveal: true });
    expect(rendererPreferences()).toEqual({ mode, reveal: true });
  }
  saveRendererPreferences({ mode: "shadow", reveal: false });
  expect(rendererPreferences()).toEqual({ mode: "shadow", reveal: false });
  for (const value of [
    "broken",
    "null",
    "42",
    '{"mode":"unsafe","reveal":"true"}',
    "{}",
  ]) {
    values.set("opendil:renderer-preferences:v2", value);
    expect(rendererPreferences()).toEqual({ mode: "shadow", reveal: true });
  }
  vi.stubGlobal("sessionStorage", {
    getItem() {
      throw new Error("Blocked");
    },
    setItem() {
      throw new Error("Blocked");
    },
  });
  expect(rendererPreferences().mode).toBe("shadow");
  expect(() =>
    saveRendererPreferences({ mode: "host", reveal: false }),
  ).not.toThrow();
});
it("bounds upcoming-source offsets using UTF-16 positions", () => {
  expect(upcomingRange("Hello 🦊 world".length, 6)).toEqual({
    start: 6,
    end: 14,
  });
  expect(upcomingRange(14, -1)).toEqual({ start: 0, end: 14 });
  expect(upcomingRange(14, 999)).toBeNull();
  expect(upcomingRange(0, 0)).toBeNull();
});
it("chooses readable primary text for dark, light, and midtone inputs", () => {
  expect(primaryForeground("#202020")).toBe("#ffffff");
  expect(primaryForeground("#000000")).toBe("#ffffff");
  expect(primaryForeground("#ffffff")).toBe("#12141c");
  expect(primaryForeground("#a7f3d0")).toBe("#12141c");
  expect(primaryForeground("invalid")).toBe("#ffffff");
});
const base: IntegrationOptions = {
  mode: "isolated",
  reveal: false,
  autoScroll: false,
  updateInterval: "instant",
  appearance: "light",
  primary: "#202020",
  radius: 12,
  buttonClass: "",
};
it("generates valid TSX using public imports and includes custom registrations when required", () => {
  const source =
    '<title>"quoted"</title>\n<text>{count}</text>\n<CodeBlock>const x = `hello ${name}`; /\\w+/</CodeBlock>';
  for (const mode of ["isolated", "shadow", "host"] as const)
    for (const custom of [false, true]) {
      if (custom && mode === "isolated") continue;
      for (const buttonClass of ["", "rounded-full"]) {
        const snippet = reactSnippet(
          source,
          {
            ...base,
            mode,
            buttonClass,
            reveal: { staggerMs: 50, durationMs: 180 },
            autoScroll: { behavior: "smooth", padding: 32 },
            updateInterval: 200,
          },
          custom,
        );
        const compiled = ts.transpileModule(snippet, {
          compilerOptions: {
            jsx: ts.JsxEmit.ReactJSX,
            target: ts.ScriptTarget.ES2022,
          },
          reportDiagnostics: true,
        });
        expect(compiled.diagnostics).toEqual([]);
        const file = ts.createSourceFile(
          "Example.tsx",
          snippet,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        );
        const values: string[] = [];
        function visit(node: ts.Node) {
          if (
            ts.isVariableDeclaration(node) &&
            node.name.getText(file) === "source" &&
            node.initializer &&
            ts.isStringLiteralLike(node.initializer)
          )
            values.push(node.initializer.text);
          ts.forEachChild(node, visit);
        }
        visit(file);
        expect(values).toEqual([source]);
        if (mode === "isolated") expect(snippet).not.toContain("tokens=");
        else expect(snippet).toContain("tokens=");
        if (custom) {
          expect(snippet).toContain("const components");
          expect(snippet).toContain("components={components}");
        }
      }
    }
  const simple = reactSnippet(source, base);
  expect(simple).not.toContain("progressiveReveal");
  expect(simple).not.toContain("updateInterval");
});
it("featured examples cover four token sizes with readable lines and real controls", () => {
  const limits = [
    { min: 425, max: 575 },
    { min: 850, max: 1150 },
    { min: 1700, max: 2300 },
    { min: 7000, max: 10500 },
  ];
  expect(featuredExamples.map((example) => example.id)).toEqual([
    "team-budget",
    "release-planner",
    "service-console",
    "showcase",
  ]);
  featuredExamples.forEach((example, index) => {
    const source = example.source();
    const limit = limits[index];
    if (!limit) throw new Error("Unexpected featured example");
    const count = tokenOffsets(source).length - 1;
    expect(count, example.id).toBeGreaterThan(limit.min);
    expect(count, example.id).toBeLessThan(limit.max);
    expect(source).toMatch(/onChange=/);
    expect(source).toMatch(/onClick=/);
  });
});
it("catalog examples contain complete DIL and have stable link identities", () => {
  expect(new Set(examples.map((example) => example.id)).size).toBe(
    examples.length,
  );
  expect(() => exampleById("unknown")).toThrow("Unknown example");
  for (const example of examples) {
    const result = new DilParser().append(example.source(), true);
    expect(
      result.nodes.filter((node) => node.status === "error"),
      example.id,
    ).toEqual([]);
    expect(result.complete).toBe(true);
  }
});
