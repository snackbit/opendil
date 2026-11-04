# OpenDIL — Design System

> **The Generative Interface Workbench.** Open-source, code-native generative UI presented with the precision of a technical manual, the clarity of a developer tool, and a small, distinctive pixel-grid signature.

**Status:** Proposed unified visual design specification  
**Applies to:** OpenDIL marketing site, documentation, playground, examples, and default developer-facing application shell  
**Does not mandate:** The appearance of third-party interfaces rendered by OpenDIL

---

## 1. Design Intent

OpenDIL is an open-source alternative for building ChatGPT-style generative graphical interfaces using DIL-like declarative output. Its identity must make two things immediately clear: **developers can inspect and control the system**, and **the resulting interface can be rich, interactive, and well designed**.

Design keywords: **open, composable, structured, precise, approachable, developer-first**.

### Design principles

1. **Show the interface, not an illustration of it.** Product demos, real UI outputs, source snippets, and inspector views are the primary imagery.
2. **One accent, intentional use.** Violet identifies brand and primary action; neutral colors do most of the work.
3. **Borders before shadows.** Structure comes from spacing, surface contrast, and 1px rules. Only high-level product previews float.
4. **Code and rendered UI are equal citizens.** Show source and result together wherever possible.
5. **Dense where useful, spacious where explanatory.** Documentation and developer tools are compact; marketing headlines and product showcases breathe.
6. **OpenDIL is not the theme of its output.** Brand styles belong to the site and shell; embedded/generated interfaces may use their own tokens, palettes, and component vocabulary.
7. **Accessible by default.** Color is never the sole state indicator; focus, keyboard, semantics, and reduced-motion support are required.

### Design synthesis

| Influence   | Adopt                                                                                                     | Avoid                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Zed         | Editorial discipline, graph-paper texture, prominent live-product frame, text-led sections                | Sitewide gray canvas, 2px radius on every component, decorative serif everywhere         |
| Drizzle ORM | Practical bordered cards, compact UI density, docs-first information architecture, terminal/code surfaces | Mascot-driven visual identity, handwritten annotations as core typography                |
| Lightdash   | Modern geometric hero typography, deliberate violet, pixel pattern, clear interactive hierarchy           | Frequent heavy shadows, oversized pills on all controls, uncontrolled large display text |

**Decision:** OpenDIL uses a **near-white canvas, cool-ink text, electric violet accent, 8px functional radii, geometric display sans, Inter body, and IBM Plex Mono code**. A quiet 16px construction grid and sparse violet pixels reference the underlying layout system without decorating every surface.

---

## 2. Brand Identity

### Positioning

**OpenDIL** is an open-source generative UI system. Its visual identity should feel like an interface development environment, not a generic AI chat app or a polished no-code website builder.

Suggested product tagline: **“Generate interfaces. Keep control.”**

Supporting line: _“An open, declarative foundation for interactive AI-generated interfaces.”_ This is messaging direction, not a claim about currently shipped functionality.

### Logo direction

- Wordmark: `OpenDIL` set in **Space Grotesk Semibold**, with normal casing.
- Signature: a small violet terminal dot after the `OpenDIL` wordmark. Use the same wordmark and dot in navigation and footers.
- Default wordmark: cool ink on light; white on dark. Symbol may use the primary violet.
- Small favicon: the violet terminal dot on a neutral tile; avoid fine lines or tiny lettering.
- No gradients, lightning bolts, AI sparkles, chat bubbles, or mascot characters in the primary mark.

### Signature visual motif

**The Composition Grid** is a sparse, orthogonal grid of small squares. Individual squares represent declarative components assembled into a responsive interface.

- Grid rhythm: **16px** in hero/illustrative regions, with optional 8px subdivisions in technical diagrams.
- Stroke: neutral border at low opacity, never darker than component borders.
- Pixel tiles: 4–12px squares in violet and two lilac tints, used once per major marketing page or inside a hero diagram.
- Maximum one prominent ornamental motif per viewport; never behind a paragraph or an active form.
- In documentation, replace ornament with actual diagrams, rendered examples, component trees, or code.

