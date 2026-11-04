import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, ToggleGroup, ToggleGroupItem } from "@snackbit/opendil/ui";
import type { ProgressiveReveal, UpdateInterval } from "@snackbit/opendil";
import { exampleById } from "../examples/catalog";
import { DemoRenderer, type RenderMode } from "../demo-renderer";
import { CustomizationDemo } from "../customization-demo";
import { DemoSettings } from "../playback/demo-settings";
import { PlaybackControls } from "../playback/playback-controls";
import { StreamingWorkbench } from "./streaming-workbench";
import { usePreviewFollow } from "../playback/use-preview-follow";
import { useReplay } from "../playback/use-replay";
import { DEMO_REVEAL, DEMO_RENDER_MODE } from "../playback/defaults";
import { ShellScope } from "../site/components/shell-scope";
import { sitePath } from "../site/links";
import { SourceEditor } from "./source-editor";
import { ExamplePicker } from "./example-picker";
import { AppearanceSettings } from "./appearance-settings";
import { savedDraft, storeDraft } from "./draft-storage";
import {
  rendererPreferences,
  saveRendererPreferences,
} from "./renderer-preferences";
export interface WorkbenchProps {
  initialId: string;
}
const advanced = [
  "showcase",
  "large",
  "list",
  "long-table",
  "isolation",
  "customization",
];
const neighbor =
  "# Independent message\n{@body const [count,setCount]=DIL.useState(0)}\n<button onClick={()=>setCount(n=>n+1)}>Increment neighbor</button>\n<text>Neighbor count: {count}</text>";
