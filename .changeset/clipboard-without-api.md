---
"@snackbit/opendil": patch
---

Report a failed copy instead of throwing where the Clipboard API is unavailable, such as pages served over plain HTTP. `GenUI.copy` actions now always show their "Copied" or "Copy failed" feedback in every rendering mode, also when a host `copy` handler throws, and the iframe renderer no longer requires the User Activation API (Safari before 16.4).
