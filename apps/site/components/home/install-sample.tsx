import { highlight } from "fumadocs-core/highlight";
import { CopyButton } from "./copy-button";

/** A titled, highlighted shell snippet with a copy button; highlighted at build time. */
export async function InstallSample({
  code,
  label,
}: {
  code: string;
  label: string;
}) {
  // not-fumadocs-codeblock opts the snippet out of the Fumadocs per-line padding.
  return (
    <div className="od-code-sample not-fumadocs-codeblock">
      <div className="od-code-sample-header">
        <span>{label}</span>
        <CopyButton text={code} />
      </div>
      {await highlight(code, { lang: "bash" })}
    </div>
  );
}
