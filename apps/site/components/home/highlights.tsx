import { Activity, Cpu, Layers, ShieldCheck } from "lucide-react";
import Link from "next/link";

/** The three product promises below the live preview. */
export function Highlights() {
  return (
    <section className="od-section od-container">
      <div className="od-columns">
        <div className="od-column">
          <Activity className="od-feature-icon" size={20} aria-hidden="true" />
          <h3>Useful before it’s finished.</h3>
          <p>
            Readers can interact with content that has arrived while the rest
            keeps streaming. Pass in the growing text; OpenDIL handles the
            rendering.
          </p>
        </div>
        <div className="od-column">
          <Layers className="od-feature-icon" size={20} aria-hidden="true" />
          <h3>More than a text response.</h3>
          <p>
            Mix Markdown, charts, tables, diagrams, and form controls. Add
            reactive state and expressions to make the document respond to its
            reader.
          </p>
        </div>
        <div className="od-column">
          <ShieldCheck
            className="od-feature-icon"
            size={20}
            aria-hidden="true"
          />
          <h3>A boundary you can inspect.</h3>
          <p>
            The default renderer uses a sandboxed iframe and bounded expression
            workers. Choose host or shadow mode when your application needs
            custom components.
          </p>
        </div>
      </div>
    </section>
  );
}

/** "Under the hood": prefix memoization, virtualization, and rendering modes. */
export function RuntimeOverview() {
  return (
    <section className="od-section od-container">
      <div className="od-eyebrow">UNDER THE HOOD</div>
      <h2>Performant prefix memoization and virtualization</h2>
      <p className="od-section-intro">
        Send the growing source prefix. OpenDIL keeps the parsed document and
        existing control state, then processes the new suffix.
      </p>
      <div
        className="od-runtime-diagram"
        role="figure"
        aria-label="A cached source prefix and a new chunk feed the parser, worker, and visible interface"
      >
        <div className="od-prefix-graphic">
          <span className="od-prefix-cached">
            Parsed prefix <small>memoized · reused</small>
          </span>
          <span className="od-prefix-new">New chunk</span>
        </div>
        <div className="od-runtime-path">
          <span>
            <Layers size={18} /> Incremental parser
          </span>
          <i className="od-runtime-connector" aria-hidden="true" />
          <span>
            <Cpu size={18} /> QuickJS worker
          </span>
          <i className="od-runtime-connector" aria-hidden="true" />
          <span>
            <Activity size={18} /> React interface
          </span>
        </div>
      </div>
      <div className="od-runtime-details">
        <div>
          <h3>Reuse the prefix</h3>
          <p>
            The completed source prefix is memoized: each new chunk extends the
            parsed document instead of rebuilding it. Existing controls keep
            their identity, state, and focus. Expression results are cached too,
            then refreshed when their dependencies change.
          </p>
        </div>
        <div>
          <h3>Mount what’s visible</h3>
          <div className="od-virtual-graphic" aria-hidden="true">
            <i />
            <i />
            <i data-visible />
            <i data-visible />
            <i data-visible />
            <i />
            <i />
          </div>
          <p>
            Large flows and repeated tables use virtualization. Offscreen
            content leaves the DOM while its document state remains.
          </p>
        </div>
        <div>
          <h3>Choose the boundary</h3>
          <p>
            <strong>Iframe + CSP</strong> provides the strongest security and
            isolation. <strong>Shadow DOM</strong> isolates styles.{" "}
            <strong>Host</strong> renders directly in your application’s DOM
            with the lowest isolation overhead.
          </p>
          <p>
            All modes execute expressions in separate, isolated QuickJS runtimes
            with bounded memory and execution time.
          </p>
          <Link className="od-text-link" href="/docs/rendering-modes/">
            Compare isolation modes
          </Link>
        </div>
      </div>
    </section>
  );
}
