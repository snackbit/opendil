"use client";
import {
  createContext,
  useContext,
  type ComponentPropsWithRef,
  type ComponentType,
  type ReactNode,
  type Ref,
} from "react";
import { Button } from "../components/ui/controls/button";
import { Checkbox } from "../components/ui/controls/checkbox";
import { Input } from "../components/ui/controls/input";
import {
  RadioGroup,
  RadioGroupItem,
} from "../components/ui/controls/radio-group";
import { Slider } from "../components/ui/controls/slider";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "../components/ui/controls/toggle-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/overlays/popover";
import { Tooltip } from "../components/ui/overlays/tooltip";

/*
 * The props OpenDIL passes to each primitive: a subset of the matching
 * shadcn/ui component's props. OpenDIL keeps widget behavior, state binding,
 * and actions; a primitive renders and reports input through these props.
 */
export interface DilButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: "default" | "outline" | "ghost" | undefined;
  size?: "default" | "sm" | "xs" | "icon" | "icon-sm" | undefined;
}
export interface DilCheckboxProps {
  id?: string | undefined;
  checked: boolean;
  onCheckedChange: (checked: boolean | "indeterminate") => void;
  disabled?: boolean | undefined;
}
export type DilInputProps = ComponentPropsWithRef<"input">;
export interface DilSliderProps {
  "aria-label"?: string | undefined;
  value: number[];
  min: number;
  max: number;
  step: number;
  disabled?: boolean | undefined;
  onValueChange: (value: number[]) => void;
}
export interface DilRadioGroupProps {
  ref?: Ref<HTMLDivElement> | undefined;
  "aria-label"?: string | undefined;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean | undefined;
  className?: string | undefined;
  children?: ReactNode;
}
export interface DilRadioGroupItemProps {
  id: string;
  value: string;
  disabled?: boolean | undefined;
}
export interface DilToggleGroupProps {
  ref?: Ref<HTMLDivElement> | undefined;
  type: "single";
  "aria-label"?: string | undefined;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean | undefined;
  /** Options share one track, as in OpenDIL's segmented-control. */
  segmented?: boolean;
  size?: "sm" | undefined;
  className?: string | undefined;
  children?: ReactNode;
}
export interface DilToggleGroupItemProps {
  value: string;
  className?: string | undefined;
  children?: ReactNode;
}
export interface DilPopoverProps {
  children?: ReactNode;
}
/** Always asChild: the child is the control that opens the popover. */
export interface DilPopoverTriggerProps {
  asChild: true;
  children?: ReactNode;
}
export interface DilPopoverContentProps {
  side: "top" | "bottom";
  align: "center" | "end";
  className?: string | undefined;
  children?: ReactNode;
  /**
   * Portal the content into this element, inside the renderer's scope, so it
   * keeps the answer's styles and tokens, including inside a ShadowRoot.
   * Null until the scope mounts.
   */
  portalContainer: HTMLElement | null;
}
export interface DilTooltipProps {
  label: ReactNode;
  /** The element the tooltip describes; pass it through as the trigger. */
  children: ReactNode;
  /** Controls visibility; undefined means hover and focus behavior. */
  open?: boolean | undefined;
  /** As for popover content: portal into this element. */
  portalContainer: HTMLElement | null;
}
/**
 * Host replacements for the controls and overlays that stock widgets use.
 * Grouped primitives (radio groups, toggle groups, popovers) share context,
 * so they are replaced together. Charts, graphs, diagrams, and the code
 * editor stay OpenDIL's.
 */
export interface DilUiPrimitives {
  Button?: ComponentType<DilButtonProps> | undefined;
  Checkbox?: ComponentType<DilCheckboxProps> | undefined;
  Input?: ComponentType<DilInputProps> | undefined;
  Slider?: ComponentType<DilSliderProps> | undefined;
  RadioGroup?:
    | {
        Root: ComponentType<DilRadioGroupProps>;
        Item: ComponentType<DilRadioGroupItemProps>;
      }
    | undefined;
  ToggleGroup?:
    | {
        Root: ComponentType<DilToggleGroupProps>;
        Item: ComponentType<DilToggleGroupItemProps>;
      }
    | undefined;
  Popover?:
    | {
        Root: ComponentType<DilPopoverProps>;
        Trigger: ComponentType<DilPopoverTriggerProps>;
        Content: ComponentType<DilPopoverContentProps>;
      }
    | undefined;
  Tooltip?: ComponentType<DilTooltipProps> | undefined;
}
export type ResolvedUiPrimitives = {
  [Key in keyof DilUiPrimitives]-?: NonNullable<DilUiPrimitives[Key]>;
};
// Stock overlays find the portal container through the scope themselves.
function StockPopoverContent({
  portalContainer: _container,
  ...props
}: DilPopoverContentProps) {
  return <PopoverContent {...props} />;
}
function StockTooltip({
  portalContainer: _container,
  ...props
}: DilTooltipProps) {
  return <Tooltip {...props} />;
}
export const STOCK_UI_PRIMITIVES: ResolvedUiPrimitives = {
  Button,
  Checkbox,
  Input,
  Slider,
  RadioGroup: { Root: RadioGroup, Item: RadioGroupItem },
  ToggleGroup: { Root: ToggleGroup, Item: ToggleGroupItem },
  Popover: {
    Root: Popover,
    Trigger: PopoverTrigger,
    Content: StockPopoverContent,
  },
  Tooltip: StockTooltip,
};
/** The stock set with the host's replacements applied. */
export function resolveUiPrimitives(
  host: DilUiPrimitives | undefined,
): ResolvedUiPrimitives {
  if (!host) return STOCK_UI_PRIMITIVES;
  const resolved = { ...STOCK_UI_PRIMITIVES };
  for (const key of Object.keys(
    STOCK_UI_PRIMITIVES,
  ) as (keyof DilUiPrimitives)[])
    if (host[key]) Object.assign(resolved, { [key]: host[key] });
  return resolved;
}
export const UiPrimitivesContext =
  createContext<ResolvedUiPrimitives>(STOCK_UI_PRIMITIVES);
export function useUiPrimitives() {
  return useContext(UiPrimitivesContext);
}
