import { useRef, useState } from "react";
import { DilRenderer, type DilRendererHandle } from "@snackbit/opendil";
import "@snackbit/opendil/styles.css";

type AnswerProps = {
  /** All text received so far for this answer. */
  text: string;
  /** True while more text may arrive. */
  streaming: boolean;
  /** Only the newest answer follows the stream. */
  latest: boolean;
  dark: boolean;
};

export function Answer({ text, streaming, latest, dark }: AnswerProps) {
  const renderer = useRef<DilRendererHandle>(null);
  const [following, setFollowing] = useState(true);
  return (
    <div className="answer">
      <DilRenderer
        ref={renderer}
        text={text}
        isStreaming={streaming}
        showStatus={false}
        autoScroll={latest ? { behavior: "smooth", padding: 24 } : false}
        onFollowChange={setFollowing}
        appearance={dark ? "dark" : "light"}
        tokens={{ "--background": "transparent" }}
        onError={(error) => logAnswerProblem(error.kind, error.message)}
      />
      {latest && streaming && !following && (
        <button
          type="button"
          onClick={() => renderer.current?.resumeAutoScroll()}
        >
          Jump to latest
        </button>
      )}
    </div>
  );
}

/** Readers see short, generic wording in the answer. Send the details to your telemetry. */
function logAnswerProblem(kind: string, message: string) {
  console.info(`[opendil] ${kind}: ${message}`);
}
