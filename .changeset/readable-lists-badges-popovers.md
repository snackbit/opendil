---
"@snackbit/opendil": patch
---

Keep Markdown lists, status badges and popover text readable in every page and appearance.

- Markdown lists keep their bullets, numbers and indentation, and block quotes
  their indentation, in host mode on pages with a CSS reset such as Tailwind's
  preflight. The renderer's styles now set them, with the same values browsers
  use by default, so iframe and Shadow DOM rendering look as before.
- Badges and text with `color="success"`, `"warning"` or `"danger"` follow the
  renderer's appearance: dark appearance uses dark tinted badge backgrounds and
  lighter status text instead of light pastel fills. The colors come from the
  new tokens `--dil-success-surface`, `--dil-warning-surface` and
  `--dil-danger-surface` and the existing `--dil-success` and `--dil-warning`,
  which `tokens` can override.
- Consecutive children of `<popover-content>`, such as several `<text>`
  elements, stack as separate lines with the usual spacing instead of running
  together on one line.
