import { useCallback, useEffect, useRef, useState } from "react";
import {
  approximateOffsets,
  ReplayClock,
  stressChunk,
  type StressSpeed,
} from "./replay-delivery";
import { DEMO_TOKEN_RATE } from "./defaults";
/** A worker that iOS kills silently never answers; replay then paces by approximate tokens. */
const WORKER_TIMEOUT_MS = 5000;
/**
 * Replays `source` token by token. `knownOffsets` (exact offsets computed ahead of time)
 * skip the tokenizer worker; otherwise the worker prepares them on the first replay.
 */
export function useReplay(
  source: string,
  dataset: string,
  initialRate = DEMO_TOKEN_RATE,
  knownOffsets?: Uint32Array,
) {
  const [offset, setOffset] = useState(source.length);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [tokensPerSecond, setTokensPerSecond] = useState(initialRate);
  const [stressSpeed, setStressSpeed] = useState<StressSpeed>("1");
  const [benchmark] = useState(
    () => new URLSearchParams(location.search).get("benchmark") === "1",
  );
  const cache = useRef<{ source: string; offsets: Uint32Array } | null>(null);
  const worker = useRef<Worker | null>(null);
  const clock = useRef<ReplayClock | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const complete = offset >= source.length;
  const cancel = useCallback(() => {
    clearTimeout(timeout.current);
    worker.current?.terminate();
    worker.current = null;
    setPreparing(false);
  }, []);
  const start = useCallback(() => {
    clock.current = new ReplayClock(performance.now(), tokensPerSecond);
    setOffset(0);
    setRun((value) => value + 1);
    setRunning(true);
    setError("");
  }, [tokensPerSecond]);
  const begin = useCallback(
    (offsets: Uint32Array) => {
      cache.current = { source, offsets };
      start();
    },
    [source, start],
  );
  const replay = useCallback(() => {
    if (benchmark || cache.current?.source === source) {
      start();
      return;
    }
    cancel();
    if (knownOffsets) {
      begin(knownOffsets);
      return;
    }
    let instance: Worker;
    try {
      instance = new Worker(new URL("./tokenize.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      begin(approximateOffsets(source));
      return;
    }
    setPreparing(true);
    setError("");
    worker.current = instance;
    const failed = () => {
      if (worker.current !== instance) return;
      cancel();
      setError("Could not prepare replay. Try Replay stream again.");
    };
    const approximate = () => {
      if (worker.current !== instance) return;
      cancel();
      begin(approximateOffsets(source));
    };
    instance.onerror = approximate;
    timeout.current = setTimeout(approximate, WORKER_TIMEOUT_MS);
    instance.onmessage = (event: MessageEvent<unknown>) => {
      if (worker.current !== instance) return;
      const data = event.data;
      if (
        !data ||
        typeof data !== "object" ||
        !("offsets" in data) ||
        !(data.offsets instanceof Uint32Array)
      ) {
        failed();
        return;
      }
      cancel();
      begin(data.offsets);
    };
    instance.postMessage(source);
  }, [benchmark, source, start, cancel, begin, knownOffsets]);
  const reset = useCallback(
    (length: number) => {
      cancel();
      clock.current = null;
      cache.current = null;
      setOffset(length);
      setRunning(false);
      setRun((value) => value + 1);
      setError("");
    },
    [cancel],
  );
  const finish = useCallback(() => {
    cancel();
    clock.current = null;
    setOffset(source.length);
    setRunning(false);
  }, [cancel, source.length]);
  const pause = useCallback(() => setRunning((value) => !value), []);
  useEffect(() => cancel, [cancel]);
  useEffect(() => {
    const now = performance.now();
    if (!running || document.hidden) clock.current?.rebase(now);
    clock.current?.setRate(now, tokensPerSecond);
  }, [tokensPerSecond, running]);
  useEffect(() => {
    if (!running || complete) return;
    if (benchmark) {
      const timer = setInterval(() => {
        if (!document.hidden)
          setOffset((value) =>
            Math.min(value + stressChunk(dataset, stressSpeed), source.length),
          );
      }, 33);
      return () => clearInterval(timer);
    }
    let frame = 0;
    const tick = (now: number) => {
      const index = cache.current?.offsets,
        timer = clock.current;
      if (!index || !timer) return;
      const cursor = Math.min(timer.advance(now), index.length - 1);
      setOffset(index[cursor] ?? source.length);
      if (cursor < index.length - 1) frame = requestAnimationFrame(tick);
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      clock.current?.rebase(performance.now());
      if (!document.hidden) frame = requestAnimationFrame(tick);
    };
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [running, complete, benchmark, dataset, stressSpeed, source.length]);
  return {
    offset,
    running,
    run,
    complete,
    preparing,
    error,
    tokensPerSecond,
    setTokensPerSecond,
    stressSpeed,
    setStressSpeed,
    benchmark,
    replay,
    reset,
    finish,
    pause,
  };
}
