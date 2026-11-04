import { useCallback, type ChangeEvent } from "react";
import {
  Button,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Input,
  ToggleGroupItem,
} from "@snackbit/opendil/ui";
import { ChevronRight } from "lucide-react";
import { SegmentedControl } from "./shell-scope";
export interface AppearanceSettingsProps {
  /** Button classes need mode="host" or mode="shadow"; theme settings work in every mode. */
  classNamesEnabled: boolean;
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
  classNamesEnabled,
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
    <Collapsible className="od-appearance">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="xs" className="od-appearance-trigger">
          <ChevronRight size={12} />
          Output appearance
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <fieldset>
          {/* A <label> would forward caption clicks to the first option, so groups use a div. */}
          <div className="od-appearance-field">
            <span>Output theme</span>
            <SegmentedControl
              value={appearance}
              onValueChange={theme}
              aria-label="Output theme"
            >
              <ToggleGroupItem value="light">Light output</ToggleGroupItem>
              <ToggleGroupItem value="dark">Dark output</ToggleGroupItem>
            </SegmentedControl>
          </div>
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
          <div className="od-appearance-field">
            <span>Button class</span>
            <SegmentedControl
              disabled={!classNamesEnabled}
              value={buttonClass}
              onValueChange={classes}
              aria-label="Button class"
            >
              <ToggleGroupItem value="rounded-none">Square</ToggleGroupItem>
              <ToggleGroupItem value="rounded-md">Default</ToggleGroupItem>
              <ToggleGroupItem value="rounded-full">Pill</ToggleGroupItem>
            </SegmentedControl>
          </div>
        </fieldset>
      </CollapsibleContent>
    </Collapsible>
  );
}
