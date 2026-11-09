"use client";
import {
  createElement,
  lazy,
  Suspense,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  PopoverContentControl,
  PopoverControl,
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
import { UNSHOWN_PART_MESSAGE, type DilRenderError } from "../../render-error";
import { PartProblem } from "../../view/problem-view";
import { PendingBlock } from "../../view/loading-block";
import { LiteralMarkdownNode } from "../../markdown/markdown-node";
import { useCustomization } from "../../customization";
import { CustomComponent } from "../../custom-component";
import { cn } from "../../../lib/cn";
import { usePresentationTarget } from "../../view/reveal/presentation";
import { useReservedHeight } from "../../widget-heights";
import { useMountTurn } from "../mount-queue";
const MermaidDiagram = lazy(() =>
  import("../mermaid-diagram").then((module) => ({
    default: module.MermaidDiagram,
  })),
);

/**
 * A chart or graph waits for its mount turn, holding the height it last
 * measured at this width, when it appears after its renderer's first commit,
 * or in a document seeded with recorded results whose reserve is known.
 * Otherwise, as in a live document a renderer adopts, it mounts in the first
 * commit: that commit then has the final layout, which a reserve measured
 * earlier can miss by a pixel or two.
 */
function QueuedWidget({
  document,
  nodeId,
  name,
  children,
}: {
  document: DilDocument;
  nodeId: number;
  name: string;
  children: ReactNode;
}) {
  const reserve = useReservedHeight(document.heights, nodeId);
  const [immediate] = useState(
    () => !document.presented && !(document.seeded && reserve !== undefined),
  );
  const ready = useMountTurn(immediate);
  return ready ? children : <PendingBlock name={name} reserve={reserve} />;
}
/** Mermaid holds the height it last measured at this width while it lays out. */
function MermaidWidget({
  document,
  nodeId,
  source,
  presentationRef,
}: {
  document: DilDocument;
  nodeId: number;
  source: string;
  presentationRef: (element: HTMLElement | null) => void;
}) {
  const reserve = useReservedHeight(document.heights, nodeId);
  return (
    <Suspense fallback={<PendingBlock name="Mermaid" reserve={reserve} />}>
      <MermaidDiagram
        source={source}
        presentationRef={presentationRef}
        reserve={reserve}
      />
    </Suspense>
  );
}
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
      // Its Markdown blocks reveal one by one.
      "Markdown",
    ].includes(node.name) &&
    !attributes.border &&
    !attributes.background;
  const presentationRef = usePresentationTarget(
    "node:" + node.id + ":" + instance,
    !svg && !inline && !structural,
    node.offset,
  );
  // Widgets whose height a snapshot records for the next mount's placeholder.
  const nodeId = node.id;
  const widget = useRef<HTMLElement | null>(null);
  const widgetRef = useCallback(
    (element: HTMLElement | null) => {
      presentationRef(element);
      // Repeated templates share a node id; only this instance's entry goes.
      if (element) document.widgets.set(nodeId, element);
      else if (document.widgets.get(nodeId) === widget.current)
        document.widgets.delete(nodeId);
      widget.current = element;
    },
    [presentationRef, document, nodeId],
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
          <QueuedWidget document={document} nodeId={node.id} name="NodeGraph">
            <NodeGraph attributes={attributes} presentationRef={widgetRef} />
          </QueuedWidget>
        </RenderLimit>
      );
    case "Mermaid":
      return (
        <RenderLimit
          document={document}
          cost={50 + Math.ceil(text(attributes.source).length / 16)}
        >
          <MermaidWidget
            document={document}
            nodeId={node.id}
            source={text(attributes.source)}
            presentationRef={widgetRef}
          />
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
            // A caption annotates the content before it, so it takes its own
            // line even where the parent lays children out inline (table cells).
            display: node.name === "caption" ? "block" : undefined,
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
          <QueuedWidget document={document} nodeId={node.id} name="Chart">
            <DilChart
              content={attributes.content}
              presentationRef={widgetRef}
            />
          </QueuedWidget>
        </RenderLimit>
      );
    case "AsyncImage":
      return (
        <AsyncImage
          query={text(attributes.query)}
          presentationRef={presentationRef}
        />
      );
    case "Markdown":
      return (
        <LiteralMarkdownNode
          node={node}
          document={document}
          instance={instance}
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
      return <PopoverControl>{children}</PopoverControl>;
    case "popover-trigger":
      return (
        <PopoverTriggerScope.Provider value={true}>
          {children}
        </PopoverTriggerScope.Provider>
      );
    case "popover-content":
      return (
        <PopoverContentControl attributes={attributes}>
          {children}
        </PopoverContentControl>
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
  const problem: DilRenderError = {
    kind: "syntax",
    code: "unknown-component",
    message: `<${node.name}> is neither a stock DIL component nor one passed in the components prop.`,
    offset: node.offset,
  };
  useReportProblem(document, problem);
  return <PartProblem error={problem}>{UNSHOWN_PART_MESSAGE}</PartProblem>;
}
