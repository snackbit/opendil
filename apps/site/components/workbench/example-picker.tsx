import "./workbench.css";
import { memo, useCallback } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPortal,
  SelectContent,
  SelectViewport,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
} from "@snackbit/opendil/lib";
import { Check, ChevronDown } from "lucide-react";
import { examples, type ExampleDefinition } from "@/lib/examples/catalog";
export interface ExamplePickerProps {
  value: string;
  onChange: (id: string) => void;
  items?: readonly ExampleDefinition[];
  label?: string;
  compact?: boolean;
  detail?: ((example: ExampleDefinition) => string) | undefined;
  filename?: boolean;
}
export const ExamplePicker = memo(function ExamplePicker({
  value,
  onChange,
  items = examples,
  label = "Open example",
  compact = false,
  detail,
  filename = false,
}: ExamplePickerProps) {
  const change = useCallback(
    (id: string) => {
      if (items.some((example) => example.id === id)) onChange(id);
    },
    [onChange, items],
  );
  return (
    <Select value={value} onValueChange={change}>
      <SelectTrigger
        className={
          "od-example-picker" + (compact ? " od-example-picker-compact" : "")
        }
        aria-label={label}
      >
        <SelectValue />
        <ChevronDown size={16} />
      </SelectTrigger>
      <SelectPortal>
        <SelectContent
          className="od-menu od-example-menu"
          data-compact={compact}
          position="popper"
          sideOffset={8}
        >
          <SelectViewport>
            {(compact
              ? ["Examples"]
              : ["Patterns", "Components", "Advanced"]
            ).map((group) => (
              <SelectGroup key={group}>
                {!compact && (
                  <SelectLabel className="od-menu-group">{group}</SelectLabel>
                )}
                {items
                  .filter((example) => compact || example.group === group)
                  .map((example) => (
                    <SelectItem
                      key={example.id}
                      value={example.id}
                      className="od-menu-item"
                    >
                      <SelectItemIndicator className="od-menu-check">
                        <Check size={14} />
                      </SelectItemIndicator>
                      <SelectItemText>
                        {filename ? example.id + ".dil" : example.title}
                      </SelectItemText>
                      {detail && (
                        <small className="od-example-detail">
                          {detail(example)}
                        </small>
                      )}
                    </SelectItem>
                  ))}
              </SelectGroup>
            ))}
          </SelectViewport>
        </SelectContent>
      </SelectPortal>
    </Select>
  );
});
