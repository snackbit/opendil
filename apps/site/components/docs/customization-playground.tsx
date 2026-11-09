"use client";
import "@snackbit/opendil/styles.css";
import "./docs-components.css";
import { useCallback, useState, type ChangeEvent } from "react";
import dynamic from "next/dynamic";
import { Input, ToggleGroupItem } from "@snackbit/opendil/lib";
import {
  SegmentedControl,
  ShellScope,
} from "@/components/workbench/shell-scope";
import { useVisibleExample } from "./use-visible-example";

const CustomizationPreview = dynamic(() => import("./customization-preview"), {
  ssr: false,
  loading: () => <div className="od-live-placeholder">Loading example…</div>,
});

const palette = ["#156f55", "#5e4cff", "#9a5b00"] as const;

export interface CustomizationPlaygroundProps {
  variant: "components" | "styling" | "configuration";
}

/** Custom Callout and button components, with controls for the customization guide in view. */
export function CustomizationPlayground({
  variant,
}: CustomizationPlaygroundProps) {
  const { root, visible } = useVisibleExample();
  const [mode, setMode] = useState<"host" | "shadow">("shadow");
  const [appearance, setAppearance] = useState<"light" | "dark">("light");
  const [primary, setPrimary] = useState<string>(palette[0]);
  const [label, setLabel] = useState("Release note");
  const [emphasis, setEmphasis] = useState<"normal" | "prominent">("normal");
  const changeMode = useCallback((value: string) => {
    if (value === "host" || value === "shadow") setMode(value);
  }, []);
  const changePalette = useCallback((value: string) => {
    if ((palette as readonly string[]).includes(value)) setPrimary(value);
  }, []);
  const changeAppearance = useCallback((value: string) => {
    if (value === "light" || value === "dark") setAppearance(value);
  }, []);
  const changeLabel = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setLabel(event.currentTarget.value);
  }, []);
  const changeEmphasis = useCallback((value: string) => {
    if (value === "normal" || value === "prominent") setEmphasis(value);
  }, []);
  return (
    <div
      className="not-prose od-live-example"
      data-customization-demo={variant}
      ref={root}
    >
      <div className="od-example-toolbar">
        <span>Live customization</span>
      </div>
      <ShellScope className="od-customization-controls">
        <SegmentedControl
          value={mode}
          onValueChange={changeMode}
          aria-label="Example rendering mode"
        >
          <ToggleGroupItem value="shadow">Shadow DOM</ToggleGroupItem>
          <ToggleGroupItem value="host">Host DOM</ToggleGroupItem>
        </SegmentedControl>
        {variant === "styling" && (
          <>
            <SegmentedControl
              value={primary}
              onValueChange={changePalette}
              aria-label="Accent color"
            >
              <ToggleGroupItem value={palette[0]}>Forest</ToggleGroupItem>
              <ToggleGroupItem value={palette[1]}>Violet</ToggleGroupItem>
              <ToggleGroupItem value={palette[2]}>Amber</ToggleGroupItem>
            </SegmentedControl>
            <SegmentedControl
              value={appearance}
              onValueChange={changeAppearance}
              aria-label="Preview theme"
            >
              <ToggleGroupItem value="light">Light</ToggleGroupItem>
              <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
            </SegmentedControl>
          </>
        )}
        {variant === "configuration" && (
          <>
            <label className="od-customization-field">
              <span>Callout label</span>
              <Input value={label} onChange={changeLabel} maxLength={60} />
            </label>
            <SegmentedControl
              value={emphasis}
              onValueChange={changeEmphasis}
              aria-label="Title emphasis"
            >
              <ToggleGroupItem value="normal">Normal</ToggleGroupItem>
              <ToggleGroupItem value="prominent">Prominent</ToggleGroupItem>
            </SegmentedControl>
          </>
        )}
      </ShellScope>
      {visible ? (
        <CustomizationPreview
          mode={mode}
          appearance={appearance}
          primary={primary}
          label={label}
          emphasis={emphasis}
        />
      ) : (
        <div className="od-live-placeholder">
          Custom Callout and Action components
        </div>
      )}
      <p className="od-customization-note">
        Switching rendering mode restarts this document.
      </p>
    </div>
  );
}
