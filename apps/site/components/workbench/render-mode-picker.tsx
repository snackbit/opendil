import { useCallback } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPortal,
  SelectContent,
  SelectViewport,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
} from "@snackbit/opendil/ui";
import { Check, ChevronDown } from "lucide-react";
import type { RenderMode } from "@/components/playback/demo-renderer";

export interface RenderModePickerProps {
  value: RenderMode;
  onChange: (mode: RenderMode) => void;
  customization: boolean;
}
export function RenderModePicker({
  value,
  onChange,
  customization,
}: RenderModePickerProps) {
  const change = useCallback(
    (next: string) => {
      if (
        next === "shadow" ||
        next === "host" ||
        (next === "isolated" && !customization)
      )
        onChange(next);
    },
    [onChange, customization],
  );
  return (
    <Select value={value} onValueChange={change}>
      <SelectTrigger
        className="od-render-mode-picker"
        aria-label="Rendering mode"
      >
        <SelectValue />
        <ChevronDown size={13} aria-hidden="true" />
      </SelectTrigger>
      <SelectPortal>
        <SelectContent
          className="od-menu od-render-mode-menu"
          position="popper"
          sideOffset={6}
          align="end"
        >
          <SelectViewport>
            {(
              [
                { value: "isolated", label: "Iframe" },
                { value: "shadow", label: "Shadow DOM" },
                { value: "host", label: "Host DOM" },
              ] as const
            ).map((mode) => (
              <SelectItem
                key={mode.value}
                value={mode.value}
                className="od-menu-item"
                disabled={customization && mode.value === "isolated"}
              >
                <SelectItemIndicator className="od-menu-check">
                  <Check size={14} />
                </SelectItemIndicator>
                <SelectItemText>{mode.label}</SelectItemText>
              </SelectItem>
            ))}
          </SelectViewport>
          <p className="od-render-mode-note">
            Switching modes resets preview interactions.
          </p>
          {customization && (
            <p className="od-render-mode-note">
              Custom components require Shadow DOM or host mode.
            </p>
          )}
        </SelectContent>
      </SelectPortal>
    </Select>
  );
}
