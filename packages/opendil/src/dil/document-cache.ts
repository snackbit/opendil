import type { DilDocument } from "./runtime/document";
import {
  parseCompleteDocument,
  parseStreamingDocument,
  type ParsedDocument,
} from "./runtime/complete-document";
import {
  readHeights,
  WidgetHeights,
  type HeightsByWidth,
} from "./widget-heights";
import { clearRenderCaches } from "./widgets/render-cache";

/**
 * What a finished answer evaluated, so a later renderer of the same text can
 * show it in its first commit. Hosts may store it as JSON; a snapshot whose
 * version or source hash does not match is ignored.
 */
export interface DilSnapshot {
  version: number;
  sourceHash: string;
  /** JSON results by evaluation key. */
  values: Record<string, unknown>;
  /**
   * Last measured heights of widgets by renderer width (px), then by node id,
   * held while they load.
   */
  heights: HeightsByWidth;
}
// 2: heights are kept per renderer width.
export const SNAPSHOT_VERSION = 2;
/** FNV-1a over UTF-16 code units: cheap, stable, and enough to tell texts apart. */
export function sourceHash(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return text.length.toString(36) + ":" + (hash >>> 0).toString(36);
}
/** Snapshots arrive from host storage; keep only well-formed fields. */
export function readSnapshot(
  value: unknown,
  text: string,
): DilSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const snapshot = value as Partial<DilSnapshot>;
  if (
    snapshot.version !== SNAPSHOT_VERSION ||
    snapshot.sourceHash !== sourceHash(text) ||
    !snapshot.values ||
    typeof snapshot.values !== "object"
  )
    return undefined;
  return {
    version: SNAPSHOT_VERSION,
    sourceHash: snapshot.sourceHash,
    values: snapshot.values,
    heights: readHeights(snapshot.heights),
  };
}

interface Entry {
  parsed: ParsedDocument;
  components: string;
  users: number;
}
/** Finished documents kept alive while no renderer shows them. */
const IDLE_LIMIT = 12;
const entries = new Map<string, Entry>();
/**
 * Documents this cache disposed. A renderer reads an idle document while it
 * renders and retains it when it mounts; eviction or a clear in between, as
 * in another renderer's unmount or a layout effect of the same commit,
 * leaves it holding one of these.
 */
const disposed = new WeakSet<DilDocument>();
function dispose(document: DilDocument) {
  disposed.add(document);
  document.engine.dispose();
  document.updates.cancel("source");
}
function evict() {
  let idle = [...entries.values()].filter((entry) => !entry.users).length;
  for (const [key, entry] of entries) {
    if (idle <= IDLE_LIMIT) return;
    if (entry.users) continue;
    entries.delete(key);
    dispose(entry.parsed.document);
    idle--;
  }
}
/** The live finished document cached under the key for this text, used or not. */
function liveEntry(key: string, text: string, components: string) {
  const entry = entries.get(key);
  return entry &&
    entry.parsed.text === text &&
    entry.components === components &&
    !entry.parsed.document.engine.stopped
    ? entry
    : undefined;
}
/**
 * The same text parsed again for a second renderer, showing the live
 * document's results until its own runtime confirms them. A document has one
 * renderer at a time: its render budget, widget map, error handler and
 * clipboard listener belong to the renderer that shows it.
 */
function copyDocument(entry: Entry, text: string) {
  const parsed = parseCompleteDocument(text, entry.components.split("\n"));
  if (!parsed) return null;
  const live = entry.parsed.document;
  parsed.document.engine.seed(live.engine.results());
  parsed.document.heights = live.heights.copy();
  parsed.document.seeded = true;
  return parsed;
}
/**
 * Hands a mounting renderer its document and keeps it from eviction while the
 * renderer shows it. A document another renderer already shows is copied, as
 * when two renderers with one key mount in the same commit. A document the
 * cache disposed after the renderer read it is parsed again; null when the
 * worker must parse.
 */
export function retainDocument(
  key: string,
  parsed: ParsedDocument,
  components: string,
): ParsedDocument | null {
  if (disposed.has(parsed.document)) {
    const fresh = parseCompleteDocument(parsed.text, components.split("\n"));
    if (!fresh) return null;
    parsed = fresh;
  }
  let entry = entries.get(key);
  if (entry?.users && entry.parsed.document === parsed.document) {
    const copy = copyDocument(entry, parsed.text);
    if (copy) parsed = copy;
  }
  if (entry && entry.parsed.document !== parsed.document) {
    // Another renderer still shows the older document; it disposes it itself.
    if (!entry.users) dispose(entry.parsed.document);
    entries.delete(key);
    entry = undefined;
  }
  const current = entry ?? { parsed, components, users: 0 };
  current.users++;
  entries.delete(key);
  entries.set(key, current);
  return parsed;
}
/**
 * Keeps a finished document for the next renderer with the same key, and
 * disposes one that never finished once no renderer shows it. Returns false
 * when the cache does not hold the document, which the caller then disposes.
 */
