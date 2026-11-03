import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@snackbit/opendil/ui";
import {
  exampleById,
  featuredExamples,
  type ExampleDefinition,
} from "../../examples/catalog";
import { DemoRenderer } from "../../demo-renderer";
import { useReplay } from "../../playback/use-replay";
import { DEMO_TOKEN_RATE, DEMO_REVEAL } from "../../playback/defaults";
import { usePreviewFollow } from "../../playback/use-preview-follow";
import { SourceEditor } from "../../workbench/source-editor";
import { ShellScope } from "./shell-scope";
import { CopyButton } from "./copy-button";
import { useSiteTheme } from "./use-site-theme";
import { ExamplePicker } from "../../workbench/example-picker";
import { HeroRate } from "./hero-rate";
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
  usePreviewFollow(output, run, !done);
  return (
    <div className="od-stream-demo" ref={root}>
      <div className="od-hero-demo-toolbar">
        <span className="od-demo-caption">
          <i />
          <i />
          <i />
          <ExamplePicker
            value={example.id}
            onChange={onExample}
            items={featuredExamples}
            label="Demo example"
            compact
            filename
            detail={detail}
          />
          <CopyButton text={source} label="Copy demo DIL" />
        </span>
        <ShellScope className="od-demo-actions">
          <HeroRate value={tokensPerSecond} onChange={rateChange} />
          <Button
            size="xs"
            variant="ghost"
            onClick={pause}
            disabled={done || preparing || run === 0}
          >
            {running ? <Pause size={14} /> : <Play size={14} />}
            {running ? "Pause" : "Resume"}
          </Button>
          <Button size="xs" variant="ghost" onClick={play} disabled={preparing}>
            <RotateCcw size={14} />
            Replay
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={show}
            disabled={done && !preparing}
          >
            <Check size={14} />
            Finish
          </Button>
        </ShellScope>
      </div>
      <div
        className="od-stream-progress"
        role="progressbar"
        aria-label="Demo source received"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
      >
        <span key={run} style={{ transform: `scaleX(${fraction})` }} />
      </div>
      <div className="od-hero-demo">
        <div className="od-hero-code">
          <SourceEditor
            key={run}
            value={source}
            readOnly
            appearance="subtle"
            generatedLength={received}
            followTail
            label="Incoming DIL source"
          />
        </div>
        <div className="od-hero-preview">
          <div
            className="od-hero-output"
            ref={output}
            tabIndex={0}
            aria-label="Streaming preview"
          >
            <DemoRenderer
              appearance={appearance}
              primary={appearance === "dark" ? "#a79cff" : "#5e4cff"}
              key={run}
              text={source.slice(0, received)}
              isStreaming={!done}
              progressiveReveal={DEMO_REVEAL}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
