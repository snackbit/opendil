import { memo, useCallback } from "react";
import { Slider } from "@snackbit/opendil/ui";
export interface HeroRateProps {
  value: number;
  onChange: (value: number) => void;
}
export const HeroRate = memo(function HeroRate({
  value,
  onChange,
}: HeroRateProps) {
  const change = useCallback(
    (values: number[]) => {
      const rate = values[0];
      if (rate !== undefined) onChange(rate);
    },
    [onChange],
  );
  return (
    <div className="od-demo-rate-control">
      <span className="od-demo-rate">{value} tok/s</span>
      <Slider
        aria-label="Demo token rate"
        aria-valuetext={value + " tokens per second"}
        min={5}
        max={300}
        step={1}
        value={[value]}
        onValueChange={change}
      />
    </div>
  );
});