---

## 3. Color System

Semantic names are canonical. Avoid exporting Zed-, Drizzle-, or Lightdash-specific legacy color names into new OpenDIL components.

### Light theme (default)

| Token                 | Value     | Role                                      |
| --------------------- | --------- | ----------------------------------------- |
| `--od-canvas`         | `#FFFFFF` | Page background                           |
| `--od-surface`        | `#FFFFFF` | Cards, inputs, toolbar surfaces           |
| `--od-surface-subtle` | `#F6F7F9` | Sections, docs sidebars, code surrounds   |
| `--od-surface-muted`  | `#EEF0F4` | Inset areas, pressed neutrals             |
| `--od-text`           | `#252838` | Primary copy and headings                 |
| `--od-text-secondary` | `#565E70` | Explanations and secondary controls       |
| `--od-text-muted`     | `#70798A` | Captions, timestamps, optional metadata   |
| `--od-border`         | `#E1E5EC` | 1px structural borders                    |
| `--od-border-strong`  | `#C8CED9` | Control and hover outlines                |
| `--od-accent`         | `#5E4CFF` | Brand symbol, filled CTA, active controls |
| `--od-accent-hover`   | `#4935E8` | Primary CTA hover                         |
| `--od-accent-pressed` | `#3725BB` | Primary CTA pressed                       |
| `--od-accent-soft`    | `#F0EEFF` | Selected and accent-tinted surfaces       |
| `--od-accent-border`  | `#CDC7FF` | Accent outline                            |
| `--od-link`           | `#4935D0` | Readable inline links on white            |
| `--od-terminal`       | `#1B1D29` | Dark source/editor demonstrations         |
| `--od-terminal-text`  | `#E2E5F0` | Terminal/code foreground                  |
| `--od-focus`          | `#5E4CFF` | Keyboard focus ring                       |

The accent is chosen from Lightdash; the structural neutrals combine Zed's clarity with Drizzle's low-chrome workbench. It is a **new OpenDIL palette**, not a direct reproduction of any one reference.

### Semantic feedback colors

Status hues are **functional exceptions**, not competing brand accents. Use only when the state carries meaning.

| Token          | Value     | Meaning                         |
| -------------- | --------- | ------------------------------- |
| `--od-success` | `#16794B` | Successful operation            |
| `--od-warning` | `#9A5B00` | Attention required              |
| `--od-danger`  | `#C02D3A` | Destructive or failed operation |
| `--od-info`    | `#235EB5` | Informational status            |

For alerts, pair icon + text + state color. Use light tinted fills sparingly and ensure their text remains readable.

### Dark theme

| Token                 | Value     | Role                                |
| --------------------- | --------- | ----------------------------------- |
| `--od-canvas`         | `#12141C` | Page background                     |
| `--od-surface`        | `#1B1E29` | Cards and controls                  |
| `--od-surface-subtle` | `#232735` | Sidebar and inset surfaces          |
| `--od-surface-muted`  | `#2D3242` | Pressed/muted surfaces              |
| `--od-text`           | `#F1F2F8` | Primary text                        |
| `--od-text-secondary` | `#B8BECE` | Supporting text                     |
| `--od-text-muted`     | `#979FB3` | Tertiary text                       |
| `--od-border`         | `#34394A` | Structural border                   |
| `--od-border-strong`  | `#4D5469` | Hover/control outlines              |
| `--od-accent`         | `#A79CFF` | Accessible accent for dark surfaces |
| `--od-accent-hover`   | `#BDB5FF` | Hover accent                        |
| `--od-accent-pressed` | `#D0CAFF` | Pressed accent                      |
| `--od-accent-soft`    | `#302A55` | Selected accent surface             |
| `--od-accent-border`  | `#6559AD` | Accent outline                      |
| `--od-link`           | `#B2A9FF` | Inline links                        |
| `--od-terminal`       | `#10121A` | Deeper code surface                 |
| `--od-terminal-text`  | `#E2E5F0` | Code foreground                     |
| `--od-focus`          | `#B2A9FF` | Keyboard focus ring                 |

