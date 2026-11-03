import { useCallback } from "react";
import { Select } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import type { RenderMode } from "../demo-renderer";

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
    <Select.Root value={value} onValueChange={change}>
      <Select.Trigger
        className="od-render-mode-picker"
        aria-label="Rendering mode"
      >
        <Select.Value />
        <ChevronDown size={13} aria-hidden="true" />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="od-menu od-render-mode-menu"
          position="popper"
          sideOffset={6}
          align="end"
        >
          <Select.Viewport>
            {(
              [
                { value: "isolated", label: "Iframe" },
                { value: "shadow", label: "Shadow DOM" },
                { value: "host", label: "Host DOM" },
              ] as const
            ).map((mode) => (
              <Select.Item
                key={mode.value}
                value={mode.value}
                className="od-menu-item"
                disabled={customization && mode.value === "isolated"}
              >
                <Select.ItemIndicator className="od-menu-check">
                  <Check size={14} />
                </Select.ItemIndicator>
                <Select.ItemText>{mode.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
          <p className="od-render-mode-note">
            Switching modes resets preview interactions.
          </p>
          {customization && (
            <p className="od-render-mode-note">
              Custom components require Shadow DOM or host mode.
            </p>
          )}
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
