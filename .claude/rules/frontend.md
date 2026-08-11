---
paths:
  - "apps/web/**/*.tsx"
  - "apps/web/**/*.css"
---

# Frontend rules

## Component boundaries

Server Components by default. Add `'use client'` only for genuine interactivity, and push it as
deep in the tree as it will go — a client boundary at the page level drags the whole subtree into
the bundle. Fetch data in the server component and pass plain serializable data down.

## Next.js 16

`params`, `searchParams`, `cookies()`, `headers()`, and `draftMode()` are all async — `await`
them. Use the generated `PageProps<'/route'>` and `LayoutProps<'/route'>` helpers rather than
hand-typing props.

## Styling

Tailwind v4, configured CSS-first through `@theme` in `globals.css`. Use the theme tokens; no
arbitrary hex values, one-off `px` sizes, or inline `style` in components. If a value is needed
twice, it belongs in the theme.

Every surface renders in both light and dark. Never hard-code a color that only reads in one.

## Accessibility

- Anything clickable is a `<button>` or `<a>`, never a `<div>` with an `onClick`. Citation chips
  are buttons — they are keyboard-reachable and announce what they reference.
- Every input has a label; every icon-only control has an accessible name.
- Focus is visible. Do not remove the focus ring without replacing it.

## States

Every async boundary ships all four: loading, empty, error, and success. An error state says what
failed and offers the next action; "Something went wrong" alone is not acceptable.

The abstained answer ("not covered by this corpus") is a distinct state, not an empty answer —
render it as its own thing so a user can tell honesty from failure.

## Responsive

Verified at 375 px, 768 px, and 1440 px. On mobile the source panel is a sheet, not a squeezed
column.
