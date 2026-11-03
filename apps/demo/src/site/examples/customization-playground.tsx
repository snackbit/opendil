import { useCallback, useMemo, useState, type ChangeEvent } from "react";
import { DilRenderer } from "@snackbit/opendil";
import {
  Button,
  Input,
  ToggleGroup,
  ToggleGroupItem,
} from "@snackbit/opendil/ui";
import { components } from "../../examples/custom-components";
import { primaryForeground } from "../../workbench/appearance";
import { ShellScope } from "../components/shell-scope";
import { sitePath } from "../links";
import { useVisibleExample } from "./use-visible-example";
import {
  customizationDocsSource,
  customizationStyles,
} from "./customization-source";

export interface CustomizationPlaygroundProps {
  variant: "components" | "styling" | "configuration";
}
export function CustomizationPlayground({
  variant,
}: CustomizationPlaygroundProps) {
  const { root, visible } = useVisibleExample();
  const [mode, setMode] = useState<"host" | "shadow">("shadow");
  const [appearance, setAppearance] = useState<"light" | "dark">("light");
  const [primary, setPrimary] = useState("#156f55");
  const [label, setLabel] = useState("Release note");
  const [emphasis, setEmphasis] = useState("normal");
  const changeMode = useCallback((value: string) => {
    if (value === "host" || value === "shadow") setMode(value);
  }, []);
  const changePalette = useCallback((value: string) => {
    if (value === "#156f55" || value === "#5e4cff" || value === "#9a5b00")
      setPrimary(value);
  }, []);
  const toggleTheme = useCallback(() => {
    setAppearance((value) => (value === "light" ? "dark" : "light"));
  }, []);
  const changeLabel = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setLabel(event.currentTarget.value);
  }, []);
  const changeEmphasis = useCallback((value: string) => {
    if (value === "normal" || value === "prominent") setEmphasis(value);
  }, []);
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
  return (
    <div
      className="not-content od-live-example"
      data-customization-demo={variant}
      ref={root}
    >
      <div className="od-example-toolbar">
        <span>Live customization</span>
        <a href={sitePath("demo/customization/")}>Open in demo ↗</a>
      </div>
      <ShellScope className="od-customization-controls">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={changeMode}
          aria-label="Example rendering mode"
        >
          <ToggleGroupItem value="shadow">Shadow DOM</ToggleGroupItem>
          <ToggleGroupItem value="host">Host DOM</ToggleGroupItem>
        </ToggleGroup>
        {variant === "styling" && (
          <>
            <ToggleGroup
              type="single"
              value={primary}
              onValueChange={changePalette}
              aria-label="Accent color"
            >
              <ToggleGroupItem value="#156f55">Forest</ToggleGroupItem>
              <ToggleGroupItem value="#5e4cff">Violet</ToggleGroupItem>
              <ToggleGroupItem value="#9a5b00">Amber</ToggleGroupItem>
            </ToggleGroup>
            <Button size="sm" variant="outline" onClick={toggleTheme}>
              {appearance === "light" ? "Dark preview" : "Light preview"}
            </Button>
          </>
        )}
        {variant === "configuration" && (
          <>
            <label className="od-customization-field">
              <span>Callout label</span>
              <Input value={label} onChange={changeLabel} maxLength={60} />
            </label>
            <ToggleGroup
              type="single"
              value={emphasis}
              onValueChange={changeEmphasis}
              aria-label="Title emphasis"
            >
              <ToggleGroupItem value="normal">Normal</ToggleGroupItem>
              <ToggleGroupItem value="prominent">Prominent</ToggleGroupItem>
            </ToggleGroup>
          </>
        )}
      </ShellScope>
      {visible ? (
        mode === "shadow" ? (
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
        )
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
