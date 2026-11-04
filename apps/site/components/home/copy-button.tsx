"use client";
import { Check, Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/** Copies `text` and announces the result. Disabled until hydrated, when copying can work. */
export function CopyButton({
  text,
  label = "Copy code",
}: {
  text: string;
  label?: string;
}) {
  const [status, setStatus] = useState("Copy");
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const copy = useCallback(() => {
    const write = navigator.clipboard?.writeText(text);
    if (!write) {
      setStatus("Copy failed");
      return;
    }
    void write.then(
      () => setStatus("Copied"),
      () => setStatus("Copy failed"),
    );
  }, [text]);
  const Icon = status === "Copied" ? Check : Copy;
  return (
    <>
      <button
        type="button"
        className="od-copy"
        aria-label={label}
        disabled={!ready}
        onClick={copy}
      >
        <Icon size={14} aria-hidden="true" />
        <span>{status}</span>
      </button>
      <span className="sr-only" role="status">
        {status === "Copy" ? "" : status}
      </span>
    </>
  );
}
