"use client";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  type ChangeEvent,
  type CompositionEvent,
  type ReactNode,
} from "react";
import type { StoreApi } from "zustand/vanilla";
import { useUiPrimitives } from "../ui-primitives";
import { usePortalScope } from "../../components/ui/overlays/ui-scope";
import type { DocumentStatus } from "../runtime/document";
import { ActionFeedbackTooltip, useActionFeedback } from "./action-feedback";
import { useControlValue } from "./use-control-value";
import { cn } from "../../lib/cn";
import {
  color,
  invoke,
  layoutStyle,
  number,
  record,
  text,
  type Attributes,
} from "./primitives/attribute-values";

export const PopoverTriggerScope = createContext(false);
export interface ControlProps {
  attributes: Attributes;
  children?: ReactNode;
  ready: boolean;
  label: string;
  className?: string | undefined;
  presentationRef?: ((element: HTMLElement | null) => void) | undefined;
}
/** Actions report clipboard outcomes from their own document. */
export interface ActionProps extends ControlProps {
  status: StoreApi<DocumentStatus>;
}
export function ButtonControl({
  attributes,
  children,
  ready,
  label,
  className,
  presentationRef,
  status,
}: ActionProps) {
  const trigger = useContext(PopoverTriggerScope);
  const { Button, Popover } = useUiPrimitives();
  const [feedback, track] = useActionFeedback(status);
  const click = useCallback(() => {
    track(invoke(attributes, "onClick"));
  }, [attributes, track]);
  const variant =
    attributes.variant === "outline"
      ? "outline"
      : attributes.variant === "ghost"
        ? "ghost"
        : "default";
  const size =
    attributes.size === "sm"
      ? "sm"
      : attributes.size === "xs"
        ? "xs"
        : "default";
  const button = (
    <Button
      ref={presentationRef}
      type="button"
      variant={variant}
      size={size}
      disabled={!ready || attributes.disabled === true}
      onClick={click}
      data-dil-action=""
      aria-label={label || undefined}
      className={cn(attributes.block ? "w-full" : undefined, className)}
    >
      {children}
    </Button>
  );
  return (
    <ActionFeedbackTooltip feedback={feedback}>
      {trigger ? <Popover.Trigger asChild>{button}</Popover.Trigger> : button}
    </ActionFeedbackTooltip>
  );
}
export function CheckboxControl({
  attributes,
  children,
  ready,
  className,
  presentationRef,
}: ControlProps) {
  const [value, setValue] = useControlValue(
    attributes.checked === true,
    attributes.onChange,
  );
  const { Checkbox } = useUiPrimitives();
  const id = useId();
  const change = useCallback(
    (checked: boolean | "indeterminate") => {
      setValue(checked === true);
    },
    [setValue],
  );
  return (
    <label
      ref={presentationRef}
      htmlFor={id}
      className={cn(
        "flex min-h-8 cursor-pointer items-center gap-2 text-sm",
        className,
      )}
    >
      <Checkbox
        id={id}
        checked={value}
        onCheckedChange={change}
        disabled={!ready || attributes.disabled === true}
      />
      <span
        className={
          attributes.checked && attributes.lineThrough !== false
            ? "text-muted-foreground line-through"
            : ""
        }
      >
        {children}
      </span>
    </label>
  );
}
export function SliderControl({
  attributes,
  ready,
  label,
  className,
  presentationRef,
}: ControlProps) {
  const [value, setValue] = useControlValue(
    number(attributes.value),
    attributes.onChange,
  );
  const change = useCallback(
    (values: number[]) => {
      setValue(values[0] ?? 0);
    },
    [setValue],
  );
  const { Slider } = useUiPrimitives();
  const marks: unknown[] = Array.isArray(attributes.marks)
    ? attributes.marks
    : [];
  return (
    <div
      ref={presentationRef}
      className={cn("py-2", className)}
      data-dil-copy-text={label ? `${label}: ${value}` : String(value)}
    >
      <Slider
        aria-label={label}
        value={[value]}
        min={number(attributes.min)}
        max={number(attributes.max, 100)}
        step={number(attributes.step, 1)}
        disabled={!ready || attributes.disabled === true}
        onValueChange={change}
      />
      {marks.length > 0 && (
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          {marks.map((mark, index) => (
            <span key={index}>{text(record(mark).label)}</span>
          ))}
        </div>
      )}
    </div>
  );
}
export function InputControl({
  attributes,
  ready,
  label,
  className,
  presentationRef,
}: ControlProps) {
  const [value, setValue] = useControlValue(
    text(attributes.value),
    attributes.onChange,
  );
  const { Input } = useUiPrimitives();
  const composing = useRef(false);
  const startComposition = useCallback(() => {
    composing.current = true;
  }, []);
  const endComposition = useCallback(
    (event: CompositionEvent<HTMLInputElement>) => {
      composing.current = false;
      setValue(event.currentTarget.value);
    },
    [setValue],
  );
  const change = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setValue(event.target.value, !composing.current);
    },
    [setValue],
  );
  return (
    <Input
      ref={presentationRef}
      className={className}
      aria-label={label}
      value={value}
      placeholder={text(attributes.placeholder)}
      onChange={change}
      onCompositionStart={startComposition}
      onCompositionEnd={endComposition}
      disabled={!ready || attributes.disabled === true}
    />
  );
}
export function SegmentedControl({
  attributes,
  ready,
  label,
  className,
  presentationRef,
}: ControlProps) {
  const change = useCallback(
    (value: string) => {
      if (value) invoke(attributes, "onChange", value);
    },
    [attributes],
  );
  const { ToggleGroup } = useUiPrimitives();
  const options: unknown[] = Array.isArray(attributes.options)
    ? attributes.options
    : [];
  return (
    <ToggleGroup.Root
      ref={presentationRef}
      type="single"
      aria-label={label}
      value={text(attributes.value)}
      onValueChange={change}
      disabled={!ready}
      segmented
      className={cn(className)}
      size="sm"
    >
      {options.map((option) => {
        const data = record(option);
        return (
          <ToggleGroup.Item
            key={text(data.value)}
            value={text(data.value)}
            className="rounded-md text-xs data-[state=on]:bg-background data-[state=on]:shadow-sm"
          >
            {text(data.label)}
          </ToggleGroup.Item>
        );
      })}
    </ToggleGroup.Root>
  );
}
export function RadioGroupControl({
  attributes,
  children,
  ready,
  label,
  className,
  presentationRef,
}: ControlProps) {
  const change = useCallback(
    (value: string) => {
      invoke(attributes, "onChange", value);
    },
    [attributes],
  );
  const { RadioGroup } = useUiPrimitives();
  return (
    <RadioGroup.Root
      ref={presentationRef}
      aria-label={label}
      value={text(attributes.value)}
      onValueChange={change}
      disabled={!ready}
      className={cn(
        attributes.direction === "row" ? "flex flex-wrap gap-4" : undefined,
        className,
      )}
    >
      {children}
    </RadioGroup.Root>
  );
}
export function RadioControl({
  attributes,
  children,
  ready,
  className,
  presentationRef,
}: ControlProps) {
  const id = useId();
  const { RadioGroup } = useUiPrimitives();
  return (
    <label
      ref={presentationRef}
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-center gap-2 text-sm",
        className,
      )}
    >
      <RadioGroup.Item
        id={id}
        value={text(attributes.value)}
        disabled={!ready}
      />
      {children}
    </label>
  );
}
export function PopoverControl({ children }: { children?: ReactNode }) {
  const { Popover } = useUiPrimitives();
  return <Popover.Root>{children}</Popover.Root>;
}
export function PopoverContentControl({
  attributes,
  children,
}: {
  attributes: Attributes;
  children?: ReactNode;
}) {
  const { Popover } = useUiPrimitives();
  const { container } = usePortalScope();
  return (
    <Popover.Content
      side={attributes.side === "top" ? "top" : "bottom"}
      align={attributes.align === "end" ? "end" : "center"}
      className="w-auto max-w-[calc(100vw-2rem)]"
      portalContainer={container}
    >
      {/* Stacks inline children such as consecutive <text> lines. */}
      <div className="dil-flow gap-2">{children}</div>
    </Popover.Content>
  );
}
export function PressableControl({
  attributes,
  children,
  ready,
  className,
  presentationRef,
  status,
}: ActionProps) {
  const [feedback, track] = useActionFeedback(status);
  const click = useCallback(() => {
    track(invoke(attributes, "onClick"));
  }, [attributes, track]);
  return (
    <ActionFeedbackTooltip feedback={feedback}>
      <button
        ref={presentationRef}
        type="button"
        onClick={click}
        data-dil-action=""
        data-dil-copy="content"
        disabled={!ready}
        className={cn(
          "dil-layout w-full text-left outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        style={{ ...layoutStyle(attributes), color: color(attributes.color) }}
      >
        {children}
      </button>
    </ActionFeedbackTooltip>
  );
}
