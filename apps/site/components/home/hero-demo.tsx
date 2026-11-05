"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEMO_TOKEN_RATE } from "@/components/playback/defaults";
import { unpackOffsets } from "@/components/playback/replay-delivery";
import { DemoRenderer } from "@/components/playback/demo-renderer";
import { DemoSettings } from "@/components/playback/demo-settings";
import { PlaybackControls } from "@/components/playback/playback-controls";
import { useDemoOptions } from "@/components/playback/use-demo-options";
import { usePreviewFollow } from "@/components/playback/use-preview-follow";
import { useReplay } from "@/components/playback/use-replay";
import { useSiteTheme } from "@/components/site/site-theme";
import { SourceEditor } from "@/components/workbench/editor/source-editor";
import { ExamplePicker } from "@/components/workbench/example-picker";
import { StreamingWorkbench } from "@/components/workbench/streaming-workbench";
import {
  featuredExamples,
  type ExampleDefinition,
} from "@/lib/examples/catalog";
import type { HeroExample } from "./hero-examples";
import { TouchUnlock } from "./touch-unlock";

export interface HeroDemoProps {
  /** Source and token count for every featured example, keyed by id. */
  examples: Readonly<Record<string, HeroExample>>;
}

/**
 * The landing preview: replays a featured example into a live renderer next to its source.
 * Loaded only through hero-preview.tsx, so the renderer and Monaco stay out of the page chunk.
 */
export function HeroDemo({ examples }: HeroDemoProps) {
  const [id, setId] = useState("team-budget");
  const [rate, setRate] = useState(DEMO_TOKEN_RATE);
  const example =
    featuredExamples.find((item) => item.id === id) ?? featuredExamples[0];
  const entry = example && examples[example.id];
  if (!example || !entry) throw new Error("Missing hero example " + id);
  return (
    <StreamingExample
      key={example.id}
      example={example}
      source={entry.source}
      offsets={entry.offsets}
      examples={examples}
      onExample={setId}
      initialRate={rate}
      onRate={setRate}
    />
  );
}

function StreamingExample({
  example,
  source,
  offsets,
  examples,
  onExample,
  initialRate,
  onRate,
}: {
  example: ExampleDefinition;
  source: string;
  offsets: string;
  examples: Readonly<Record<string, HeroExample>>;
  onExample: (id: string) => void;
  initialRate: number;
  onRate: (rate: number) => void;
}) {
  const known = useMemo(() => unpackOffsets(offsets), [offsets]);
  const replay = useReplay(source, example.id, initialRate, known);
  const options = useDemoOptions();
  const appearance = useSiteTheme();
  const detail = useCallback(
    (item: ExampleDefinition) => {
      const count = examples[item.id]?.tokens;
      if (count === undefined)
        throw new Error("Missing token count for " + item.id);
      return count.toLocaleString("en-US") + " tok";
    },
    [examples],
  );
  const {
    replay: beginReplay,
    reset: resetReplay,
    finish,
    pause,
    run,
    offset,
    running,
    preparing,
    tokensPerSecond,
    setTokensPerSecond,
  } = replay;
  const rateChange = useCallback(
    (value: number) => {
      setTokensPerSecond(value);
      onRate(value);
    },
    [setTokensPerSecond, onRate],
  );
  const [showAll, setShowAll] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const root = useRef<HTMLDivElement>(null),
    started = useRef(showAll);
  const play = useCallback(() => {
    started.current = true;
    setShowAll(false);
    beginReplay();
  }, [beginReplay]);
  const show = useCallback(() => {
    started.current = true;
    setShowAll(true);
    finish();
  }, [finish]);
  const reset = useCallback(() => {
    started.current = true;
    setShowAll(true);
    resetReplay(source.length);
  }, [resetReplay, source.length]);
  // Start the replay once the preview scrolls into view.
  useEffect(() => {
    const element = root.current;
    if (!element || started.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !started.current) {
          play();
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [play]);
  const received = showAll ? source.length : run > 0 ? offset : 0;
  const done = received === source.length;
  const output = useRef<HTMLDivElement>(null);
  usePreviewFollow(
    output,
    run,
    !done,
    options.autoScroll,
    options.scrollBehavior,
    options.scrollPadding,
  );
  return (
    <StreamingWorkbench
      className="od-hero-workbench"
      rootRef={root}
      outputRef={output}
      scrollPadding={options.scrollPadding}
      fraction={received / source.length}
      run={run}
      selection={
        <ExamplePicker
          value={example.id}
          onChange={onExample}
          items={featuredExamples}
          label="Demo example"
          compact
          filename
          detail={detail}
        />
      }
      actions={
        <>
          <PlaybackControls
            rate={tokensPerSecond}
            onRate={rateChange}
            running={running}
            complete={done}
            canPause={run !== 0}
            preparing={preparing}
            onPause={pause}
            onReplay={play}
            onFinish={show}
            onReset={reset}
          />
          <DemoSettings
            {...options}
            tokensPerSecond={tokensPerSecond}
            onRate={rateChange}
            benchmark={replay.benchmark}
            stressSpeed={replay.stressSpeed}
            onStress={replay.setStressSpeed}
            customization={false}
          />
        </>
      }
      source={
        <TouchUnlock>
          <SourceEditor
            key={run}
            value={source}
            readOnly
            appearance="subtle"
            generatedLength={received}
            followTail
            label="Incoming DIL source"
          />
        </TouchUnlock>
      }
      preview={
        <DemoRenderer
          appearance={appearance}
          primary={appearance === "dark" ? "#a79cff" : "#5e4cff"}
          key={`${run}:${options.mode}`}
          text={source.slice(0, received)}
          isStreaming={!done}
          mode={options.mode}
          progressiveReveal={options.reveal}
          updateInterval={options.updateInterval}
        />
      }
    />
  );
}
