import { memo, useCallback } from "react";
import { Slider } from "@snackbit/opendil/ui";
import { positionRate, ratePosition } from "../../playback/replay-delivery";
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
      if (rate !== undefined) onChange(positionRate(rate));
    },
    [onChange],
  );
  return (
    <div className="od-demo-rate-control">
      <span className="od-demo-speed-label">Animation speed</span>
      <span className="od-demo-rate">{value} tok/s</span>
      <Slider
        aria-label="Animation speed"
        aria-valuetext={value + " tokens per second"}
        min={0}
        max={1000}
        step={1}
        value={[ratePosition(value)]}
        onValueChange={change}
      />
    </div>
  );
});
