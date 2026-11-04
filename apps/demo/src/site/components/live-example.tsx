import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Checkbox,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@snackbit/opendil/ui";
import { exampleById } from "../../examples/catalog";
import { DemoRenderer } from "../../demo-renderer";
import { DemoSettings } from "../../playback/demo-settings";
import { PlaybackControls } from "../../playback/playback-controls";
import { StreamProgress } from "../../playback/stream-progress";
import { useDemoOptions } from "../../playback/use-demo-options";
import { useReplay } from "../../playback/use-replay";
import { SourceEditor } from "../../workbench/source-editor";
import { SplitPanes } from "../../workbench/split-panes";
import { sitePath } from "../links";
import { useVisibleExample } from "../examples/use-visible-example";
import { ShellScope } from "./shell-scope";

export interface LiveExampleProps {
  id: string;
}

export function LiveExample({ id }: LiveExampleProps) {
  const example = exampleById(id);
  const { root, visible } = useVisibleExample();
  return (
    <div className="not-content od-live-example" ref={root}>
      <div className="od-example-toolbar">
        <span>Live example</span>
        <a href={sitePath("demo/" + id + "/")}>Open in demo ↗</a>
      </div>
      {visible ? (
        <ExampleWorkbench id={id} original={example.source()} />
      ) : (
        <div className="od-live-placeholder">{example.title}</div>
      )}
    </div>
  );
}

function ExampleWorkbench({ id, original }: { id: string; original: string }) {
  const [draft, setDraft] = useState(original);
  const [source, setSource] = useState(original);
  const [autoRun, setAutoRun] = useState(true);
  const [requestedReplay, requestReplay] = useState(false);
  const [pane, setPane] = useState("preview");
  const options = useDemoOptions();
  const replay = useReplay(source, id);
  const {
    reset,
    pause,
    running,
    complete,
    run,
    offset,
    preparing,
    error,
    replay: beginReplay,
  } = replay;
  const apply = useCallback(() => {
    setSource(draft);
    reset(draft.length);
  }, [draft, reset]);
  const edit = useCallback(
    (next: string) => {
      if (running && !complete) pause();
      setDraft(next);
    },
    [running, complete, pause],
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
  const restore = useCallback(() => {
    setDraft(original);
    setSource(original);
    reset(original.length);
  }, [original, reset]);
  const toggleRun = useCallback(
    (value: boolean | "indeterminate") => setAutoRun(value === true),
    [],
  );
  const choosePane = useCallback((value: string) => {
    if (value) setPane(value);
  }, []);
  return (
    <Tabs
      className="od-stream-demo od-doc-workbench"
      value={pane}
      onValueChange={choosePane}
      data-active-pane={pane}
    >
      <ShellScope className="od-hero-demo-toolbar od-demo-actions">
        <PlaybackControls
          rate={replay.tokensPerSecond}
          onRate={replay.setTokensPerSecond}
          running={running}
          complete={complete}
          preparing={preparing}
          onPause={pause}
          onReplay={play}
          onFinish={replay.finish}
          onReset={restore}
        />
        <DemoSettings
          {...options}
          tokensPerSecond={replay.tokensPerSecond}
          onRate={replay.setTokensPerSecond}
          benchmark={replay.benchmark}
          stressSpeed={replay.stressSpeed}
          onStress={replay.setStressSpeed}
          customization={false}
        />
      </ShellScope>
      <StreamProgress
        fraction={source.length ? Math.min(1, offset / source.length) : 1}
        run={run}
      />
      <ShellScope className="od-doc-pane-tabs">
        <TabsList aria-label="Example view">
          <TabsTrigger value="source">Source</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
      </ShellScope>
      <SplitPanes
        className="od-hero-demo"
        source={
          <TabsContent value="source" forceMount className="od-hero-code">
            <SourceEditor
              value={draft}
              onChange={edit}
              onRun={apply}
              generatedLength={
                draft === source && !complete ? offset : undefined
              }
              label="DIL source"
            />
            <ShellScope className="od-doc-editor-actions">
              <label>
                <Checkbox checked={autoRun} onCheckedChange={toggleRun} />{" "}
                Auto-run
              </label>
              <Button size="xs" variant="ghost" onClick={apply}>
                Run
              </Button>
              <span>{draft === source ? "In sync" : "Edited"}</span>
            </ShellScope>
          </TabsContent>
        }
        preview={
          <TabsContent value="preview" forceMount className="od-hero-preview">
            <div
              className="od-hero-output"
              tabIndex={0}
              aria-label="Example preview"
            >
              <DemoRenderer
                key={`${run}:${options.mode}`}
                mode={options.mode}
                text={source.slice(0, offset)}
                isStreaming={!complete}
                progressiveReveal={options.reveal}
                autoScroll={options.scrolling}
                updateInterval={options.updateInterval}
              />
            </div>
          </TabsContent>
        }
      />
      {error && (
        <p className="od-replay-error" role="alert">
          {error}
        </p>
      )}
    </Tabs>
  );
}
