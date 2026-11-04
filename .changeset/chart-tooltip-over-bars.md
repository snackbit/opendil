---
"@snackbit/opendil": patch
---

Show chart tooltips only where they belong and keep them on the cursor.

- Bar charts show a tooltip while the pointer is over a bar or anywhere in the column above it, and highlight that series. Gaps between bars show nothing, and bars no longer get a snap dot.
- Pie charts show a tooltip only over a slice. The donut hole and the area outside show nothing.
- Line and scatter charts still snap to the nearest data point. Only the snapped dot is shown; the stale Recharts active dots that could linger, for example after entering from the right edge, are gone.
- When a tooltip lists several series, the hovered series is bold. `ChartTooltipContent` accepts an optional `emphasizedKey` that marks the matching row with `data-emphasized="true"`.
- The stock Recharts tooltip, its category band, and its active dots appear only while the chart has keyboard focus, for arrow-key navigation. Mouse hover shows exactly one tooltip, which no longer lags or flies in.
- Hidden series in the legend are dimmed without a strikethrough.
