import { readFile } from "node:fs/promises";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { beforeAll, expect, it } from "vitest";
import { buttonVariants } from "../../../packages/opendil/src/components/ui/controls/button";

const source = "packages/opendil/styles/tailwind.css";
let css = "";
/** Compiles the stock stylesheet from source, as the package build does. */
beforeAll(async () => {
  const input = (await readFile(source, "utf8")).replace(
    'source("../dist")',
    'source("../src")',
  );
  css = (await postcss([tailwind()]).process(input, { from: source })).css;
}, 30000);
function declarations(selector: string) {
  const blocks: string[] = [];
  postcss.parse(css).walkRules((rule) => {
    if (rule.selectors.includes(selector)) blocks.push(rule.toString());
  });
  return blocks.join("\n");
}
it("contains absolutely positioned renderer parts below className utilities", () => {
  const positions: string[] = [];
  postcss.parse(css).walkDecls("position", (declaration) => {
    const rule = declaration.parent;
    if (rule?.type !== "rule" || !("selectors" in rule)) return;
    if (!(rule.selectors as string[]).includes(".dil-scope")) return;
    const layer = rule.parent?.type === "atrule" ? rule.parent : undefined;
    positions.push(`${layer?.name ?? ""} ${layer?.params ?? ""}`.trim());
  });
  // Unlayered position utilities, and consumer utilities in later layers, win over base.
  expect(positions).toEqual(["layer base"]);
});
it("derives color-scheme from the renderer appearance", () => {
  expect(declarations(".dil-scope")).toMatch(/color-scheme:\s*light/);
  expect(declarations('.dil-scope[data-theme="dark"]')).toMatch(
    /color-scheme:\s*dark/,
  );
});
it("resets user-agent form colors below the utilities", () => {
  const reset = declarations(".dil-scope :is(button, input, select, textarea)");
  expect(reset).toMatch(/color:\s*inherit/);
  expect(reset).toMatch(/background-color:\s*transparent/);
});
it("ties dark utilities to the renderer appearance, not the operating system", () => {
  expect(css).not.toContain("prefers-color-scheme");
  expect(css).toMatch(
    /\.dil-dark\\:bg-input\\\/30:where\(\.dil-scope\[data-theme="dark"\], \.dil-scope\[data-theme="dark"\] \*\)/,
  );
});
it.each(["default", "destructive", "outline", "secondary", "ghost", "link"])(
  "gives the %s button variant an explicit foreground",
  (variant) => {
    const classes = buttonVariants({
      variant: variant as "default",
    }).split(" ");
    expect(
      classes.some((name) => /^text-(?!sm$|xs$|base$|lg$)[\w-]+$/.test(name)),
    ).toBe(true);
  },
);
it("leaves shared design variables to the host page under theme=inherit", () => {
  const inherited = [
    "--background",
    "--foreground",
    "--primary",
    "--border",
    "--radius",
    "--chart-1",
    "--font-dil",
  ];
  const defined = (selector: string) => {
    const names = new Set<string>();
    postcss.parse(css).walkRules((rule) => {
      if (rule.selectors.some((name) => name === selector))
        rule.walkDecls((declaration) => {
          names.add(declaration.prop);
        });
    });
    return names;
  };
  const always = defined(".dil-scope");
  for (const name of inherited) expect(always.has(name), name).toBe(false);
  // :where() keeps the stock rules at .dil-scope specificity, so a host class
  // on the root (className) still overrides them as it did before.
  const scoped = defined('.dil-scope:where(:not([data-dil-theme="inherit"]))');
  for (const name of inherited) expect(scoped.has(name), name).toBe(true);
  expect(
    defined(
      '.dil-scope[data-theme="dark"]:where(:not([data-dil-theme="inherit"]))',
    ).has("--background"),
  ).toBe(true);
  // OpenDIL's own knobs keep their defaults in both themes.
  expect(always.has("--dil-control-radius")).toBe(true);
});
it("reads layout and typography tokens without declaring them, so any ancestor can set them", () => {
  const tokens = [
    "--dil-font-size",
    "--dil-line-height",
    "--dil-font-mono",
    "--dil-item-gap",
    "--dil-heading-1-size",
    "--dil-heading-2-size",
    "--dil-heading-weight",
    "--dil-list-indent",
    "--dil-quote-border",
    "--dil-table-font-size",
    "--dil-table-cell-padding",
    "--dil-table-row-border",
    "--dil-table-column-border",
    "--dil-table-header-background",
    "--dil-code-background",
    "--dil-code-padding",
    "--dil-code-radius",
    "--dil-code-border",
    "--dil-code-font-size",
    "--dil-code-line-height",
    "--dil-chart-1",
  ];
  const declared = new Set<string>();
  postcss.parse(css).walkDecls((declaration) => {
    declared.add(declaration.prop);
  });
  for (const token of tokens) {
    expect(declared.has(token), token).toBe(false);
    if (token !== "--dil-chart-1") expect(css, token).toContain(`var(${token}`);
  }
  expect(declarations(".dil-flow")).toMatch(
    /gap:\s*var\(--dil-item-gap, 12px\)/,
  );
  // Markdown fences render in the CodeBlock frame, so the code tokens restyle both.
  expect(declarations(".dil-code-block")).toMatch(
    /background:\s*var\(\s*--dil-code-background,/,
  );
  expect(declarations(".dil-code-block")).toMatch(
    /border:\s*var\(--dil-code-border, 1px solid var\(--border\)\)/,
  );
  expect(declarations(".dil-code-view")).toMatch(
    /padding:\s*var\(--dil-code-padding, 16px\)/,
  );
  // A host that sets code to its text size can match its line height too.
  expect(declarations(".dil-code-view")).toMatch(
    /line-height:\s*var\(--dil-code-line-height, 2\)/,
  );
});
it("styles stock toggle groups by class, so host primitives keep their own styles", () => {
  expect(css).not.toContain('[data-slot="toggle-group"]');
  expect(declarations(".dil-toggle-group")).toMatch(
    /border-radius:\s*var\(--dil-control-radius\)/,
  );
  expect(declarations(".dil-toggle-group-item")).toMatch(
    /border-radius:\s*var\(--dil-item-radius\)/,
  );
});
