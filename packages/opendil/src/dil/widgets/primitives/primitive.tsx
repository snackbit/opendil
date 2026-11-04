"use client";
import { createElement, lazy, Suspense, type ReactNode } from "react";
import { Circle } from "lucide-react";
import { ICONS, LABELS, SIZES, SVG_ELEMENTS } from "./vocabulary";
import { Badge } from "../../../components/ui/display/badge";
import { Separator } from "../../../components/ui/display/separator";
import {
  Table,
  TableBody,
  TableCell,
} from "../../../components/ui/display/table";
import {
  Popover,
  PopoverContent,
} from "../../../components/ui/overlays/popover";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "../../../components/ui/media/carousel";
import type { DilNode } from "../../parser/types";
import type { DilDocument } from "../../runtime/document";
import type { Scope } from "../../runtime/expressions";
import { AsyncImage } from "../async-image";
import { CodeBlock } from "../code-block";
import { DilChart } from "../charts/dil-chart";
import {
  ButtonControl,
  CheckboxControl,
  InputControl,
  PopoverTriggerScope,
  PressableControl,
  RadioControl,
  RadioGroupControl,
  SegmentedControl,
  SliderControl,
} from "../controls";
import {
  color,
  layoutStyle,
  svgAttributes,
  text,
  type Attributes,
} from "./attribute-values";
import { DilTableRow, TableScope } from "../../view/table-context";
import { NodeGraph } from "../graphs/node-graph";
import { RenderLimit } from "../../view/render-limit";
import { useReportProblem } from "../../view/render-boundary";
import { UNSHOWN_PART_MESSAGE } from "../../render-error";
import { useCustomization } from "../../customization";
import { CustomComponent } from "../../custom-component";
import { cn } from "../../../lib/cn";
import { usePresentationTarget } from "../../view/reveal/presentation";
const MermaidDiagram = lazy(() =>
  import("../mermaid-diagram").then((module) => ({
    default: module.MermaidDiagram,
  })),
);

