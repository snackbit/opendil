"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Checkbox,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@snackbit/opendil/ui";
import {
  DemoRenderer,
  type RenderMode,
} from "@/components/playback/demo-renderer";
import { DemoSettings } from "@/components/playback/demo-settings";
import { PlaybackControls } from "@/components/playback/playback-controls";
import { StreamProgress } from "@/components/playback/stream-progress";
import { useDemoOptions } from "@/components/playback/use-demo-options";
import { useReplay } from "@/components/playback/use-replay";
import { SourceEditor } from "@/components/workbench/editor/source-editor";
import { ShellScope } from "@/components/workbench/shell-scope";
import { SplitPanes } from "@/components/workbench/split-panes";
import { generatedSource } from "@/lib/examples/generated";

export type LiveExampleMode = RenderMode;

export interface LiveExampleWorkbenchProps {
  id: string;
  /** The catalog source, or null when the browser generates it. */
  original: string | null;
  mode?: LiveExampleMode | undefined;
}

/**
 * DilRenderer treats `text` as a growing stream that ends once `isStreaming` is
 * false. Text appended to an unfinished stream keeps the document; any other
 * change (an edit, a replay starting over, text after the end) needs a new one.
 */
function useDocumentKey(text: string, streaming: boolean) {
  const [state, setState] = useState({ text, streaming, key: 0 });
  // Updating state while rendering makes React re-render before committing, so no stale key reaches the renderer.
  if (state.text !== text || state.streaming !== streaming) {
    const append =
      state.text === text || (state.streaming && text.startsWith(state.text));
    setState({ text, streaming, key: append ? state.key : state.key + 1 });
  }
  return state.key;
}

export default function LiveExampleWorkbench({
  id,
  original: catalogSource,
  mode: initialMode,
}: LiveExampleWorkbenchProps) {
  const [original] = useState(() => catalogSource ?? generatedSource(id) ?? "");
  const [draft, setDraft] = useState(original);
  const [source, setSource] = useState(original);
  const [autoRun, setAutoRun] = useState(true);
  const [requestedReplay, requestReplay] = useState(false);
  const [pane, setPane] = useState("preview");
  const options = useDemoOptions();
  // The page chooses the starting mode until the reader picks one in the settings.
  const [chosenMode, setChosenMode] = useState<RenderMode | undefined>();
  const mode = chosenMode ?? initialMode ?? options.mode;
  const { onMode } = options;
  const chooseMode = useCallback(
    (next: RenderMode) => {
      setChosenMode(next);
      onMode(next);
    },
    [onMode],
  );
  const replay = useReplay(source, id);
  const {
    reset,
    pause,
    running,
    complete,
    offset,
    preparing,
    error,
    replay: beginReplay,
  } = replay;
  const text = source.slice(0, offset);
  const documentKey = useDocumentKey(text, !complete);
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
      data-render-mode={mode}
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
          mode={mode}
          onMode={chooseMode}
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
        run={replay.run}
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
                key={`${documentKey}:${mode}`}
                mode={mode}
                text={text}
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