**Important:** In dark mode, use dark ink text (`#12141C`) on light-violet filled primary buttons. Do **not** reuse white-on-light-violet button text. Verify actual contrast in implementation for every component and status pairing.

### Color-use proportions

- **~85% neutral:** page, type, chrome, structure.
- **~10% subtle surface contrast:** insets, code, panels.
- **~5% accent:** brand moments, actions, selection, relevant diagrams.

These are visual targets, not pixel-level rules.

---

## 4. Typography

Use readily licensed/open fonts; do not require proprietary Writer, Zed Mono, or trial Britti files.

| Role                              | Typeface          | Weight  | Default          |
| --------------------------------- | ----------------- | ------- | ---------------- |
| Marketing display, major headings | **Space Grotesk** | 500–600 | Tight tracking   |
| UI, documentation, body           | **Inter**         | 400–600 | Clear at 14–16px |
| Code, component names, shortcuts  | **IBM Plex Mono** | 400–500 | 12–14px          |

### Type scale

| Style     | Desktop    | Mobile     | Line height | Tracking |
| --------- | ---------- | ---------- | ----------- | -------- |
| `display` | 64px / 600 | 40px / 600 | 1.04        | -0.035em |
| `h1`      | 48px / 600 | 34px / 600 | 1.10        | -0.030em |
| `h2`      | 32px / 600 | 28px / 600 | 1.18        | -0.025em |
| `h3`      | 24px / 500 | 22px / 500 | 1.25        | -0.018em |
| `h4`      | 18px / 600 | 18px / 600 | 1.35        | -0.012em |
| `body-lg` | 18px / 400 | 16px / 400 | 1.60        | -0.010em |
| `body`    | 16px / 400 | 16px / 400 | 1.55        | -0.010em |
| `body-sm` | 14px / 400 | 14px / 400 | 1.50        | -0.005em |
| `caption` | 12px / 500 | 12px / 500 | 1.45        | 0        |
| `code`    | 13px / 400 | 12px / 400 | 1.60        | 0        |

- Long-form documentation: body 16px; comfortable line length **65–80 characters**.
- Nav, labels, buttons: Inter 14px medium; never substitute display typography inside functional controls.
- Small metadata may be 12px. Avoid 9–10px body content, even if present in the source references.
- Monospaced labels can use mild positive tracking (`0.02em`), but code itself remains at normal tracking.
- Use sentence case except actual API names and identifiers.

---

## 5. Spacing, Geometry & Layout

### Spacing

