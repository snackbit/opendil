import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { Input, Slider } from "@snackbit/opendil/ui";
import { positionRate, ratePosition, validRate } from "./replay-delivery";
export interface ReplayRateProps {
  value: number;
  onChange: (value: number) => void;
}
export function ReplayRate({ value, onChange }: ReplayRateProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const input = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setDraft(event.currentTarget.value);
      const next = event.currentTarget.valueAsNumber;
      if (validRate(next)) onChange(next);
    },
    [onChange],
  );
  const blur = useCallback(() => setDraft(String(value)), [value]);
  const slide = useCallback(
    (positions: number[]) => onChange(positionRate(positions[0] ?? 0)),
    [onChange],
  );
  const key = useCallback(
    (event: KeyboardEvent<HTMLSpanElement>) => {
      const next =
        event.key === "Home"
          ? 1
          : event.key === "End"
            ? 1000
            : ["ArrowRight", "ArrowUp"].includes(event.key)
              ? value + 1
              : ["ArrowLeft", "ArrowDown"].includes(event.key)
                ? value - 1
                : undefined;
      if (next !== undefined) {
        event.preventDefault();
        onChange(Math.max(1, Math.min(1000, next)));
      }
    },
    [value, onChange],
  );
  return (
    <div className="grid gap-3 text-sm">
      <label className="flex items-center justify-between gap-3">
        Speed (tok/s)
        <Input
          aria-label="Tokens per second"
          className="w-24"
          type="number"
          min={1}
          max={1000}
          step={1}
          value={draft}
          onChange={input}
          onBlur={blur}
        />
      </label>
      <Slider
        aria-label="Replay token rate"
        aria-valuetext={value + " tokens per second"}
        min={0}
        max={1000}
        step={1}
        value={[ratePosition(value)]}
        onValueChange={slide}
        onKeyDownCapture={key}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>1</span>
        <span>10</span>
        <span>100</span>
        <span>1000</span>
      </div>
    </div>
  );
}
