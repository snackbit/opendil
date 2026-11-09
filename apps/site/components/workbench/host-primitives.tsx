import { createContext, useContext, type KeyboardEvent } from "react";
import { Checkbox, Popover, Slider, Tooltip } from "radix-ui";
import type {
  DilButtonProps,
  DilCheckboxProps,
  DilInputProps,
  DilPopoverContentProps,
  DilSliderProps,
  DilToggleGroupItemProps,
  DilToggleGroupProps,
  DilTooltipProps,
  DilUiPrimitives,
} from "@snackbit/opendil";

/**
 * A stand-in for an application's own design system, built on Radix like
 * shadcn/ui. The customization demo injects it into stock widgets; its styles
 * reach a Shadow DOM renderer only through shadowStyles, while its accent
 * custom property inherits from the page into either mode.
 *
 * The toggle group moves focus itself: Radix's roving focus compares
 * document.activeElement, which is the shadow host inside a ShadowRoot, so
 * its arrow keys skip to the last option there.
 */
export const HOST_PRIMITIVE_STYLES = `
.demo-ds-button{display:inline-flex;align-items:center;gap:6px;border:2px solid var(--demo-ds-accent);border-radius:2px;padding:4px 12px;font:inherit;font-weight:700;background:var(--demo-ds-accent);color:#fff;cursor:pointer}
.demo-ds-button[data-variant=outline],.demo-ds-button[data-variant=ghost]{background:transparent;color:var(--demo-ds-accent)}
.demo-ds-button:focus-visible,.demo-ds-toggle-item:focus-visible,.demo-ds-checkbox:focus-visible{outline:3px dashed var(--demo-ds-accent);outline-offset:2px}
.demo-ds-button:disabled{opacity:.5;cursor:default}
.demo-ds-checkbox{width:18px;height:18px;border:2px solid var(--demo-ds-accent);border-radius:0;background:#fff;display:inline-grid;place-content:center;padding:0}
.demo-ds-checkbox[data-state=checked]{background:var(--demo-ds-accent)}
.demo-ds-input{border:2px solid var(--demo-ds-accent);border-radius:0;padding:4px 8px;font:inherit;background:transparent;color:inherit}
.demo-ds-toggle-group{display:inline-flex;gap:0;border:2px solid var(--demo-ds-accent)}
.demo-ds-toggle-item{border:0;padding:4px 10px;font:inherit;background:transparent;color:inherit;cursor:pointer}
.demo-ds-toggle-item[data-state=on]{background:var(--demo-ds-accent);color:#fff}
.demo-ds-slider{position:relative;display:flex;align-items:center;height:20px;width:100%}
.demo-ds-slider-track{position:relative;flex:1;height:4px;background:#ddd}
.demo-ds-slider-range{position:absolute;height:100%;background:var(--demo-ds-accent)}
.demo-ds-slider-thumb{display:block;width:14px;height:14px;background:var(--demo-ds-accent)}
.demo-ds-popover{border:2px solid var(--demo-ds-accent);padding:10px;background:var(--background,#fff);color:inherit;max-width:280px}
.demo-ds-tooltip{background:var(--demo-ds-accent);color:#fff;padding:2px 8px;font-size:12px}
`;
function Button({ variant, size, className, ...props }: DilButtonProps) {
  return (
    <button
      {...props}
      data-host-primitive="button"
      data-variant={variant ?? "default"}
      data-size={size ?? "default"}
      className={["demo-ds-button", className].filter(Boolean).join(" ")}
    />
  );
}
function HostCheckbox(props: DilCheckboxProps) {
  return (
    <Checkbox.Root
      {...props}
      data-host-primitive="checkbox"
      className="demo-ds-checkbox"
    >
      <Checkbox.Indicator>✓</Checkbox.Indicator>
    </Checkbox.Root>
  );
}
function Input({ className, ...props }: DilInputProps) {
  return (
    <input
      {...props}
      data-host-primitive="input"
      className={["demo-ds-input", className].filter(Boolean).join(" ")}
    />
  );
}
function HostSlider(props: DilSliderProps) {
  return (
    <Slider.Root
      {...props}
      data-host-primitive="slider"
      className="demo-ds-slider"
    >
      <Slider.Track className="demo-ds-slider-track">
        <Slider.Range className="demo-ds-slider-range" />
      </Slider.Track>
      <Slider.Thumb
        className="demo-ds-slider-thumb"
        aria-label={props["aria-label"]}
      />
    </Slider.Root>
  );
}
const Toggle = createContext<{
  value: string;
  choose: (value: string) => void;
  disabled: boolean;
}>({ value: "", choose: () => {}, disabled: false });
const STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};
function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  const step = STEPS[event.key];
  if (!step) return;
  const options = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
      '[role="radio"]:not(:disabled)',
    ),
  ];
  const index = options.findIndex((option) => option === event.target);
  const next = options[(index + step + options.length) % options.length];
  if (!next) return;
  event.preventDefault();
  next.focus();
}
function ToggleRoot({
  ref,
  value,
  onValueChange,
  disabled = false,
  className,
  children,
  "aria-label": label,
}: DilToggleGroupProps) {
  return (
    <Toggle.Provider value={{ value, choose: onValueChange, disabled }}>
      <div
        ref={ref}
        role="radiogroup"
        aria-label={label}
        onKeyDown={moveFocus}
        data-host-primitive="toggle-group"
        className={["demo-ds-toggle-group", className]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </div>
    </Toggle.Provider>
  );
}
function ToggleItem({ value, children }: DilToggleGroupItemProps) {
  const toggle = useContext(Toggle);
  const checked = toggle.value === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      data-state={checked ? "on" : "off"}
      tabIndex={checked ? 0 : -1}
      disabled={toggle.disabled}
      onClick={() => toggle.choose(value)}
      data-host-primitive="toggle-item"
      className="demo-ds-toggle-item"
    >
      {children}
    </button>
  );
}
function PopoverContent({
  portalContainer,
  className: _className,
  ...props
}: DilPopoverContentProps) {
  return (
    <Popover.Portal container={portalContainer}>
      <Popover.Content
        {...props}
        sideOffset={6}
        data-host-primitive="popover"
        className="demo-ds-popover"
      />
    </Popover.Portal>
  );
}
function HostTooltip({
  label,
  children,
  open,
  portalContainer,
}: DilTooltipProps) {
  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root {...(open === undefined ? {} : { open })}>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal container={portalContainer}>
          <Tooltip.Content
            data-host-primitive="tooltip"
            className="demo-ds-tooltip"
            sideOffset={4}
          >
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
export const hostPrimitives: DilUiPrimitives = {
  Button,
  Checkbox: HostCheckbox,
  Input,
  Slider: HostSlider,
  ToggleGroup: { Root: ToggleRoot, Item: ToggleItem },
  Popover: {
    Root: Popover.Root,
    Trigger: Popover.Trigger,
    Content: PopoverContent,
  },
  Tooltip: HostTooltip,
};
export const hostPrimitivesSource = `## Your design system's controls
{@body const [period, setPeriod] = DIL.useState("week")}
{@body const [reviewed, setReviewed] = DIL.useState(false)}
<row>
<button onClick={() => setPeriod("week")}>Reset period</button>
<segmented-control aria-label="Period" value={period} onChange={setPeriod} options={[{value:"week",label:"Week"},{value:"month",label:"Month"},{value:"year",label:"Year"}]} />
</row>
<text>Period: {period}</text>
<checkbox checked={reviewed} onChange={setReviewed}>Reviewed</checkbox>
<popover>
<popover-trigger><button variant="outline">Open details</button></popover-trigger>
<popover-content><text>Details from the host popover</text></popover-content>
</popover>`;