export function Workbench({ initialId }: WorkbenchProps) {
  const example = exampleById(initialId);
  const [preferences] = useState(rendererPreferences);
  const [initial] = useState(() => savedDraft(example.id, example.source()));
  const [draft, setDraft] = useState(initial),
    [source, setSource] = useState(initial);
  const [requestedReplay, requestReplay] = useState(false);
  const [mode, setMode] = useState<RenderMode>(
    example.id === "customization" && preferences.mode === "isolated"
      ? DEMO_RENDER_MODE
      : preferences.mode,
  );
  const [progressiveReveal, setProgressiveReveal] = useState(
      preferences.reveal,
    ),
    [staggerMs, setStaggerMs] = useState<number>(DEMO_REVEAL.staggerMs),
    [durationMs, setDurationMs] = useState<number>(DEMO_REVEAL.durationMs);
  const [autoScroll, setAutoScroll] = useState(true);
  const [scrollBehavior, setScrollBehavior] = useState<"instant" | "smooth">(
      "instant",
    ),
    [scrollPadding, setScrollPadding] = useState(0);
  const [updateInterval, setUpdateInterval] =
    useState<UpdateInterval>("instant");
  const [appearance, setAppearance] = useState<"light" | "dark">("light"),
    [primary, setPrimary] = useState(
      example.id === "customization" ? "#156f55" : "#202020",
    ),
    [radius, setRadius] = useState(12),
    [buttonClass, setButtonClass] = useState(
      example.id === "customization" ? "rounded-full" : "rounded-md",
    );
  const [fullEditor, setFullEditor] = useState(initial.length < 100000);
  const replay = useReplay(source, example.id);
  const {
    reset: resetReplay,
    replay: beginReplay,
    finish,
    pause,
    running,
    complete,
    offset,
    run,
    preparing,
    error,
    tokensPerSecond,
    setTokensPerSecond,
    stressSpeed,
    setStressSpeed,
    benchmark,
  } = replay;
  const output = useRef<HTMLDivElement>(null);
  usePreviewFollow(
    output,
    run,
    !complete,
    autoScroll,
    scrollBehavior,
    scrollPadding,
  );
  const reveal = useMemo<ProgressiveReveal>(
    () => (progressiveReveal ? { staggerMs, durationMs } : false),
    [progressiveReveal, staggerMs, durationMs],
  );
  const apply = useCallback(() => {
    setSource(draft);
    resetReplay(draft.length);
  }, [draft, resetReplay]);
  const edit = useCallback(
    (next: string) => {
      if (running && !complete) pause();
      setDraft(next);
      storeDraft(example.id, next);
    },
    [running, complete, pause, example.id],
  );
  useEffect(() => {
    if (draft === source) return;
    const timer = setTimeout(apply, 300);
    return () => clearTimeout(timer);
  }, [draft, source, apply]);
  const play = useCallback(() => {
    if (draft !== source) apply();
    requestReplay(true);
  }, [draft, source, apply]);
  useEffect(() => {
    if (requestedReplay) {
      requestReplay(false);
      beginReplay();
    }
  }, [requestedReplay, beginReplay]);
  const reset = useCallback(() => {
    const original = example.source();
    setDraft(original);
    setSource(original);
    storeDraft(example.id, original);
    resetReplay(original.length);
    setAppearance("light");
    setPrimary(example.id === "customization" ? "#156f55" : "#202020");
    setRadius(12);
    setButtonClass(
      example.id === "customization" ? "rounded-full" : "rounded-md",
    );
  }, [example, resetReplay]);
  const choose = useCallback(
    (id: string) => {
      if (id && id !== example.id) {
        saveRendererPreferences({ mode, reveal: progressiveReveal });
        window.location.assign(sitePath("demo/" + id + "/") + location.search);
      }
    },
    [example.id, mode, progressiveReveal],
  );
  const openEditor = useCallback(() => setFullEditor(true), []);
  const restartIsolation = useCallback(
    () => resetReplay(source.length),
    [resetReplay, source.length],
  );
  return (
    <div className="od-demo-workspace">
      <h1 className="sr-only">{example.title}</h1>
      <StreamingWorkbench
        outputRef={output}
        scrollPadding={scrollPadding}
        fraction={source.length ? Math.min(1, offset / source.length) : 1}
        run={run}
        selection={
          <ExamplePicker
            value={example.id}
            onChange={choose}
            compact
            filename
          />
        }
        actions={
          <>
            <PlaybackControls
              rate={tokensPerSecond}
              onRate={setTokensPerSecond}
              running={running}
              complete={complete}
              preparing={preparing}
              onPause={pause}
              onReplay={play}
              onFinish={finish}
              onReset={reset}
              disabled={example.id === "customization"}
            />
            <DemoSettings
              enabled={progressiveReveal}
              staggerMs={staggerMs}
              durationMs={durationMs}
              tokensPerSecond={tokensPerSecond}
              benchmark={benchmark}
              stressSpeed={stressSpeed}
              mode={mode}
              customization={example.id === "customization"}
              autoScroll={autoScroll}
              onEnabled={setProgressiveReveal}
              onStagger={setStaggerMs}
              onDuration={setDurationMs}
              onRate={setTokensPerSecond}
              onStress={setStressSpeed}
              onMode={setMode}
              onAutoScroll={setAutoScroll}
              scrollBehavior={scrollBehavior}
              scrollPadding={scrollPadding}
              onScrollBehavior={setScrollBehavior}
              onScrollPadding={setScrollPadding}
              updateInterval={updateInterval}
              onUpdateInterval={setUpdateInterval}
            >
              <AppearanceSettings
                enabled={mode !== "isolated"}
                appearance={appearance}
                primary={primary}
                radius={radius}
                buttonClass={buttonClass}
                onAppearance={setAppearance}
                onPrimary={setPrimary}
                onRadius={setRadius}
                onButtonClass={setButtonClass}
              />
            </DemoSettings>
          </>
        }
        source={
          fullEditor ? (
            <SourceEditor
              value={draft}
              onChange={edit}
              onRun={apply}
              generatedLength={
                draft === source && !complete ? offset : undefined
              }
            />
          ) : (
            <div className="od-large-source">
              <pre>{draft.slice(0, 1200)}</pre>
              <ShellScope>
                <Button size="sm" variant="outline" onClick={openEditor}>
                  Edit full source
                </Button>
              </ShellScope>
            </div>
          )
        }
        preview={
          <>
            {example.id === "customization" ? (
              <CustomizationDemo
                key={`${run}:${mode}`}
                text={source}
                appearance={appearance}
                primary={primary}
                radius={radius}
                buttonClass={buttonClass}
                onAppearance={setAppearance}
                mode={mode === "shadow" ? "shadow" : "host"}
                progressiveReveal={reveal}
              />
            ) : (
              <DemoRenderer
                key={`${run}:${mode}`}
                text={source.slice(0, offset)}
                isStreaming={!complete}
                mode={mode}
                appearance={appearance}
                primary={primary}
                radius={radius}
                buttonClass={buttonClass}
                progressiveReveal={reveal}
                autoScroll={false}
                updateInterval={updateInterval}
              />
            )}
            {example.id === "isolation" && (
              <DemoRenderer
                key={mode}
                text={neighbor}
                mode={mode}
                progressiveReveal={reveal}
              />
            )}
          </>
        }
      />
      {example.group === "Advanced" && (
        <ShellScope className="od-demo-extra-controls">
          <ToggleGroup
            segmented
            size="sm"
            type="single"
            value={example.id}
            onValueChange={choose}
            aria-label="Document fixture"
          >
            {advanced.map((id) => (
              <ToggleGroupItem key={id} value={id}>
                {exampleById(id).title}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {example.id === "isolation" && (
            <Button variant="ghost" size="sm" onClick={restartIsolation}>
              Restart isolation demo
            </Button>
          )}
        </ShellScope>
      )}
      <span className="sr-only" role="status">
        {preparing ? "Preparing replay" : ""}
      </span>
      {error && (
        <p className="od-replay-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
