import { useCallback, type ChangeEvent } from "react";
import { Input, ToggleGroup, ToggleGroupItem } from "@snackbit/opendil/ui";
export interface AppearanceSettingsProps {
  enabled: boolean;
  appearance: "light" | "dark";
  primary: string;
  radius: number;
  buttonClass: string;
  onAppearance: (value: "light" | "dark") => void;
  onPrimary: (value: string) => void;
  onRadius: (value: number) => void;
  onButtonClass: (value: string) => void;
}
export function AppearanceSettings({
  enabled,
  appearance,
  primary,
  radius,
  buttonClass,
  onAppearance,
  onPrimary,
  onRadius,
  onButtonClass,
}: AppearanceSettingsProps) {
  const theme = useCallback(
    (value: string) => {
      if (value === "light" || value === "dark") onAppearance(value);
    },
    [onAppearance],
  );
  const color = useCallback(
    (event: ChangeEvent<HTMLInputElement>) =>
      onPrimary(event.currentTarget.value),
    [onPrimary],
  );
  const shape = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.currentTarget.valueAsNumber;
      if (Number.isFinite(value) && value >= 0 && value <= 32) onRadius(value);
    },
    [onRadius],
  );
  const classes = useCallback(
    (value: string) => {
      if (["rounded-md", "rounded-full", "rounded-none"].includes(value))
        onButtonClass(value);
    },
    [onButtonClass],
  );
  return (
    <details className="od-appearance">
      <summary>
        Output appearance{" "}
        <span>{enabled ? "Editable" : "Shadow or host mode"}</span>
      </summary>
      <fieldset disabled={!enabled}>
        <label>
          Output theme
          <ToggleGroup
            type="single"
            value={appearance}
            onValueChange={theme}
            aria-label="Output theme"
          >
            <ToggleGroupItem value="light">Light output</ToggleGroupItem>
            <ToggleGroupItem value="dark">Dark output</ToggleGroupItem>
          </ToggleGroup>
        </label>
        <div className="od-appearance-fields">
          <label>
            Primary color
            <Input
              type="color"
              aria-label="Output primary color"
              value={primary}
              onChange={color}
            />
          </label>
          <label>
            Control radius (px)
            <Input
              aria-label="Control radius (px)"
              type="number"
              min={0}
              max={32}
              value={radius}
              onChange={shape}
            />
          </label>
        </div>
        <label>
          Button class
          <ToggleGroup
            type="single"
            value={buttonClass}
            onValueChange={classes}
            aria-label="Button class"
          >
            <ToggleGroupItem value="rounded-none">Square</ToggleGroupItem>
            <ToggleGroupItem value="rounded-md">Default</ToggleGroupItem>
            <ToggleGroupItem value="rounded-full">Pill</ToggleGroupItem>
          </ToggleGroup>
        </label>
      </fieldset>
    </details>
  );
}
