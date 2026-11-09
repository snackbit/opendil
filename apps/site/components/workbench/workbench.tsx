import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ToggleGroupItem } from "@snackbit/opendil/lib";
import type {
  AutoScroll,
  DilRenderError,
  DilRendererHandle,
  ProgressiveReveal,
  UpdateInterval,
} from "@snackbit/opendil";
import { exampleById, type ExampleId } from "@/lib/examples/catalog";
import { generatedSource } from "@/lib/examples/generated";
import {
  DemoRenderer,
  type RenderMode,
} from "@/components/playback/demo-renderer";
import { DemoSettings } from "@/components/playback/demo-settings";
import { PlaybackControls } from "@/components/playback/playback-controls";
import { useReplay } from "@/components/playback/use-replay";
import { DEMO_REVEAL, DEMO_RENDER_MODE } from "@/components/playback/defaults";
import { CustomizationDemo } from "./customization-demo";
import { StreamingWorkbench } from "./streaming-workbench";
import { SegmentedControl, ShellScope } from "./shell-scope";
import { SourceEditor } from "./editor/source-editor";
import { ExamplePicker } from "./example-picker";
import { AppearanceSettings } from "./appearance-settings";
import { savedDraft, storeDraft } from "./draft-storage";
import {
  rendererPreferences,
  saveRendererPreferences,
} from "./renderer-preferences";
export interface WorkbenchProps {
  initialId: ExampleId;
  /** The example's source from the server; null for scale fixtures, which are generated here. */
  source: string | null;
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
/** Line and column of a source offset, for authors reading diagnostics. */
function position(source: string, offset: number | undefined) {
  if (offset === undefined) return "";
  const lines = source.slice(0, offset).split("\n");
  return `Line ${lines.length}, column ${(lines.at(-1)?.length ?? 0) + 1}: `;
}
export function Workbench({ initialId, source: original }: WorkbenchProps) {
  const example = exampleById(initialId);
  const router = useRouter();
  const [exampleSource] = useState(
    () => original ?? generatedSource(example.id) ?? "",
  );
  const [preferences] = useState(rendererPreferences);
  const [initial] = useState(() => savedDraft(example.id, exampleSource));
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
  // Readers see generic wording for malformed DIL; authors get the details here.
  // Each renderer instance (keyed by run and mode) reports its own problems.
  const instance = `${run}:${mode}`;
  const [reported, setReported] = useState({
    instance,
    problems: [] as DilRenderError[],
  });
  const problems = reported.instance === instance ? reported.problems : [];
  const report = useCallback(
    (problem: DilRenderError) =>
      setReported((last) => {
        const list = last.instance === instance ? last.problems : [];
        return { instance, problems: [...list, problem].slice(0, 20) };
      }),
    [instance],
  );
  // The renderer finds the preview pane as its scroll container and follows there.
  const renderer = useRef<DilRendererHandle>(null);
  const [following, setFollowing] = useState(false);
  const jump = useCallback(() => renderer.current?.resumeAutoScroll(), []);
  const scrolling = useMemo<AutoScroll>(
    () =>
      autoScroll ? { behavior: scrollBehavior, padding: scrollPadding } : false,
    [autoScroll, scrollBehavior, scrollPadding],
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
    setDraft(exampleSource);
    setSource(exampleSource);
    storeDraft(example.id, exampleSource);
    resetReplay(exampleSource.length);
    setAppearance("light");
    setPrimary(example.id === "customization" ? "#156f55" : "#202020");
    setRadius(12);
    setButtonClass(
      example.id === "customization" ? "rounded-full" : "rounded-md",
    );
  }, [example, exampleSource, resetReplay]);
  const choose = useCallback(
    (id: string) => {
      if (id && id !== example.id) {
        saveRendererPreferences({ mode, reveal: progressiveReveal });
        // Client-side navigation; the page remounts the workbench for the new example.
        router.push("/demo/" + id + "/" + location.search);
      }
    },
    [example.id, mode, progressiveReveal, router],
  );
  const openEditor = useCallback(() => setFullEditor(true), []);
  const restartIsolation = useCallback(
    () => resetReplay(source.length),
    [resetReplay, source.length],
  );
  return (
    <div className="od-demo-workspace">
      <StreamingWorkbench
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
                classNamesEnabled={mode !== "isolated"}
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
                key={instance}
                text={source.slice(0, offset)}
                isStreaming={!complete}
                mode={mode}
                appearance={appearance}
                primary={primary}
                radius={radius}
                buttonClass={buttonClass}
                ref={renderer}
                progressiveReveal={reveal}
                autoScroll={scrolling}
                onFollowChange={setFollowing}
                updateInterval={updateInterval}
                onError={report}
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
          <SegmentedControl
            value={example.id}
            onValueChange={choose}
            aria-label="Document fixture"
          >
            {advanced.map((id) => (
              <ToggleGroupItem key={id} value={id}>
                {exampleById(id).title}
              </ToggleGroupItem>
            ))}
          </SegmentedControl>
          {example.id === "isolation" && (
            <Button variant="ghost" size="sm" onClick={restartIsolation}>
              Restart isolation demo
            </Button>
          )}
        </ShellScope>
      )}
      {autoScroll &&
        !following &&
        !complete &&
        example.id !== "customization" && (
          <ShellScope className="od-jump">
            <Button onClick={jump}>Jump to latest</Button>
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
      {problems.length > 0 && (
        <ul className="od-replay-error" aria-label="Source problems">
          {problems.map((problem, index) => (
            <li key={index}>
              {position(source, problem.offset)}
              {problem.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
