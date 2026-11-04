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
