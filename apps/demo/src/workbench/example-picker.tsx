import { memo, useCallback } from "react";
import { Select } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { examples, type ExampleDefinition } from "../examples/catalog";
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
    <Select.Root value={value} onValueChange={change}>
      <Select.Trigger
        className={
          "od-example-picker" + (compact ? " od-example-picker-compact" : "")
        }
        aria-label={label}
      >
        <Select.Value />
        <ChevronDown size={16} />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="od-menu od-example-menu"
          data-compact={compact}
          position="popper"
          sideOffset={8}
        >
          <Select.Viewport>
            {(compact
              ? ["Examples"]
              : ["Patterns", "Components", "Advanced"]
            ).map((group) => (
              <Select.Group key={group}>
                {!compact && (
                  <Select.Label className="od-menu-group">{group}</Select.Label>
                )}
                {items
                  .filter((example) => compact || example.group === group)
                  .map((example) => (
                    <Select.Item
                      key={example.id}
                      value={example.id}
                      className="od-menu-item"
                    >
                      <Select.ItemIndicator className="od-menu-check">
                        <Check size={14} />
                      </Select.ItemIndicator>
                      <Select.ItemText>
                        {filename ? example.id + ".dil" : example.title}
                      </Select.ItemText>
                      {detail && (
                        <small className="od-example-detail">
                          {detail(example)}
                        </small>
                      )}
                    </Select.Item>
                  ))}
              </Select.Group>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
});
