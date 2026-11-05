"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * On narrow touch screens (home.css), the wrapped pane lets swipes through to the page
 * until it is tapped. The tap unlocks it for scrolling; a touch anywhere else locks it again.
 * Keyboard and mouse users are unaffected.
 */
export function TouchUnlock({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => {
    if (!unlocked) return;
    const lock = (event: PointerEvent) => {
      if (
        !(event.target instanceof Node) ||
        !root.current?.contains(event.target)
      )
        setUnlocked(false);
    };
    document.addEventListener("pointerdown", lock, true);
    return () => document.removeEventListener("pointerdown", lock, true);
  }, [unlocked]);
  return (
    // Only touch input needs the tap; the editor inside stays keyboard reachable.
    <div
      ref={root}
      className="od-touch-unlock"
      data-unlocked={unlocked || undefined}
      onClick={() => setUnlocked(true)}
    >
      {children}
      <span className="od-touch-unlock-hint" aria-hidden="true">
        Tap to scroll code
      </span>
    </div>
  );
}
