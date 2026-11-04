import Link from "next/link";

/** The OpenDIL wordmark with its violet terminal dot (DESIGN.md section 2). */
export function Brand() {
  return (
    <Link className="od-brand" href="/" aria-label="OpenDIL home">
      <span>OpenDIL</span>
      <span className="od-brand-dot" aria-hidden="true">
        .
      </span>
    </Link>
  );
}
