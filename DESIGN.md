# ListBoost Design System

## Direction

ListBoost is Vinted-coded without copying Vinted: white-first, teal accent, coral warmth for warnings, friendly practical copy, and compact seller workflows.

## Tokens

- `--color-bg`: app background
- `--color-surface`: card surface
- `--color-fg`: primary text
- `--color-muted`: secondary text
- `--color-accent`: teal action colour
- `--color-accent-warm`: coral warning/accent
- `--color-border`: borders and dividers
- `--radius-sm`, `--radius-md`, `--radius-lg`
- `--space-1` through `--space-8`

## Components

- Button: `.button`, `.button.primary`, `.button.secondary`
- Card: `.card`
- Badge: `.badge`
- Pricing card: `.price-card`
- Toast: `.toast-region`, `.toast`
- Empty state: `.empty-state`
- Skeleton: `.skeleton`
- FAQ accordion: `.faq-item`

## Accessibility

- System font stack only; no external font CDN.
- Visible focus rings inherited from the existing global focus rules.
- Dark mode honours `prefers-color-scheme` and can be toggled manually with `.theme-toggle`.
- `prefers-reduced-motion` disables animations.
- Toast region uses `aria-live="polite"`.

## Screenshots

Screenshot tour placeholders are committed in `docs/screenshots/README.md`. Replace them with Playwright screenshots from the preview environment before merge approval.