export function releaseDocument(
  key: string,
  document: DilDocument,
  text: string,
  complete: boolean,
) {
  const entry = entries.get(key);
  if (!entry || entry.parsed.document !== document) return false;
  entry.users--;
  if (complete) {
    const { scanned } = document.status.getState();
    // Finished text needs no parser: the next renderer adopts it as final.
    entry.parsed = { document, text, scanned };
    evict();
  } else if (!entry.users) {
    entries.delete(key);
    dispose(document);
  }
  return true;
}
/**
 * Measures a settled document's widgets at the renderer's width. Their
 * placeholders hold these heights the next time the document mounts, live
 * from the cache or from a snapshot, while charts, graphs and diagrams lay
 * out again.
 */
export function recordWidgetHeights(document: DilDocument, width: number) {
  const heights: Record<string, number> = {};
  for (const [id, element] of document.widgets) {
    // Unrounded: a placeholder a fraction of a pixel short still moves the
    // content below it when the widget replaces it.
    const height =
      Math.round(element.getBoundingClientRect().height * 100) / 100;
    if (height > 0) heights[id] = height;
  }
  document.heights.record(width, heights);
}
/**
 * Keeps the heights recorded at the settle width current: a chart can finish
 * its own layout a frame later, and a reader can resize a widget. Other
 * widths are recorded when a renderer settles at them; recording every width
 * a window drag passes through would evict the dock's and detail view's own.
 * Resize observations arrive after layout, so measuring them forces none.
 */
export function watchWidgetHeights(
  document: DilDocument,
  width: () => number,
  settledWidth: number,
): () => void {
  if (typeof ResizeObserver !== "function" || !document.widgets.size)
    return () => {};
  const observer = new ResizeObserver(() => {
    if (width() === settledWidth) recordWidgetHeights(document, settledWidth);
  });
  for (const element of document.widgets.values()) observer.observe(element);
  return () => observer.disconnect();
}
/**
 * Keeps a document that finished after its renderer mounted without a key,
 * as an answer that streamed in and then received its identity. Returns
 * false when another renderer shows a document under the key; the caller
 * then disposes this one.
 */
export function storeDocument(
  key: string,
  document: DilDocument,
  text: string,
  components: string,
) {
  const entry = entries.get(key);
  if (entry?.users) return false;
  if (entry) dispose(entry.parsed.document);
  entries.delete(key);
  const { scanned } = document.status.getState();
  entries.set(key, {
    parsed: { document, text, scanned },
    components,
    users: 0,
  });
  evict();
  return true;
}
/** Records a settled document's results and widget heights. */
export function takeSnapshot(document: DilDocument, text: string): DilSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    sourceHash: sourceHash(text),
    values: document.engine.results(),
    heights: document.heights.toJSON(),
  };
}
/**
 * Forgets every kept document. Idle ones are disposed now; renderers that
 * show one dispose it when they unmount, as they do any uncached document.
 */
export function clearDocumentCache() {
  for (const entry of entries.values())
    if (!entry.users) dispose(entry.parsed.document);
  entries.clear();
  // Rendered prose and diagrams are content too.
  clearRenderCaches();
}
/**
 * The document a renderer mounts with: the live one a renderer with the same
 * key left, or text parsed in this thread, showing a matching snapshot's
 * results until the worker confirms them. Null when the worker must parse.
 */
export function openDocument(
  text: string,
  streaming: boolean,
  components: string,
  key: string | undefined,
  snapshot: unknown,
): ParsedDocument | null {
  const names = components.split("\n");
  if (streaming) return parseStreamingDocument(text, names);
  // Reading the cache changes nothing, so a render React discards takes
  // nothing away. An entry in use is copied when the renderer mounts.
  const cached =
    key === undefined ? undefined : liveEntry(key, text, components);
  if (cached) return cached.users ? copyDocument(cached, text) : cached.parsed;
  const parsed = parseCompleteDocument(text, names);
  const values = parsed && readSnapshot(snapshot, text);
  if (parsed && values) {
    parsed.document.engine.seed(values.values);
    parsed.document.heights = new WidgetHeights(values.heights);
    parsed.document.seeded = true;
  }
  return parsed;
}
