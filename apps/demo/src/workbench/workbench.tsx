import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Code2,
  FileCode2,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import {
  Button,
  Checkbox,
  ToggleGroup,
  ToggleGroupItem,
} from "@snackbit/opendil/ui";
import type {
  DilRendererHandle,
  ProgressiveReveal,
  UpdateInterval,
} from "@snackbit/opendil";
import { exampleById } from "../examples/catalog";
import { DemoRenderer, type RenderMode } from "../demo-renderer";
import { CustomizationDemo } from "../customization-demo";
import { DemoSettings } from "../playback/demo-settings";
import { useReplay } from "../playback/use-replay";
import { DEMO_REVEAL, DEMO_RENDER_MODE } from "../playback/defaults";
import { ShellScope } from "../site/components/shell-scope";
import { CopyButton } from "../site/components/copy-button";
import { sitePath } from "../site/links";
import { SourceEditor } from "./source-editor";
import { ExamplePicker } from "./example-picker";
import { RenderModePicker } from "./render-mode-picker";
import { AppearanceSettings } from "./appearance-settings";
import { savedDraft, storeDraft } from "./draft-storage";
import { reactSnippet } from "./react-snippet";
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
  const [autoRun, setAutoRun] = useState(true),
    [requestedReplay, requestReplay] = useState(false);
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
  const [autoScroll, setAutoScroll] = useState(true),
    [following, setFollowing] = useState(false);
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
  const [pane, setPane] = useState("source"),
    [fullEditor, setFullEditor] = useState(initial.length < 100000);
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
  const renderer = useRef<DilRendererHandle>(null);
  const jump = useCallback(() => renderer.current?.resumeAutoScroll(), []);
  const reveal = useMemo<ProgressiveReveal>(
    () => (progressiveReveal ? { staggerMs, durationMs } : false),
    [progressiveReveal, staggerMs, durationMs],
  );
  const scrolling = useMemo(
    () =>
      autoScroll ? { behavior: scrollBehavior, padding: scrollPadding } : false,
    [autoScroll, scrollBehavior, scrollPadding],
  );
  const options = useMemo(
    () => ({
      mode,
      reveal,
      autoScroll: scrolling,
      updateInterval,
      appearance,
      primary,
      radius,
      buttonClass,
    }),
    [
      mode,
      reveal,
      scrolling,
      updateInterval,
      appearance,
      primary,
      radius,
      buttonClass,
    ],
  );
  const integration = useMemo(
    () => reactSnippet(draft, options, example.id === "customization"),
    [draft, options, example.id],
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
    if (!autoRun || draft === source) return;
    const timer = setTimeout(apply, 300);
    return () => clearTimeout(timer);
  }, [autoRun, draft, source, apply]);
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
    setMode(DEMO_RENDER_MODE);
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
  const toggleReveal = useCallback(
    () => setProgressiveReveal((value) => !value),
    [],
  );
  const toggleRun = useCallback(
    (value: boolean | "indeterminate") => setAutoRun(value === true),
    [],
  );
  const choosePane = useCallback((value: string) => {
    if (value) setPane(value);
  }, []);
  const openEditor = useCallback(() => setFullEditor(true), []);
  const restartIsolation = useCallback(
    () => resetReplay(source.length),
    [resetReplay, source.length],
  );
  return (
    <div className="od-workbench" data-active-pane={pane}>
      <div className="od-workspace-heading od-container">
        <div className="od-eyebrow">THE INTERFACE WORKBENCH</div>
        <h1>{example.title}</h1>
        <p>{example.description}</p>
      </div>
      <div className="od-workbench-controls">
        <ShellScope className="od-workbench-toolbar">
          <ExamplePicker value={example.id} onChange={choose} />
          <div className="od-toolbar-actions">
            {example.id === "isolation" && (
              <Button variant="outline" size="sm" onClick={restartIsolation}>
                Restart isolation demo
              </Button>
            )}
            <Button
              variant={progressiveReveal ? "secondary" : "outline"}
              size="sm"
              aria-label="Progressive reveal"
              aria-pressed={progressiveReveal}
              onClick={toggleReveal}
            >
              Reveal: {progressiveReveal ? "On" : "Off"}
            </Button>
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
            />
            <Button
              variant="outline"
              size="sm"
              onClick={reset}
              aria-label="Reset example"
            >
              <RotateCcw size={14} />
              Reset
            </Button>
            <Button
              size="sm"
              onClick={play}
              disabled={preparing || example.id === "customization"}
              aria-busy={preparing}
            >
              {preparing ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <Play size={14} />
              )}
              Replay stream
            </Button>
            {!complete && (
              <Button size="sm" variant="outline" onClick={pause}>
                {running ? <Pause size={14} /> : <Play size={14} />}
                {running ? "Pause" : "Resume"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={finish}
              disabled={complete && !preparing}
            >
              <Check size={14} />
              Complete
            </Button>
          </div>
        </ShellScope>
      </div>
      {example.group === "Advanced" && (
        <ShellScope className="od-advanced-fixtures">
          <ToggleGroup
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
        </ShellScope>
      )}
      <ShellScope className="od-mobile-panes">
        <ToggleGroup
          type="single"
          value={pane}
          onValueChange={choosePane}
          aria-label="Workbench view"
        >
          <ToggleGroupItem value="source">Source</ToggleGroupItem>
          <ToggleGroupItem value="preview">Preview</ToggleGroupItem>
          <ToggleGroupItem value="react">React usage</ToggleGroupItem>
        </ToggleGroup>
      </ShellScope>
      <div className="od-workbench-grid">
        <section className="od-editor-column" aria-label="Source workspace">
          <div className="od-editor-frame">
            <div className="od-source-header">
              <div>
                <FileCode2 size={15} />
                <span>
                  {pane === "react" ? "Example.tsx" : "interface.dil"}
                </span>
              </div>
              <CopyButton
                text={pane === "react" ? integration : draft}
                label={
                  pane === "react"
                    ? "Copy React integration"
                    : "Copy DIL source"
                }
              />
            </div>
            <div className="od-source-pane" hidden={pane === "react"}>
              {fullEditor ? (
                <SourceEditor value={draft} onChange={edit} onRun={apply} />
              ) : (
                <div className="od-large-source">
                  <pre>
                    {draft.slice(0, 1200)}
                    {"\n\n… " + draft.length.toLocaleString() + " characters"}
                  </pre>
                  <ShellScope>
                    <Button size="sm" variant="outline" onClick={openEditor}>
                      Edit full source
                    </Button>
                  </ShellScope>
                </div>
              )}
            </div>
            <div className="od-react-pane" hidden={pane !== "react"}>
              {pane === "react" && (
                <SourceEditor
                  value={integration}
                  readOnly
                  language="tsx"
                  label="React integration code"
                />
              )}
            </div>
            <div className="od-editor-bottom">
              <ShellScope>
                <label>
                  <Checkbox checked={autoRun} onCheckedChange={toggleRun} />
                  Auto-run
                </label>
                <Button size="sm" variant="ghost" onClick={apply}>
                  Run <kbd>⌘ ↵</kbd>
                </Button>
              </ShellScope>
              <span>{draft === source ? "In sync" : "Edited"}</span>
            </div>
          </div>
          <ShellScope className="od-code-tabs">
            <ToggleGroup
              type="single"
              value={pane === "react" ? "react" : "source"}
              onValueChange={choosePane}
              aria-label="Code view"
            >
              <ToggleGroupItem value="source">
                <FileCode2 size={14} />
                DIL source
              </ToggleGroupItem>
              <ToggleGroupItem value="react">
                <Code2 size={14} />
                React usage
              </ToggleGroupItem>
            </ToggleGroup>
          </ShellScope>
          <ShellScope className="od-appearance-scope">
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
          </ShellScope>
          <p className="od-workbench-note">
            Edits run after a 300 ms pause. Applying source resets document
            state. <a href={sitePath("docs/language/")}>DIL reference</a>
          </p>
        </section>
        <section className="od-render-column" aria-label="Rendered preview">
          <div className="od-render-header">
            <span>Rendered output</span>
            <RenderModePicker
              value={mode}
              onChange={setMode}
              customization={example.id === "customization"}
            />
          </div>
          <div className="od-demo-preview">
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
                ref={renderer}
                text={source.slice(0, offset)}
                isStreaming={!complete}
                mode={mode}
                appearance={appearance}
                primary={primary}
                radius={radius}
                buttonClass={buttonClass}
                progressiveReveal={reveal}
                autoScroll={scrolling}
                updateInterval={updateInterval}
                onFollowChange={setFollowing}
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
          </div>
        </section>
      </div>
      {autoScroll && !following && !complete && (
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
    </div>
  );
}
