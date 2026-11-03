import { useCallback, useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
export interface CopyButtonProps {
  text: string;
  label?: string;
}
export function CopyButton({ text, label = "Copy code" }: CopyButtonProps) {
  const [status, setStatus] = useState("Copy");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setStatus("Copy");
    setReady(true);
  }, [text]);
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
        <Icon size={14} />
        <span>{status}</span>
      </button>
      <span className="sr-only" role="status">
        {status === "Copy" ? "" : status}
      </span>
    </>
  );
}