**4px base unit**; canonical scale: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96`.

| Context                    | Rule                             |
| -------------------------- | -------------------------------- |
| Icon/label gap             | 8px                              |
| Related inline controls    | 8–12px                           |
| Control group vertical gap | 12–16px                          |
| Card inner padding         | 16–24px                          |
| Feature grid gap           | 16–24px                          |
| Major section gap          | 64–96px marketing / 40–64px docs |
| Main content width         | max 1200px                       |
| Article width              | max 760px                        |
| Playground main area       | Fluid, prefer `minmax(0, 1fr)`   |
| Site page gutter           | 24px desktop / 16px mobile       |

Avoid arbitrary numbers where a defined spacing token exists.

### Radii

| Token              | Value | Use                                          |
| ------------------ | ----- | -------------------------------------------- |
| `--od-radius-xs`   | 4px   | Code chips, keyboard hints, small indicators |
| `--od-radius-sm`   | 6px   | Compact controls, small menus                |
| `--od-radius-md`   | 8px   | Buttons, inputs, cards, dropdowns            |
| `--od-radius-lg`   | 12px  | Product previews, larger panels              |
| `--od-radius-full` | 999px | Avatars and intentional pill badges only     |

The **8px radius is the default**. Do not mix Zed's universal 2px, Drizzle's 8px, and Lightdash's 12px defaults arbitrarily.

### Borders & elevation

- Default card: `1px solid var(--od-border)`, no shadow.
- Hover: stronger border, subtle surface tint; no jumpy elevation.
- Floating menus: border + `0 8px 24px rgba(27,29,41,.10)`.
- Large product showcase: `0 24px 60px rgba(27,29,41,.12)` on light surfaces.
- Avoid shadows on nested controls, every feature card, or decorative tiles.

### Responsive breakpoints

- **Mobile:** `< 640px`, one column, no horizontally scrolling page shell.
- **Tablet:** `640–1023px`, 2-column features when space permits, collapsible side navigation.
- **Desktop:** `>= 1024px`, 3-column feature layouts, optional split source/preview.
- The actual component should respond to its container; do not assume viewport breakpoints alone are sufficient for embedded generated interfaces.

---

## 6. Core Components

### Buttons

**Primary**

- Background: `--od-accent`; text: white in light theme.
- Dark theme: light-violet accent fill with dark ink text.
- Inter 14px / 500; 8px radius; 10px 16px padding; min-height 40px.
- Hover/pressed use dedicated accent tokens; disabled uses neutral surfaces.
- At most one visually dominant primary action per _local decision region_, not one per entire long page.

**Secondary**

- White/surface fill, 1px strong-neutral border, primary text; same geometry.

**Tertiary / ghost**

- Transparent fill; subtle surface hover; no outline at rest unless needed for affordance.

**Destructive**

- Semantic red, visually subordinate until destruction is the explicit task; require clear labeling/confirmation where appropriate.

All interactive controls require visible `:focus-visible`, accessible names, and minimum practical hit areas of **44 × 44px** on touch surfaces where feasible.

### Links

- Inline links use `--od-link` and underline on hover/focus, with underline at rest in long-form documentation if needed for recognition.
- Navigation links are neutral until hover/active.
- Do not color every secondary action violet.

### Cards & panels

- White/surface fill, 1px border, 8px radius, 16–24px padding.
- Cards describe **distinct content or a discrete operation**; plain text feature grids should not become cards by default.
- Avoid card-inside-card repetition: use dividers and section headings inside a parent panel.
- Product preview frames use 12px radius and may have a soft shadow; standard cards do not.

### Inputs & forms

- Height 40–44px; 8px radius; 1px `--od-border-strong` border; surface fill.
- Label outside field, never rely on placeholder alone.
- Focus: 2px `--od-focus` outline with 2px offset, not just a barely visible glow.
- Error: red border + concise message + accessible association; never color-only.
- Group related controls with 12–16px vertical rhythm.

### Tabs / segmented controls

- Use **tabs** for views and **segmented controls** for mutually exclusive modes.
- Neutral track with an outlined or softly tinted active item, not oversized pills everywhere.
- 8px radius for the track; active indication must include more than color alone.
- In code demos, use clear labels such as `Source`, `Preview`, `Inspector`.

### Badges

- Small: 12px / 500, 4px 8px padding, 4px radius.
- Default neutral fill; optional soft-violet background for highlighted technology/category metadata.
- Status badges use semantic color with a label; do not treat every badge as a bright accent.

### Icons

- Lucide-style outline iconography, 1.75–2px stroke.
- Standard sizes: 16px in dense UI, 20px in primary controls, 24px in illustrative feature headings.
- Neutral by default; violet only for active/brand-relevant states.

### Code blocks

- Documentation default: `--od-surface-subtle` fill, 1px border, 8px radius.
- Site editors follow the active light/dark shell theme, with 12px showcase frames and compact chrome. Do not leave a dark editor inside a light-themed shell.
- IBM Plex Mono 13px, line-height 1.6; visible language label; working copy control.
- Highlight code semantically and accessibly. The syntax palette is **content styling**, not a second brand palette.
- Lines should wrap or scroll within the code block, never push the document width.

### Data visualizations

- White/neutral plot surface, subtle grid strokes, descriptive legends and units.
- Use violet for the primary data series, cool grays for comparisons, status colors when semantically necessary.
- No unlabelled chart-only state; include textual or tabular equivalents where important.

---

## 7. Signature Product Components

These are the distinguishing components for **OpenDIL**, not inherited from any of the inspiration sites.

### A. Source / Render Playground

The centerpiece of the site and developer experience.

**Desktop:** split two-pane layout: **DIL source on the left, live rendered output on the right**. Optional collapsible inspector panel shows component tree, props, state, events, and validation feedback.

**Narrow containers:** Source and Preview views each occupy the full frame. The demo also exposes React usage.

Visual rules:

- Parent frame: 12px radius, 1px border, soft shadow only on high-level promotional showcase.
- Toolbar: 44–48px, neutral with hairline bottom border.
- Source panel: locally bundled Monaco with DIL syntax, site-matched colors, and muted line numbers. The landing showcase displays upcoming source at 0.3 opacity and received source at full opacity. Demo edits apply automatically; editor controls stay out of its footer.
- Render panel: white, deliberately unbranded content canvas with optional dotted guide grid **outside** generated UI bounds.
- Separator: 1px border or accessible draggable splitter.
- Status bar: parse/render state, errors, and duration only when measured. Never fabricate latency or success claims.
- Playback controls share an animation speed, Pause/Resume, Replay, and Finish/Reset toolbar. Settings use compact segmented controls; editable examples also expose Run and auto-run.
- Documentation examples use the same split source and preview pattern, with their label outside the frame and no extra surrounding card.
- Animations between code and render should be restrained, fast, and disabled under reduced-motion preference.

### B. Component Tree / Inspector

- Compact hierarchical rows, 28–36px high, 14px UI text, and 12px mono node names.
- Indentation in 16px increments with subdued guide lines.
- Selected node uses a faint violet wash plus visible outline and synchronized highlight in the preview.
- Invalid node gets explicit icon, label, and error detail, not only a red border.
- Display props and state as inspectable structured data; avoid decorative meters.

### C. Example Gallery

- Each example shows a **real interface**, not a generic cover illustration.
- Card: 8px radius, 1px border, 16px padding; sample title and 1-line description below.
- Categories such as `Forms`, `Data`, `Navigation`, `Media`, `Interactive` are suggestions, not asserted implemented features.
- Each example should be runnable and have an accessible text description.
- Hover emphasizes border only; no zoomed screenshot effect.

### D. Generated Interface Boundary

**Critical architectural design principle:** OpenDIL's **renderer must not impose the OpenDIL marketing brand on generated content**.

- Separate shell variables (`--od-*`) from renderer theme variables or application-supplied tokens.
- Prefer scoping, CSS isolation, or documented theme contracts to prevent leakage.
- Generated component spacing, typography, and colors may differ from marketing-shell defaults.
- The shell controls inspector/toolbar affordances; the rendered region controls its own interface appearance.
- Validate generated interaction states independently from the shell theme.

---

## 8. Page Templates & Information Architecture

### Marketing Home

1. **Navigation** — 64px height; OpenDIL logo left; Docs, Playground, Examples, GitHub where actual destinations exist; one primary `Get started` action.
2. **Hero** — Left-aligned Space Grotesk display headline; short explanatory paragraph; primary + secondary CTA; sparse Composition Grid on the right. Target width 1200px.
3. **Live product preview** — Large source/render playground visual occupying most of content width; ideally interactive.
4. **Core pillars** — Three borderless text-led columns: composability, transparency, interactivity (treat as positioning, validate exact feature claims).
5. **How it works** — Explicit step sequence: provide declarative output → parse/validate → render interactive UI. Adapt to real architecture.
6. **Examples** — Real visual outputs with links to source.
7. **Open source section** — Repository, contribution path, license, and community links; only real metrics if fetched.
8. **Footer** — Documentation, repository, examples, release notes, license, accessibility.

### Documentation

- Desktop: left sidebar 240px, central article max 760px, optional right-side page outline 200px.
- Search and version selector in header where functionality exists.
- Mostly white canvas; subtle-neutral sidebar; blue/violet reserved for links and selected nav states.
- Headings, copyable code, runnable previews, admonitions, API tables, and keyboard navigation are first-class.
- Keep background grid and marketing pixel art **out of long-form reading columns**.

### Playground

- Maximize usable workspace; 100%-height editor-like shell when supported.
- Left source editor, right render canvas, optional inspector.
- Toolbar with example switcher, theme control (if available), reset, copy/share (only if implemented).
- Error messages appear near the relevant source and remain visible in accessible text.
- User-generated output is separated from privileged navigation and controls.

### Component Catalog

- Scannable navigation, component name in mono, prop contract, live example, source example, accessibility notes.
- Prefer table rows for parameters over marketing feature cards.
- Use clear supported/unsupported badges instead of speculative features.

---

## 9. Interaction & Motion

- Hover transitions: 120–160ms ease-out for color/border/background.
- Panels and overlays: 160–220ms; no spring bounce by default.
- No perpetually moving background ornament; no animated gradient.
- Demonstrate generative changes through **actual UI state** rather than decorative fake typing loops.
- Respect `prefers-reduced-motion: reduce`: disable transforms and nonessential animation.
- Loading should communicate real task progress where possible; fall back to a restrained skeleton only when appropriate.
- Keyboard and screen reader operations must work without hover.

---

## 10. Accessibility & Quality Gates

- Target **WCAG 2.2 AA** across site, docs, playground, and default shell.
- Check text contrast: **4.5:1** for normal text; **3:1** for large text and essential graphical control boundaries. Do not assume a token pair passes without testing.
- Keyboard-visible focus on links, buttons, tree rows, tabs, and editor controls.
- Touch targets should generally be at least **44px** where practical; never make a tiny icon the sole way to access essential functionality.
- Semantic headings, labels, form errors, status announcements, and descriptive copy actions.
- Light and dark themes require separate contrast auditing.
- Test at 320px, 375px, 768px, 1024px, and 1440px widths; verify no unintended horizontal overflow.
- Do not invent customer logos, contributor counts, benchmark claims, or fake editor output as evidence of real product capability.

---

## 11. Design Tokens — CSS Starter

The following are **shell and documentation defaults**. The OpenDIL renderer must be able to accept an independent theme.

```css
:root {
  color-scheme: light;

  /* Fonts */
  --od-font-display: "Space Grotesk", "Inter", system-ui, sans-serif;
  --od-font-body: "Inter", system-ui, sans-serif;
  --od-font-code: "IBM Plex Mono", ui-monospace, monospace;

  /* Light theme */
  --od-canvas: #ffffff;
  --od-surface: #ffffff;
  --od-surface-subtle: #f6f7f9;
  --od-surface-muted: #eef0f4;
  --od-text: #252838;
  --od-text-secondary: #565e70;
  --od-text-muted: #70798a;
  --od-border: #e1e5ec;
  --od-border-strong: #c8ced9;
  --od-accent: #5e4cff;
  --od-accent-hover: #4935e8;
  --od-accent-pressed: #3725bb;
  --od-accent-soft: #f0eeff;
  --od-accent-border: #cdc7ff;
  --od-link: #4935d0;
  --od-terminal: #1b1d29;
  --od-terminal-text: #e2e5f0;
  --od-focus: #5e4cff;
  --od-on-accent: #ffffff;

  /* Status */
  --od-success: #16794b;
  --od-warning: #9a5b00;
  --od-danger: #c02d3a;
  --od-info: #235eb5;

  /* Spacing */
  --od-space-1: 4px;
  --od-space-2: 8px;
  --od-space-3: 12px;
  --od-space-4: 16px;
  --od-space-5: 20px;
  --od-space-6: 24px;
  --od-space-8: 32px;
  --od-space-10: 40px;
  --od-space-12: 48px;
  --od-space-16: 64px;
  --od-space-20: 80px;
  --od-space-24: 96px;

  /* Shape */
  --od-radius-xs: 4px;
  --od-radius-sm: 6px;
  --od-radius-md: 8px;
  --od-radius-lg: 12px;
  --od-radius-full: 999px;

  /* Layout */
  --od-page-max: 1200px;
  --od-article-max: 760px;
  --od-page-gutter: 24px;
  --od-border-width: 1px;
  --od-shadow-overlay: 0 8px 24px rgba(27, 29, 41, 0.1);
  --od-shadow-showcase: 0 24px 60px rgba(27, 29, 41, 0.12);
}

