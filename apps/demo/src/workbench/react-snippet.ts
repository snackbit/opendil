import type {
  AutoScroll,
  ProgressiveReveal,
  UpdateInterval,
} from "@snackbit/opendil";
import type { RenderMode } from "../demo-renderer";
import { primaryForeground } from "./appearance";
import { customComponentSource } from "../examples/customization";
export interface IntegrationOptions {
  mode: RenderMode;
  reveal: ProgressiveReveal;
  autoScroll: AutoScroll;
  updateInterval: UpdateInterval;
  appearance: "light" | "dark";
  primary: string;
  radius: number;
  buttonClass: string;
}
export function reactSnippet(
  source: string,
  options: IntegrationOptions,
  custom = false,
) {
  const sourceLiteral =
    "`" +
    source
      .replace(/\\/g, "\\\\")
      .replace(/`/g, "\\`")
      .replace(/\$\{/g, "\\${") +
    "`";
  const props = [
    "      showStatus={false}",
    ...(options.mode === "isolated" ? [] : [`      mode="${options.mode}"`]),
    ...(options.reveal
      ? [`      progressiveReveal={${JSON.stringify(options.reveal)}}`]
      : []),
    ...(options.autoScroll
      ? [`      autoScroll={${JSON.stringify(options.autoScroll)}}`]
      : []),
    ...(options.updateInterval === "instant"
      ? []
      : [`      updateInterval={${options.updateInterval}}`]),
    ...(options.mode === "isolated"
      ? []
      : [
          `      appearance="${options.appearance}"`,
          `      tokens={${JSON.stringify({ "--primary": options.primary, "--primary-foreground": primaryForeground(options.primary), "--radius": options.radius + "px" })}}`,
          ...(options.buttonClass
            ? [
                `      classNames={${JSON.stringify({ button: options.buttonClass })}}`,
              ]
            : []),
        ]),
  ];
  if (custom)
    props.push(
      "      components={components}",
      '      componentConfig={{ Callout: { label: "Consumer component" } }}',
      '      slots={{ Callout: { title: "text-primary" } }}',
    );
  if (custom) {
    const index = props.findIndex((prop) => prop.includes("classNames="));
    const prop = `      classNames={${JSON.stringify({ button: options.buttonClass || "rounded-full", Callout: "rounded-xl border p-4" })}}`;
    if (index < 0) props.push(prop);
    else props[index] = prop;
  }
  return `import { DilRenderer } from "@snackbit/opendil";\nimport "@snackbit/opendil/styles.css";\n\n${custom ? customComponentSource + "\n" : ""}const source = ${sourceLiteral};\n\nexport function Example() {\n  return (\n    <DilRenderer\n      text={source}\n${props.join("\n")}${props.length ? "\n" : ""}    />\n  );\n}\n`;
}
