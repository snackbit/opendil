# Security

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/snackbit/opendil/security/advisories/new). Include a minimal DIL document, rendering mode, browser/package versions, and the observed boundary violation. Avoid posting an exploit publicly before maintainers respond.

The latest released version is the supported security target. This is an early project; the sandbox has regression tests but has not received an independent security audit.

Default rendering uses an opaque-origin iframe, a restrictive CSP, and a bounded QuickJS worker per document. Self-host the runtime assets supplied with the same package version, and serve `frame.html` with the sandbox and `frame-ancestors` headers described in [Rendering modes](apps/site/content/docs/rendering-modes.mdx). Do not add `allow-same-origin`, remove the CSP, or expose host execution capabilities to authored expressions.

Host and Shadow DOM modes are for trusted documents and trusted React extensions. Shadow DOM encapsulates markup and styles while sharing the page's JavaScript privileges; it does not provide iframe containment or its network policy. Extensions can access the host DOM, network, and application state. Validate their attributes and URLs, and avoid raw HTML or unsafe prop spreading. Expression limits do not sandbox a consumer's React code.

Release automation uses npm trusted publishing with provenance. Maintainers should restrict the publishing environment and default branch, enable account two-factor authentication and private vulnerability reporting, and follow the setup in [Contributing](CONTRIBUTING.md).