[data-od-theme="dark"] {
  color-scheme: dark;
  --od-canvas: #12141c;
  --od-surface: #1b1e29;
  --od-surface-subtle: #232735;
  --od-surface-muted: #2d3242;
  --od-text: #f1f2f8;
  --od-text-secondary: #b8bece;
  --od-text-muted: #979fb3;
  --od-border: #34394a;
  --od-border-strong: #4d5469;
  --od-accent: #a79cff;
  --od-accent-hover: #bdb5ff;
  --od-accent-pressed: #d0caff;
  --od-accent-soft: #302a55;
  --od-accent-border: #6559ad;
  --od-link: #b2a9ff;
  --od-terminal: #10121a;
  --od-terminal-text: #e2e5f0;
  --od-focus: #b2a9ff;
  --od-on-accent: #12141c;
  --od-shadow-overlay: 0 8px 24px rgba(0, 0, 0, 0.28);
  --od-shadow-showcase: 0 24px 60px rgba(0, 0, 0, 0.32);
}

@media (max-width: 639px) {
  :root {
    --od-page-gutter: 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Implementation examples

```css
.od-page {
  background: var(--od-canvas);
  color: var(--od-text);
  font-family: var(--od-font-body);
}

.od-container {
  width: min(calc(100% - 2 * var(--od-page-gutter)), var(--od-page-max));
  margin-inline: auto;
}

.od-card {
  background: var(--od-surface);
  border: 1px solid var(--od-border);
  border-radius: var(--od-radius-md);
  padding: var(--od-space-6);
}

.od-button-primary {
  background: var(--od-accent);
  color: var(--od-on-accent);
  border: 1px solid transparent;
  border-radius: var(--od-radius-md);
  padding: 10px 16px;
  min-height: 40px;
  font: 500 14px/1.4 var(--od-font-body);
}

.od-button-primary:hover {
  background: var(--od-accent-hover);
}
.od-button-primary:active {
  background: var(--od-accent-pressed);
}

.od-button-primary:focus-visible,
.od-control:focus-visible {
  outline: 2px solid var(--od-focus);
  outline-offset: 2px;
}

.od-display {
  font-family: var(--od-font-display);
  font-size: clamp(40px, 5vw, 64px);
  line-height: 1.04;
  letter-spacing: -0.035em;
  font-weight: 600;
}

.od-playground {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  border: 1px solid var(--od-border);
  border-radius: var(--od-radius-lg);
  overflow: hidden;
}

.od-playground > * {
  min-width: 0;
}
.od-playground > :first-child {
  border-right: 1px solid var(--od-border);
}

@media (max-width: 767px) {
  .od-playground {
    grid-template-columns: minmax(0, 1fr);
  }
  .od-playground > :first-child {
    border-right: 0;
    border-bottom: 1px solid var(--od-border);
  }
}
```

### Tailwind v4 bridge (optional)

```css
@import "tailwindcss";

@theme inline {
  --color-od-canvas: var(--od-canvas);
  --color-od-surface: var(--od-surface);
  --color-od-text: var(--od-text);
  --color-od-border: var(--od-border);
  --color-od-accent: var(--od-accent);
  --font-od-body: var(--od-font-body);
  --font-od-display: var(--od-font-display);
  --font-od-code: var(--od-font-code);
}
```

Keep the theme bridge optional. The system is framework-agnostic; CSS variables are its source of truth.

---

## 12. Example Screens

### Hero specification

- Eyebrow (optional): 12px mono, neutral, such as `OPEN SOURCE · GENERATIVE UI`.
- H1: `Generate interfaces. Keep control.` at display size; 2–3 lines maximum.
- Supporting text: concise and concrete, 18px body; maximum 60 characters per line.
- Primary CTA: `Open playground` (only if available); secondary: `Read documentation`.
- Right/below: composed interface diagram or authentic split source/render preview; faint 16px construction lines outside the rendered UI.
- No hero mascot, stock photography, gradient blobs, or multiple competing CTA colors.

### Feature block

Three columns with titles in Space Grotesk 24px and Inter 14–16px descriptions. No mandatory cards or icon. If icons genuinely help, use neutral 20px outline marks. Start each title on a shared alignment baseline.

### Code + preview showcase

A 1200px-wide framed view with source editor, live preview, and a small `Source / Preview` tab fallback for narrow screens. Use actual example code and rendered output. Dark terminal and white preview create the key visual contrast.

---

## 13. Do / Don't

**Do**

- Use one identifiable violet; keep most content neutral.
- Show authentic DIL-like source **next to its rendered interface**.
- Give standard components 8px radii and structural 1px borders.
- Use Space Grotesk for large headings, Inter for UI, IBM Plex Mono for code.
- Use sparse technical grid/pixel geometry around hero demos only.
- Preserve readable typography and clear keyboard/focus states.
- Keep the rendered output theme independent of the OpenDIL shell.
- Prefer honest implementation screenshots and real project data over invented social proof.

**Don't**

- Mix multiple bright blue/violet primaries from the source references.
- Use all three source brands' font treatments simultaneously.
- Decorate with raindrop mascots, handwritten annotation, generic AI stars, or stock photos.
- Apply shadows to every card or rounded pill styling to every button.
- Render every section on a visible grid background.
- Force OpenDIL branding onto third-party generated UIs.
- Claim unsupported features, benchmarks, download counts, or GitHub stars.
- Use a dark code panel as an excuse for unreadable small text.

---

## 14. Prompt for Design & Coding Agents

> Design and build an interface for **OpenDIL**, an open-source generative UI workbench. Follow `DESIGN.md` as the visual source of truth. Use near-white backgrounds (`#FFFFFF`), cool ink text (`#252838`), structural hairlines (`#E1E5EC`), and a single violet brand accent (`#5E4CFF`). Typography: Space Grotesk for display headings, Inter for body/UI, IBM Plex Mono for code. Use an 8px default radius, 12px for showcase frames, a 4px spacing base, and 1200px maximum content width. Prioritize authentic source-to-render previews, clearly separated code and rendered interface regions, restrained 16px grid/pixel motifs, neutral bordered cards, accessible focus states, and fluid responsive layouts. Default to little or no shadow except on floating overlays and flagship showcases. Do not use gradients, mascots, stock imagery, generic AI sparkle visuals, or multiple vivid accent colors. **Keep OpenDIL shell styles separate from the themes of generated output.** Respect light/dark modes and reduced motion. Use only real product claims and working UI controls.

---

## 15. Provenance & Decisions

This design is a deliberate synthesis of three supplied inspiration documents:

- **Zed — Style Reference:** editorial structure, blueprint grid, text-led hierarchy, code/product showcase.
- **Drizzle ORM — Style Reference:** developer-workbench density, border-driven surfaces, compact utility cards, documentation and code prominence.
- **Lightdash — Style Reference:** violet emphasis, geometric display typography, pixel-grid identity, soft high-level product framing.

### Conflict resolution

| Conflicting source guidance                                   | OpenDIL decision                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------- |
| Zed 2px vs Drizzle 8px vs Lightdash 8/12px radii              | Default 8px, 12px for large previews, 4px chips                   |
| Zed serif vs Drizzle Inter vs Lightdash Britti                | Space Grotesk display + Inter body + IBM Plex Mono code           |
| Zed blue vs Drizzle cobalt vs Lightdash violet                | One violet `#5E4CFF`; purple/blue status colors are semantic only |
| Zed gray grid canvas vs Drizzle cloud vs Lightdash white      | White canvas, subtle-gray panels, sparse grid motif               |
| Zed ultra-compact vs Drizzle compact vs Lightdash comfortable | Compact tooling, comfortable marketing/docs                       |
| No shadows vs Lightdash layered shadows                       | Borders by default; shadows only for overlays/hero showcase       |
| Mascot/handwriting vs pixel motif vs blueprint texture        | Composition Grid and sparse modular pixel tiles                   |

**Product assumption:** This document defines OpenDIL's proposed brand and visual language. It does not verify its current API, implementation, project status, license, or feature inventory. Replace suggested labels and flows with the repository's actual behavior during implementation.
