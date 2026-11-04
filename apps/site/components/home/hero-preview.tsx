"use client";
import dynamic from "next/dynamic";
import { createContext, useContext } from "react";
import type { HeroDemoProps } from "./hero-demo";

const FallbackSource = createContext("");

/** Shown in the prerendered HTML and until the renderer chunk has loaded. */
function HeroFallback() {
  return (
    <div className="od-hero-demo-fallback">
      <pre>{useContext(FallbackSource)}</pre>
      <div className="od-live-placeholder">Loading the live renderer…</div>
    </div>
  );
}

/*
 * OpenDIL, Monaco and the playback controls load only on the client and outside the route
 * chunk, so prefetching the landing page from another route does not fetch them.
 */
const HeroDemo = dynamic(
  () => import("./hero-demo").then((module) => module.HeroDemo),
  { ssr: false, loading: HeroFallback },
);

export function HeroPreview({
  examples,
  fallback,
}: HeroDemoProps & { fallback: string }) {
  return (
    <FallbackSource value={fallback}>
      <HeroDemo examples={examples} />
    </FallbackSource>
  );
}
