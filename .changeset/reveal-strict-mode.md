---
"@snackbit/opendil": patch
---

`progressiveReveal` now animates in host and Shadow DOM modes under React
`StrictMode` and when React replays effects, for example when an `<Activity>`
shows its content again. Before, the replayed effects marked every block as
already shown, so nothing faded in. Blocks that finished revealing still do not
animate again.
