import "./playback.css";
import {
  useCallback,
  useId,
  type ChangeEvent,
  type FocusEvent,
  type ReactNode,
} from "react";
import { Settings2 } from "lucide-react";
import {
  Button,
  Checkbox,
  Input,
  Popover,
  PopoverTrigger,
  PopoverContent,
  ToggleGroupItem,
  Tooltip,
} from "@snackbit/opendil/lib";
import { SegmentedControl } from "@/components/workbench/shell-scope";
import type { StressSpeed } from "./replay-delivery";
import type { RenderMode } from "./demo-renderer";
import { ReplayRate } from "./replay-rate";
import type { UpdateInterval } from "@snackbit/opendil";
export interface DemoSettingsProps {
  children?: ReactNode;
  enabled: boolean;
  staggerMs: number;
  durationMs: number;
  tokensPerSecond: number;
  benchmark: boolean;
  stressSpeed: StressSpeed;
  mode: RenderMode;
  customization: boolean;
  autoScroll: boolean;
  onEnabled: (enabled: boolean) => void;
  onStagger: (value: number) => void;
  onDuration: (value: number) => void;
  onRate: (rate: number) => void;
  onStress: (speed: StressSpeed) => void;
  onMode: (mode: RenderMode) => void;
  onAutoScroll: (enabled: boolean) => void;
  scrollBehavior: "instant" | "smooth";
  scrollPadding: number;
  onScrollBehavior: (value: "instant" | "smooth") => void;
  onScrollPadding: (value: number) => void;
  updateInterval: UpdateInterval;
  onUpdateInterval: (value: UpdateInterval) => void;
}
function TimingField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const change = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = event.currentTarget.valueAsNumber;
      if (Number.isFinite(next) && next >= 0) onChange(next);
    },
    [onChange],
  );
  const blur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      if (
        !Number.isFinite(event.currentTarget.valueAsNumber) ||
        event.currentTarget.valueAsNumber < 0
      )
        event.currentTarget.value = String(value);
    },
    [value],
  );
  return (
    <label htmlFor={id} className="grid gap-2 text-sm">
      {label}
      <Input
        id={id}
        type="number"
        min={0}
        step={10}
        defaultValue={value}
        onChange={change}
        onBlur={blur}
      />
    </label>
  );
}
export function DemoSettings({
  children,
  enabled,
  staggerMs,
  durationMs,
  tokensPerSecond,
  benchmark,
  stressSpeed,
  mode,
  customization,
  autoScroll,
  onEnabled,
  onStagger,
  onDuration,
  onRate,
  onStress,
  onMode,
  onAutoScroll,
  scrollBehavior,
  scrollPadding,
  onScrollBehavior,
  onScrollPadding,
  updateInterval,
  onUpdateInterval,
}: DemoSettingsProps) {
  const reveal = useCallback(
    (value: boolean | "indeterminate") => onEnabled(value === true),
    [onEnabled],
  );
  const follow = useCallback(
    (value: boolean | "indeterminate") => onAutoScroll(value === true),
    [onAutoScroll],
  );
  const changeStress = useCallback(
    (value: string) => {
      if (value === "1" || value === "4" || value === "16") onStress(value);
    },
    [onStress],
  );
  const changeMode = useCallback(
    (value: string) => {
      if (value === "isolated" || value === "shadow" || value === "host")
        onMode(value);
    },
    [onMode],
  );
  const changeScroll = useCallback(
    (value: string) => {
      if (value === "instant" || value === "smooth") onScrollBehavior(value);
    },
    [onScrollBehavior],
  );
  const changeUpdates = useCallback(
    (value: string) => {
      if (value === "instant") onUpdateInterval("instant");
      if (value === "timed") onUpdateInterval(200);
    },
    [onUpdateInterval],
  );
  return (
    <Popover>
      <Tooltip label="Demo settings">
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Demo settings"
          >
            <Settings2 size={16} />
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent
        align="end"
        collisionPadding={16}
        className="od-demo-settings max-w-[calc(100vw-2rem)]"
      >
        <div className="grid gap-4">
          <h2 className="text-sm font-semibold">Demo settings</h2>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={enabled} onCheckedChange={reveal} />
            Progressive reveal
          </label>
          <div className="grid grid-cols-2 items-end gap-3">
            <TimingField
              label="Reveal step delay (ms)"
              value={staggerMs}
              onChange={onStagger}
            />
            <TimingField
              label="Fade duration (ms)"
              value={durationMs}
              onChange={onDuration}
            />
          </div>
          <div className="grid gap-2 text-sm">
            {benchmark ? (
              <>
                <span>Character stress workload</span>
                <SegmentedControl
                  value={stressSpeed}
                  onValueChange={changeStress}
                  aria-label="Character stress workload"
                >
                  <ToggleGroupItem value="1">1×</ToggleGroupItem>
                  <ToggleGroupItem value="4">4×</ToggleGroupItem>
                  <ToggleGroupItem value="16">16×</ToggleGroupItem>
                </SegmentedControl>
              </>
            ) : (
              <ReplayRate value={tokensPerSecond} onChange={onRate} />
            )}
          </div>
          <div className="grid gap-2 text-sm">
            <span>Streaming updates</span>
            <SegmentedControl
              value={updateInterval === "instant" ? "instant" : "timed"}
              onValueChange={changeUpdates}
              aria-label="Streaming update cadence"
            >
              <ToggleGroupItem value="instant">Instant</ToggleGroupItem>
              <ToggleGroupItem value="timed">Timed</ToggleGroupItem>
            </SegmentedControl>
            {updateInterval !== "instant" && (
              <TimingField
                label="Update interval (ms)"
                value={updateInterval}
                onChange={onUpdateInterval}
              />
            )}
          </div>
          <div className="grid gap-2 text-sm">
            <span>Rendering</span>
            <SegmentedControl
              value={mode}
              onValueChange={changeMode}
              aria-label="Rendering mode"
            >
              <ToggleGroupItem value="isolated" disabled={customization}>
                Iframe
              </ToggleGroupItem>
              <ToggleGroupItem value="shadow">Shadow DOM</ToggleGroupItem>
              <ToggleGroupItem value="host">Host DOM</ToggleGroupItem>
            </SegmentedControl>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={autoScroll} onCheckedChange={follow} />
            Follow streaming content
          </label>
          <SegmentedControl
            value={scrollBehavior}
            onValueChange={changeScroll}
            aria-label="Scroll behavior"
          >
            <ToggleGroupItem value="instant">Instant</ToggleGroupItem>
            <ToggleGroupItem value="smooth">Smooth</ToggleGroupItem>
          </SegmentedControl>
          <TimingField
            label="Scroll ahead (px)"
            value={scrollPadding}
            onChange={onScrollPadding}
          />
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}
