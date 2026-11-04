import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  exampleById,
  featuredExamples,
  type ExampleDefinition,
} from "../../examples/catalog";
import { DemoRenderer } from "../../demo-renderer";
import { useReplay } from "../../playback/use-replay";
import { DEMO_TOKEN_RATE } from "../../playback/defaults";
import { usePreviewFollow } from "../../playback/use-preview-follow";
import { SourceEditor } from "../../workbench/source-editor";
import { useSiteTheme } from "./use-site-theme";
import { ExamplePicker } from "../../workbench/example-picker";
import { PlaybackControls } from "../../playback/playback-controls";
import { StreamingWorkbench } from "../../workbench/streaming-workbench";
import { DemoSettings } from "../../playback/demo-settings";
import { useDemoOptions } from "../../playback/use-demo-options";
export interface HeroDemoProps {
  tokenCounts: Record<string, number>;
}
export function HeroDemo({ tokenCounts }: HeroDemoProps) {
  const [id, setId] = useState("team-budget");
  const [rate, setRate] = useState(DEMO_TOKEN_RATE);
  const example =
    featuredExamples.find((item) => item.id === id) ?? exampleById("showcase");
  return (
    <StreamingExample
      key={example.id}
      example={example}
      onExample={setId}
      initialRate={rate}
      onRate={setRate}
      tokenCounts={tokenCounts}
    />
  );
}
function StreamingExample({
  example,
  onExample,
  initialRate,
  onRate,
  tokenCounts,
}: {
  example: ExampleDefinition;
  onExample: (id: string) => void;
  initialRate: number;
  onRate: (rate: number) => void;
  tokenCounts: Record<string, number>;
}) {
  const source = useMemo(() => example.source(), [example]);
  const replay = useReplay(source, example.id, initialRate);
  const options = useDemoOptions();
  const appearance = useSiteTheme();
  const detail = useCallback(
    (item: ExampleDefinition) => {
      const count = tokenCounts[item.id];
      if (count === undefined)
        throw new Error("Missing token count for " + item.id);
      return count.toLocaleString("en-US") + " tok";
    },
    [tokenCounts],
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
  const fraction = received / source.length;
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
      rootRef={root}
      outputRef={output}
      scrollPadding={options.scrollPadding}
      fraction={fraction}
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
        <SourceEditor
          key={run}
          value={source}
          readOnly
          appearance="subtle"
          generatedLength={received}
          followTail
          label="Incoming DIL source"
        />
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
