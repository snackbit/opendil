import Link from "next/link";
import { InstallSample } from "./install-sample";

const installation =
  "npm install @snackbit/opendil react react-dom\nnpx opendil copy-assets --out public/opendil";

/** The landing headline, calls to action, and install command. */
export function Hero() {
  return (
    <section className="od-hero od-container">
      <div className="od-grid-motif" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="od-eyebrow">OPEN SOURCE · INTELLIGENT UI</div>
      <h1>
        Generative interfaces
        <br />
        <span>For your agents</span>
      </h1>
      <p className="od-hero-copy">
        Build ChatGPT-style interactive interfaces in your React app. OpenDIL
        renders DIL (Dynamic Interface Language), combining Markdown, charts,
        and interactive controls in one streaming document.
      </p>
      <div className="od-hero-actions">
        <Link className="od-link-button" data-primary href="/demo/deployment/">
          Open playground <span aria-hidden="true">↗</span>
        </Link>
        <Link className="od-link-button" href="/docs/">
          Read the docs <span aria-hidden="true">→</span>
        </Link>
      </div>
      <div className="od-hero-meta">
        <span>Apache 2.0</span>
        <span>React 19</span>
        <span>Your interface. Your application.</span>
      </div>
      <aside className="od-hero-install" aria-label="Install OpenDIL">
        <InstallSample code={installation} label="Getting started" />
        <p className="od-hero-note">
          <code>copy-assets</code> is only required for iframe isolation.
        </p>
      </aside>
    </section>
  );
}
