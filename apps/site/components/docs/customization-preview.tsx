"use client";
import "@snackbit/opendil/styles.css";
import { DilRenderer } from "@snackbit/opendil";
import { useMemo } from "react";
import { primaryForeground } from "@/components/workbench/appearance";
import { components } from "@/lib/examples/custom-components";
import {
  customizationDocsSource,
  customizationStyles,
} from "./customization-source";

export interface CustomizationPreviewProps {
  mode: "host" | "shadow";
  appearance: "light" | "dark";
  primary: string;
  label: string;
  emphasis: "normal" | "prominent";
}

/** The renderer half of <CustomizationPlayground>, loaded once the playground is visible. */
export default function CustomizationPreview({
  mode,
  appearance,
  primary,
  label,
  emphasis,
}: CustomizationPreviewProps) {
  const tokens = useMemo(
    () => ({
      "--primary": primary,
      "--primary-foreground": primaryForeground(primary),
      "--radius": "12px",
    }),
    [primary],
  );
  const renderer = {
    text: customizationDocsSource,
    showStatus: false,
    components,
    appearance,
    tokens,
    className: "od-docs-output",
    componentConfig: { Callout: { label } },
    classNames: { Callout: "od-custom-callout", button: "od-custom-action" },
    slots: {
      Callout: {
        title:
          emphasis === "prominent"
            ? "od-custom-title od-custom-title-strong"
            : "od-custom-title",
        body: "od-custom-body",
      },
    },
  };
  // Switching mode restarts the document: host and Shadow DOM renderers are separate instances.
  return mode === "shadow" ? (
    <DilRenderer
      {...renderer}
      key={mode}
      mode="shadow"
      shadowStyles={customizationStyles}
    />
  ) : (
    <>
      <style>{customizationStyles}</style>
      <DilRenderer {...renderer} key={mode} mode="host" />
    </>
  );
}