export interface PrimitiveProps {
  node: DilNode;
  attributes: Attributes;
  children: ReactNode;
  document: DilDocument;
  scope: Scope;
  instance: string;
  svg: boolean;
  inline: boolean;
  interactive: boolean;
}
export function Primitive({
  node,
  attributes: sourceAttributes,
  children,
  document,
  instance,
  svg,
  inline,
  interactive,
}: PrimitiveProps) {
  const customization = useCustomization();
  const attributes = {
    ...customization.componentConfig?.[node.name],
    ...sourceAttributes,
  };
  const structural =
    [
      "row",
      "grid",
      "grid-item",
      "box",
      "table",
      "table-cell",
      "popover",
      "popover-trigger",
      "popover-content",
      "carousel",
      "carousel-item",
      "icon",
      "spacer",
      "label",
      "divider",
    ].includes(node.name) &&
    !attributes.border &&
    !attributes.background;
  const presentationRef = usePresentationTarget(
    "node:" + node.id + ":" + instance,
    !svg && !inline && !structural,
  );
  const Component = Object.hasOwn(customization.components ?? {}, node.name)
    ? customization.components?.[node.name]
    : undefined;
  if (Component)
    return (
      <CustomComponent
        component={Component}
        name={node.name}
        attributes={attributes}
        config={customization.componentConfig?.[node.name] ?? {}}
        className={customization.classNames?.[node.name] ?? ""}
        slots={customization.slots?.[node.name] ?? {}}
        ready={
          interactive &&
          node.status !== "streaming" &&
          !document.engine.stopped &&
          !document.renderLimited
        }
        presentationRef={presentationRef}
      >
        {children}
      </CustomComponent>
    );
  const ready =
    interactive &&
    node.status !== "streaming" &&
    !document.engine.stopped &&
    !document.renderLimited;
  const valueSource = node.attributes.value?.expression ?? "";
  const label = text(
    attributes["aria-label"],
    LABELS[valueSource] ?? text(attributes.placeholder),
  );
  const common = {
    attributes,
    children,
    ready,
    label,
    className: customization.classNames?.[node.name],
    presentationRef,
  };
  const style = layoutStyle(attributes);
  if (node.name === "svg" || (svg && SVG_ELEMENTS.has(node.name)))
    return createElement(node.name, svgAttributes(attributes), children);
  switch (node.name) {
    case "NodeGraph":
      return (
        <RenderLimit
          document={document}
          cost={Math.ceil(
            JSON.stringify(attributes.content ?? {}).length / 128,
          )}
        >
          <NodeGraph
            attributes={attributes}
            presentationRef={presentationRef}
          />
        </RenderLimit>
      );
    case "Mermaid":
      return (
        <RenderLimit
          document={document}
          cost={50 + Math.ceil(text(attributes.source).length / 16)}
        >
          <Suspense fallback={null}>
            <MermaidDiagram
              source={text(attributes.source)}
              presentationRef={presentationRef}
            />
          </Suspense>
        </RenderLimit>
      );
    case "box":
    case "row":
    case "grid":
    case "grid-item":
      return (
        <div
          data-d-component={node.name}
          ref={presentationRef}
          data-wrap={text(attributes.wrap)}
          className={cn(
            `dil-layout${node.name === "row" ? " dil-row" : node.name === "grid" ? " dil-grid" : ""}`,
            customization.classNames?.[node.name],
          )}
          style={style}
        >
          {children}
        </div>
      );
    case "text":
    case "caption":
    case "title": {
      const tag = node.name === "title" ? "h3" : "span";
      return createElement(
        tag,
        {
          "data-d-component": node.name,
          ref: presentationRef,
          className: customization.classNames?.[node.name],
          style: {
            color:
              color(attributes.color) ??
              (node.name === "caption" ? "var(--muted-foreground)" : undefined),
            fontSize:
              SIZES[text(attributes.size)] ??
              (node.name === "caption"
                ? "0.75rem"
                : node.name === "title"
                  ? "1.125rem"
                  : undefined),
            fontWeight:
              node.name === "title"
                ? 600
                : attributes.weight === "medium"
                  ? 500
                  : undefined,
            fontVariantNumeric: attributes.tabularNums
              ? "tabular-nums"
              : undefined,
            lineHeight: node.name === "title" ? 1.35 : undefined,
            margin: 0,
          },
        },
        children,
      );
    }
    case "badge":
      return (
        <Badge
          ref={presentationRef}
          variant="secondary"
          style={{
            color: color(attributes.color),
            backgroundColor:
              attributes.color === "success"
                ? "var(--dil-success-surface)"
                : attributes.color === "warning"
                  ? "var(--dil-warning-surface)"
                  : attributes.color === "danger"
                    ? "var(--dil-danger-surface)"
                    : undefined,
          }}
          className={cn(
            "gap-1 whitespace-nowrap",
            customization.classNames?.[node.name],
          )}
        >
          {children}
        </Badge>
      );
    case "divider":
      return <Separator />;
    case "icon": {
      const Icon = ICONS[text(attributes.name)] ?? Circle;
      return (
        <Icon
          aria-hidden="true"
          className="inline-block shrink-0 align-middle"
          size={
            attributes.size === "xs" ? 13 : attributes.size === "lg" ? 22 : 17
          }
          style={{ color: color(attributes.color) }}
        />
      );
    }
    case "button":
      return (
        <ButtonControl
          {...common}
          status={document.status}
          label={
            label || (attributes.size === "xs" ? "Dismiss notification" : "")
          }
        />
      );
    case "pressable":
      return <PressableControl {...common} status={document.status} />;
    case "checkbox":
      return <CheckboxControl {...common} />;
    case "slider":
      return <SliderControl {...common} />;
    case "input":
      return <InputControl {...common} />;
    case "segmented-control":
      return <SegmentedControl {...common} />;
    case "radio-group":
      return <RadioGroupControl {...common} />;
    case "radio":
      return <RadioControl {...common} />;
    case "label":
      return <span className="text-sm font-medium">{children}</span>;
    case "spacer":
      return <span className="flex-1" />;
    case "Chart":
      return (
        <RenderLimit
          document={document}
          cost={Math.ceil(JSON.stringify(attributes.content ?? {}).length / 64)}
        >
          <DilChart
            content={attributes.content}
            presentationRef={presentationRef}
          />
        </RenderLimit>
      );
    case "AsyncImage":
      return (
        <AsyncImage
          query={text(attributes.query)}
          presentationRef={presentationRef}
        />
      );
    case "CodeBlock":
      return (
        <CodeBlock
          presentationRef={presentationRef}
          source={node.text}
          language={text(attributes.language)}
          editable={attributes.editable === true}
          ready={ready}
          document={document}
          identity={`${node.id}${instance}`}
        />
      );
    case "popover":
      return <Popover>{children}</Popover>;
    case "popover-trigger":
      return (
        <PopoverTriggerScope.Provider value={true}>
          {children}
        </PopoverTriggerScope.Provider>
      );
    case "popover-content":
      return (
        <PopoverContent
          side={attributes.side === "top" ? "top" : "bottom"}
          align={attributes.align === "end" ? "end" : "center"}
          className="w-auto max-w-[calc(100vw-2rem)]"
        >
          {/* Stacks inline children such as consecutive <text> lines. */}
          <div className="dil-flow gap-2">{children}</div>
        </PopoverContent>
      );
    case "carousel":
      return (
        <Carousel className="w-full min-w-0">
          <CarouselContent>{children}</CarouselContent>
          <CarouselPrevious className="left-2" />
          <CarouselNext className="right-2" />
        </Carousel>
      );
    case "carousel-item":
      return (
        <CarouselItem className="basis-4/5">
          <div className="dil-flow gap-2">{children}</div>
        </CarouselItem>
      );
    case "table":
      return (
        <Table>
          <TableBody>
            <TableScope.Provider value="body">{children}</TableScope.Provider>
          </TableBody>
        </Table>
      );
    case "table-row":
      return (
        <DilTableRow presentationRef={presentationRef}>{children}</DilTableRow>
      );
    case "table-cell":
      return (
        <TableCell className="px-2 py-3 align-middle" style={style}>
          <TableScope.Provider value={false}>{children}</TableScope.Provider>
        </TableCell>
      );
    default:
      return <UnsupportedComponent node={node} document={document} />;
  }
}
/** Readers see generic wording; the host learns which name is missing. */
function UnsupportedComponent({
  node,
  document,
}: {
  node: DilNode;
  document: DilDocument;
}) {
  useReportProblem(document, {
    kind: "syntax",
    message: `<${node.name}> is neither a stock DIL component nor one passed in the components prop.`,
    offset: node.offset,
  });
  return (
    <div
      role="alert"
      className="rounded border border-destructive/30 p-3 text-sm text-destructive"
    >
      {UNSHOWN_PART_MESSAGE}
    </div>
  );
}
