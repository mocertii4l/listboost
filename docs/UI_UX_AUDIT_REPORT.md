# ListBoost — UI / UX Audit Report

**Audit date:** 2026-05-04
**Branch audited:** `redesign-v1` (commit `fa556fa`)
**Live preview:** https://listboost-preview-production.up.railway.app
**Reference standard:** [docs/ui-ux-pro-max/.../SKILL.md](./ui-ux-pro-max/ui-ux-pro-max-skill-main/.claude/skills/ui-ux-pro-max/SKILL.md) — categories §1 Accessibility, §2 Touch & Interaction, §3 Performance, §4 Style Selection, §5 Layout & Responsive, §6 Typography & Color, §7 Animation, §8 Forms & Feedback, §9 Navigation Patterns.
**Scope:** Read-only audit of the deployed preview and source files. No app code changed, no commits, no deploys.
**Tone:** Brutally honest, design-first.

---

## 1. What ListBoost does

ListBoost is a UK-focused SaaS for Vinted sellers. A user pastes rough item notes (or uploads up to 4 photos) and receives a "sell-ready" listing package — title, description, keywords, price guidance, photo checklist, buyer reply — in a single screen. Output is copy-paste only; ListBoost does not log into Vinted on the user's behalf. Subscriptions are monthly: Starter £6.99 / 20 listings, Seller £14.99 / 75 (best value), Elite £29.99 / 250.

The app is a custom Node HTTP server, static HTML pages, vanilla JS routing in `public/site.js`, a single global stylesheet, SQLite per-user storage, Stripe Checkout for billing, Resend for email.

---

## 2. Current UI score

**Overall: 6.0 / 10.**

What it gets right (around 8/10): clean palette, real focus rings, sensible spacing tokens, dark-mode tokens, working empty-state scaffolds, working progress strip, real Stripe + email plumbing, working keyboard reachability, no fake "Test card" leakage, no horizontal-scroll bugs at 768px+.

What drags it down to 6 (the rest of the report):
- Pricing page is competent but not premium — feels like a free template.
- Hero "browser-mock" card is a paper-thin cliché; no item photography (real or styled SVG).
- Demo and generator flows still read as forms, not products.
- Numerous typographic and component inconsistencies (eyebrow style, heading sizes, badge weights, mixed icon weights, mixed card styles).
- Mobile bottom nav has no icons → poor scannability vs § 9 `nav-label-icon`.
- Visual brand identity is generic teal — no memorable logotype, no claim, no character.
- Multiple decorative gradients but no cohesive design language; every section feels invented.
- Trust signals are weak: no real testimonials, no real seller proof, no logos, no metrics, no example before/after gallery.
- Some copy is functional but flat, occasionally inconsistent ("3 free listings" vs "3 listings to try ListBoost" vs "Free trial").
- Not a single page demonstrates a finished, polished detail (beautiful pricing card, hero, success state).

A 10/10 SaaS lands at "Linear, Stripe, Resend, Vercel" levels — every page feels considered, every detail is intentional, the brand has a unique voice. ListBoost today reads like a well-organised but generic agency template.

---

## 3. Page-by-page audit

### `/` (homepage) — **6.5 / 10**

Files: [public/index.html](../public/index.html), [public/site.js](../public/site.js#L292) (header injection), [public/styles.css](../public/styles.css#L1023) (pricing card).

Issues:
- Hero: a "browser chrome" mock around a sample listing card is a tired pattern. No actual item photography, no styled clothing illustration in the hero — it lives later in the page. The hero is mostly text.
- The "accent" gradient on the headline ("sell-ready Vinted listings") is fine but the rest of the page has no other gradient text, so the accent feels orphaned.
- Three trust-row pills under the CTA are tiny, low contrast, and do not feel earned.
- "Before and after" comparison is good in concept but the *Before* card is a dashed-pattern box with monospace text — it looks like a code editor, not a Vinted note. The *After* card uses the same listing-card template that appears on every other page, so the transformation feels weaker than it is.
- Three-step "How it works" tiles use `<span class="step-number">` with a green badge — but the visual weight of step number, h3, and trust-strip below all compete.
- Feature grid uses six identical white tiles with a single Lucide-style icon. Every tile reads the same. No emphasis, no preview, no example.
- Seller-example cards (Zara dress / Nike trainers / Kids bundle) are the strongest section — keep them, but the trainer/dress/bundle illustrations are CSS-only and look flat next to the rest of the page.
- Pricing teaser is a near-duplicate of `/pricing`. Two near-identical pricing tables on the homepage and the pricing page is wasteful and confusing.
- FAQ section uses a default disclosure pattern with no animation — on click it just changes `aria-expanded`.
- Footer is fine.
- No social proof, no logo wall, no testimonials, no review stars, no anchor text from real Vinted sellers.

### `/example` — **6 / 10**

File: [public/example.html](../public/example.html).

- The 2-column "demo flow" with numbered Step 1 input → arrow → Step 2 output is a real improvement over the original form layout.
- The right side scaffold ("Title / Description / Keywords / Price guidance / Photo checklist / Buyer reply") shows what the user is *about* to get — good.
- Pre-filled textarea is editable and the demo button is clear.
- After clicking Generate, the result replaces the scaffold with `outputTemplate` — same template the app uses. Good for fidelity but on a marketing/demo page, the result feels too dense and the page does not push the user toward signup right after success.
- No visible time estimate before clicking ("Most listings finish in a few seconds. Photo listings can take a little longer." appears only on the app's notes page, not on demo).
- "Your input vs generated listing" before/after card inside the demo result reuses the same plain styling as the homepage comparison. Nothing visually celebrates the transformation.
- The `demo-cta-strip` post-result CTA is clear and the only properly visualised CTA on the page.

### `/pricing` — **5 / 10**

Files: [public/pricing.html](../public/pricing.html), [public/styles.css](../public/styles.css#L1141) (pricing-compare), [public/site.js](../public/site.js#L186) (template parity).

- Three cards with a "Most popular" ribbon on Seller — the right anchor pattern. Featured card lifted by `translateY(-8px)`.
- After my last fix, the bullets are no longer stretched, and the buy button is pinned to the bottom. Equal heights work.
- But: Elite has 10 bullets, Starter has 3. Even with `align-content: start`, Starter's white space below the bullets is huge. There's no compensating visual content (no per-plan icon, no "How does this compare?" link, no testimonial inside the card).
- The price block — 44px gradient number + "listings/month" — competes with `pricing-meta` (£X.99/month). A user has to read two numbers to learn one thing. A typical SaaS shows price-as-hero and limit as a chip — here the limit is the hero and the price is a subtitle.
- Trust strip ("No Vinted login needed", "Cancel any time") is too quiet, in low-contrast pills.
- No comparison table. With three plans and ten Elite bullets, a comparison matrix would beat three feature lists.
- No guarantee, no "cancel anytime, refund within 14 days" headline.
- "Best for casual sellers / regular sellers / daily sellers" pill is a nice signal but is muted teal pill text — it should be the loudest copy after the price.
- FAQ at the bottom is the same vertical stack pattern as the homepage — no in-page anchor, no search.
- Pricing CTA uses brand teal — but Elite (£29.99) gets a quieter ghost button. Visually, Elite feels demoted, not premium.
- No visualised "AI generation" anywhere on this page. The user has to imagine what they're paying for.

### `/signup` and `/login` — **5.5 / 10**

File: [public/auth.html](../public/auth.html).

- Both routes share the same auth shell ([auth.html](../public/auth.html) — 36 lines). The `installAuthMode()` function ([site.js:524](../public/site.js#L524)) flips the heading, intro, button label, and the name field's visibility based on `location.pathname`.
- Card is centred, has a back-to-home button, an inline "Forgot password?" link.
- Issues:
  - Password field is marked `autocomplete="current-password"` for *both* signup and login. On signup it should be `new-password` so the browser does not insert the user's existing password from another site.
  - No password strength meter, no visible password requirements, no positive feedback when a strong password is typed.
  - No "Continue with Google / Apple" social options — for a consumer-facing UK Vinted seller, this is a real signup-conversion drag.
  - "Show password" eye icon is good and works, but the toggled state is a generic eye glyph, not a distinct visual state.
  - No link to terms/privacy on the signup form (compliance soft spot).
  - Error messaging shows under the input — good. But `aria-live="polite"` is on each field's `<p class="field-error">` — fine, however a top-level error summary for screen readers is missing per § 8 `error-summary`.
  - No "Welcome back, [name]" personalised state on a returning visit.

### `/checkout/success` — **7 / 10**

File: [public/checkout-success.html](../public/checkout-success.html).

- Three real CTAs (Start generating listings, View billing, Go to dashboard) — good.
- "Subscription active" pill with a pulsing green dot — good signal of success.
- A `<dl>` with Plan + This month's usage — populated by JS once the webhook resolves.
- Issues:
  - "Activating subscription…" → "Your subscription is active" transition is fine but feels mechanical. No celebratory micro-moment, no confetti (one was wired in CSS earlier but does not visibly fire here based on the source), no warm welcome from the team.
  - Copy "If email confirmations are enabled for your account, a copy will arrive…" — honest, but unnecessarily defensive. Most SaaS just says "We've sent a receipt to {email}".
  - No next-best-action helper ("Try a Zara dress example?" / "Watch a 60-second tour?").
  - No invoice link, no first-payment receipt summary, no card brand last-4. A serious SaaS shows "Visa •• 4242 • £14.99 • Next charge 5 Jun".

### `/app` (dashboard) — **6 / 10**

Templates: [public/site.js:626](../public/site.js#L626) `dashboardRouteTemplate`.

- Three top-row cards: This month's usage / Current plan / Quick action. The Quick-action card is the strongest visually but duplicates the welcome card's "Generate a listing" CTA two centimetres above it.
- Welcome card "Generate your first listing in 30 seconds" is shown until the user has any usage > 0 ([site.js:961](../public/site.js#L961)) — good empty-state for first-run.
- Feature-tile grid ("Notes to listing", "Photo Listing", "Listing Score", "Buyer Replies") — but `/app/score` and `/app/replies` are still wired in the routing and render real templates, even though the public pricing copy presents them as features of Seller and above. There is no plan-gated UI: a free user can navigate to `/app/score` and `/app/replies` and see the form. The form will fail behind the paywall when generating, but the route is reachable. That is confusing, not premium.
- Recent activity card has good empty-state but on dashboards in 9/10-tier SaaS this would also show usage trend, last 7-day chart, or "your most-copied output". None present.
- App nav is `Dashboard / Generator / Photo / History / Billing` — no icons. Per § 9 `nav-label-icon` ("Navigation items must have both icon and text label; icon-only nav harms discoverability"), label-only is the inverse problem at this size: it works on desktop but on mobile the bottom-nav is icon-less and label-only too, which compresses tap targets.

### `/app/notes` — **6.5 / 10**

Template: [public/site.js:786](../public/site.js#L786) `notesRouteTemplate`.

- Good: example chips (Zara / Nike / Kids), live char count, sticky form on desktop, scaffold preview on the right with 6 placeholder cards, the new progress strip with timed step pipeline + elapsed-seconds clock + "Still working" notice after 8s.
- Bad:
  - The textarea is a generic native textarea with no placeholder polish. No syntax highlighting, no inline tip ("Brand · Size · Condition · Flaws"), no prompt examples surfaced under the field.
  - "Tone" is locked to `clean` via a hidden input — but tone is a useful selling-side feature. Hiding it removes user agency for no obvious reason.
  - The `js-usage` chip in the form footer says "0 / 75 listings used" but the same pill exists in the app header. Duplicated state in the same viewport.
  - The result panel uses one identical card style for all six output sections. There is no visual difference between Title and Photo checklist — they should feel distinct (the Photo checklist deserves a checkbox-style list, the price guidance deserves a price-row mini-card).
  - "Copy all" is in the toolbar but copy buttons are also on every section. A user is not sure which to use.
  - No "Edit" affordance — outputs are read-only. A user who wants to tweak the title before copying has to copy, paste somewhere, edit, paste back. Editable output is the single biggest UX miss in the whole app.
  - No history-aware "Save and name this listing" prompt; outputs are saved to history but the user is never told.

### `/app/photo` — **6 / 10**

Template: [public/site.js:732](../public/site.js#L732) `photoRouteTemplate`.

- Photo dropzone with `accept="image/*" capture="environment"` — correct for mobile camera.
- Empty state has been upgraded to step-cards + a CSS-illustration mock listing — the strongest empty state in the app. Keep.
- Bad:
  - Photo previews are not shown after selecting files. Users pick 4 photos and the form gives no visual confirmation until generation completes.
  - No drag-and-drop handler (the dropzone is a label wrapping a file input).
  - Per § 8 `multi-step-progress`, the photo flow has natural steps (upload → details → generate) but the generator collapses them all into one form. A two-step wizard would feel more confident.
  - No image compression / resize on the client. A 4 × 12 MB photo upload is slow and burns bandwidth.
  - No EXIF or auto-rotation handling.

### `/app/billing` — **6.5 / 10**

Template: [public/site.js:881](../public/site.js#L881) `billingRouteTemplate`.

- Three top cards (Plan / Usage with a real progress bar / Cycle ends) — good. Plan benefits list is honest, includes "(coming soon)" tags. Manage-subscription button is conditional on `isPaying`.
- Recent billing activity is real.
- Issues:
  - The full plan-grid is duplicated again here — the user has now seen the same three pricing cards on `/`, `/pricing`, `/app/billing`, and the paywall modal. Four times, with subtle copy differences.
  - "Recent billing activity" formats dates via `formatDate()` — but lists "Reset" as the amount column for a plan-cycle reset, which reads weird. A real billing page lists invoice rows with amount, status, action.
  - No invoice download.
  - No "your next charge: £14.99 on 5 June 2026" summary line.
  - The upgrade flow does not show price difference / proration before opening Stripe.
  - No way to *pause* a subscription, only to manage in the Stripe portal (which then opens an external page with no breadcrumb back).

### `/app/account` — **7 / 10**

Template: [public/site.js:931](../public/site.js#L931) `accountRouteTemplate`.

- Profile / Theme / Security / Sign out as four panels. Theme switcher (System / Light / Dark) works. Verified email is read-only with a clear lock copy. Password change form is correctly autocomplete-tagged.
- Issues:
  - No avatar upload, no display name shown elsewhere.
  - No connected services, no integration list, no connected Stripe customer link.
  - No "Delete my account" flow despite it being a UK GDPR requirement (privacy notice promises it but the UI doesn't expose it).
  - Sign-out card is its own panel — fine, but every other page already has a sign-out button in the header. Three sign-out affordances inside the app.

---

## 4. Top 25 UI/UX problems (ranked, brutal)

1. **The pricing-card grid is the same template four times** (`/`, `/pricing`, `/app/billing`, paywall). A SaaS with one pricing experience is premium; one with four redundant pricing widgets is amateur.
2. **No real seller social proof anywhere.** Not a single quote, photo, name, city, "Vinted seller score", or first-name testimonial. Trust is asserted ("for UK Vinted sellers"), never earned.
3. **Generated listing output is read-only** — a Vinted seller will tweak one word in 9/10 generations. Forcing copy → paste → edit → paste back is the single largest in-product friction.
4. **Hero card lacks any visual representation of an actual item.** Browser-chrome mock + listing card is a generic SaaS pattern, not a Vinted-seller pattern. A photographed clothing flat-lay (or a styled SVG flat-lay) would communicate the value in 200ms.
5. **Mobile app nav is label-only and ≥ 5 items.** § 9 `bottom-nav-limit` and `nav-label-icon`. Compress to icons + labels at ≤ 4 primary destinations.
6. **Pricing card price-vs-limit hierarchy is inverted.** The big number on each card is the listing limit ("75"), not the price ("£14.99"). Most users compare prices first; force the price to be the hero.
7. **No invoice / receipt / next-charge summary on the billing page.** Stripe sends an email but the in-app billing tab pretends invoices don't exist.
8. **Inconsistent eyebrow style.** Some sections use a teal pill `.eyebrow`, others use plain text "Live demo", others use a `<span class="badge">`. § 4 `consistency`.
9. **Inconsistent button labels.** "Subscribe Starter" / "Subscribe Seller" / "Subscribe Elite" — but the homepage uses "Subscribe monthly" on the featured card, and the paywall uses "Subscribe monthly" on the featured plan. § 4 `consistency`.
10. **Auth signup form uses `autocomplete="current-password"` on the password field.** This makes browsers suggest *existing* passwords on signup. Per § 8 `autofill-support` you need `autocomplete="new-password"` on the signup variant.
11. **No social login.** A Vinted seller is consumer-grade; "Continue with Google" lifts signup conversion 20–40 % in B2C SaaS.
12. **Photo upload has no preview thumbnails.** Selecting 4 photos and seeing nothing before pressing Generate is a trust break.
13. **Demo doesn't push to signup hard enough after a successful generation.** The demo CTA strip exists but is below the result, with no re-engagement hook.
14. **`/app/score` and `/app/replies` are reachable but presented as paid Seller features in marketing copy.** Routes are not gated; the form simply works (or 402s on submit). Either gate the route, or remove the marketing claim.
15. **No comparison table on the pricing page.** Three feature lists with overlapping bullets force the user to do their own diff.
16. **No "Most popular" ribbon scaling on mobile.** At 375 px the ribbon and Seller card lift overlap the Starter card's badge.
17. **Trust pills are decorative, not credible.** "Cancel any time" / "Independent tool" / "No Vinted login" repeat across every page in identical pill styles, but read as filler.
18. **Empty-state language is inconsistent.** "Your sell-ready listing will appear here", "Output appears here in seconds", "6 sections, copy-ready, in seconds", "Photo listing output will appear here" — the same idea written four ways.
19. **Generation toast says "Listing generated."** No persistent confirmation, no celebration, no "How was that? 👍 / 👎" feedback prompt.
20. **No keyboard shortcuts.** § 1 `keyboard-shortcuts`. Cmd-Enter to generate, Cmd-C to copy each section, J/K to move between sections — none implemented.
21. **No prefers-reduced-motion check on the progress strip's `lb-pulse` and shimmer animations.** Most are gated; the progress dot's pulse is *always on*.
22. **The hero `accent` text-gradient is the only place the palette plays with brand expression.** No accent borders, no accent badges, no accent illustration. Brand identity feels half-built.
23. **Footer is dense and small.** Three columns at 14 px with thin teal links — invisible to many users.
24. **Verify-email page is a two-line plain box** (1.4 KB total). Compare to the success page (12 KB). Verify is the most-failed step in onboarding and gets the least UI investment.
25. **Logo is a generic teal "L" in a square.** No wordmark personality, no whisper of the product.

---

## 5. What makes the UI feel unprofessional

- **Multiple "card patterns" with no shared identity.** The hero mock card, the seller-example card, the pricing card, the success card, the billing-summary card, the scaffold card, the photo-empty mock card, the comparison card — each uses a slightly different border-radius, shadow, gradient, and badge style. § 4 `consistency`, § 4 `elevation-consistent`.
- **"Browser chrome" hero is a 2018 SaaS cliché.** Every starter SaaS template ships with one. It does not say "we are the Vinted listing tool".
- **Generic Lucide icons applied at four sizes** (24 / 18 / 14 / pill-12) with three stroke widths in observed code. § 4 `icon-style-consistent`.
- **Soft teal gradients on a soft teal background.** Brand colour bleeds into the surface and washes out hierarchy. § 6 `visual-hierarchy`.
- **Two pricing tables on the homepage and pricing page.** Reads as "we couldn't decide where to put the money question".
- **Empty-state copy contradicts itself** ("3 free credits" had been removed but the verify email card still used the old framing in older commits — recent changes fixed this; the principle stands: the brand voice is not stable across pages).
- **Footer brand colour is teal-on-teal.** Hard to scan.
- **Auth shell logo has no clear-space or vertical centering — it sits left-aligned in a centred card** with no balancing element.
- **No motion language.** Buttons have nice hover lifts, but cards on click do not respond, list items in history don't expand, and result-card hover is a flat translate-Y without a meaningful payoff.
- **No personality copy.** "Subscribe monthly", "Generate sell-ready listing", "Your listing is ready" — functional, not memorable. A premium SaaS has a voice.

---

## 6. What makes the UI feel trustworthy

- Real focus rings, real `aria-live`, real skip-link, real `:focus-visible` styling.
- Real Stripe metadata, real webhook signature verification, real subscription cancellation handling.
- Honest pricing copy ("Reusable listing templates (coming soon)" rather than claiming the feature).
- No hardcoded test cards or "lorem ipsum".
- Clear "Independent — not affiliated with Vinted" disclosure on legal pages.
- Email verification before app access.
- 3-listing free trial, no card required.
- Verified email field is read-only with a clear "locked for security" reason.
- Real `mailto:support@listboost.uk` links from every relevant CTA.
- Privacy/terms with named processors (OpenAI, Stripe, Resend).
- Transactional success-page mentions "If email confirmations are enabled" rather than overpromising.

---

## 7. Mobile issues (target 375 px)

- **Hero `home-hero`** stacks at 1024 px (good) but the listing-card mock + browser chrome remains 100 % wide and visually overpowers the headline at 375 px.
- **Trust-row** wraps to 2–3 lines depending on font size; chips lose their pill rhythm.
- **App bottom nav** is label-only at 14 px text; tap targets are likely ~44 px tall but **no icons** make them slow to scan and tap.
- **Pricing-card "Most popular" ribbon** can overlap the Starter card's top edge in the stacked single-column layout.
- **Photo-empty mock** stacks below the step list on mobile but the dress silhouette is still ~55 % of the image card width — looks empty.
- **Demo-cta-strip** falls back to single-column at 768 px (good) but the h2 / CTA stacking on a true 375 px viewport produces a left-aligned tower that breaks rhythm.
- **Form field heights** look ≥ 44 px (good per § 2 `touch-target-size`).
- **Sticky generator panel** correctly disables sticky on mobile (good).
- **Verify-email card** fills the screen with two paragraphs and one button — feels minimal but undersells the importance of the action.
- **Toast region** sits bottom-right with a comfortable safe-area offset (good).

---

## 8. Navigation issues

- **Bottom nav (mobile) has 5 items: Dashboard, Generator, Photo, History, Billing.** § 9 `bottom-nav-limit` (≤ 5) is met but only because Account was moved out. The Account avatar lives in the header alongside Sign Out — which means on mobile, Account is reached by scrolling up to the header. Confusing.
- **No active-state animation on nav items.** § 9 `nav-state-active` is met (background fill on `is-active`) but it doesn't transition.
- **Public header on signed-in `/checkout/success`** still shows public marketing nav (`How it works / Example / Pricing` + "Open app" + "Sign out"). It works but the user is now an authenticated paying customer; offering them marketing nav feels off.
- **No breadcrumbs anywhere in the app** despite history → listing-detail → regenerate being a 2-level nested flow. § 9 `breadcrumb-web`.
- **Forward navigation animations are abrupt.** § 9 `navigation-direction` not respected.
- **Sign Out is repeated** in the header, the account page session card, and (on public pages with a session) the public nav-actions area.
- **`/admin` is reachable to anyone who finds the URL — gated by Basic Auth.** Fine for now, but a real admin login form would be more professional.
- **No "Back to dashboard" affordance from `/app/billing` after a Stripe portal external redirect.**

---

## 9. Pricing page issues

Beyond what's already in §4:

- **No value anchor.** Real SaaS pricing pages anchor on a value claim ("Save 8 hours / week for £14.99") above the cards. Here, the headline "Pick the plan that fits your listing volume" is logistical, not aspirational.
- **No annual-vs-monthly toggle** despite annual giving margin protection on a high-AI-cost product.
- **No "What counts as a listing?" affordance directly on the page** (it's in the FAQ at the bottom, where most users won't look).
- **No feature comparison matrix.** Three lists do not compare; a 7-row × 3-column grid does.
- **No money-back guarantee or refund language** above the fold.
- **Elite has 10 bullets including "Best for daily sellers" and "Built for serious resellers" — both are *positioning* not features.** Mixed bullet types (capabilities + positioning) reduce scannability.
- **The Subscribe-Elite button is `btn-secondary`** while Seller has `btn-primary`. That visually demotes Elite. A true premium tier earns a `btn-primary` (often charcoal) with its own emphasis.

---

## 10. App dashboard / generator issues

- **Dashboard shows 3 cards + welcome card + 4 feature tiles + recent activity.** That's seven primary chunks of content in the first viewport — heavy.
- **"Generate a listing" appears 3 times on the dashboard.** Welcome card CTA, Quick-action card CTA, and feature-tile "Notes to listing".
- **Generator's progress strip is good but the result reveal is jarring.** The skeleton is replaced with a fully-rendered output in one DOM swap. A staggered reveal (per § 7 `stagger-sequence`, 30–50 ms per card) would feel premium.
- **Result card hover is `translateY(-1px) + shadow`** — too subtle to notice.
- **No keyboard shortcuts to copy each section.**
- **No "regenerate this section only" — only full regenerate from history.**
- **No diff view / version history per item.**
- **No multi-language output toggle** (UK Vinted is multilingual: French sellers, Polish sellers).
- **Photo result cards do not show which photo influenced which inference** — a transparency miss for a vision model.

---

## 11. Design-system inconsistencies

Tracked in `public/styles.css`:

- **3 different "badge" styles** — `.badge` (default soft), `.badge.badge-brand` (teal pill), `.badge.badge-success` (green pill). No `.badge-warning` or `.badge-info` even though the warning style is used inline on the still-going progress note.
- **Eyebrow styling** is a pill (uppercase, teal-soft, 12 px) — great. But pages mix `.eyebrow` with `<span class="badge">` and `<p class="muted small">` for what are functionally the same element.
- **Card border-radius** varies: `.pricing-card` uses `var(--radius-lg)` (14 px) implicitly via the catch-all `.card`, `.success-card` uses 14 px, `.demo-step` uses `--radius-xl` (20 px), `.scaffold-preview` uses `--radius-xl`. § 4 `effects-match-style`.
- **Box-shadow scales:** `--shadow-sm`, `--shadow-md`, `--shadow-lg` are defined — but multiple cards override with bespoke `box-shadow: var(--shadow-lg), 0 24px 60px -22px ...` — six different shadow stacks observed. § 4 `elevation-consistent`.
- **Gradient stack:** at least four bespoke radial-gradients are applied to different surfaces (hero-preview, demo-generator-card, billing-summary-card, scaffold-preview, demo-step-input). No tokens for "branded surface gradient".
- **Icon weights:** Lucide-style 1.5px stroke is used in `iconSvg()`, but in some places the SVG appears at 18 px and at 24 px without a stable token.
- **Type scale** runs roughly 12 / 13 / 14 / 15 / 16 / 17 / 18 / 22 / 28 / 32 / 44 / 52 / 60 px across pages — too many sizes. § 6 `font-scale` recommends ~6 sizes max.
- **Two ways to express "muted text":** `.muted` and `color: var(--text-muted)` inline.
- **Two competing primary buttons:** `.btn-primary` and `.btn-primary.pricing-buy` (gradient-filled vs solid). They look similar enough to confuse, different enough to feel inconsistent.

---

## 12. Accessibility issues

Mapped to § 1:

- **Skip link** present and working ✓.
- **`:focus-visible`** present on all interactive elements ✓.
- **Form errors** announced via `aria-live="polite"` on per-field nodes ✓ — but no `aria-live` summary at form-level for screen readers.
- **Heading hierarchy** is mostly correct, but `app.html` skips from h1 (brand) to h3 (some nav contexts) without an h2.
- **Colour-only feedback** on the usage progress bar: it switches to accent colour at ≥ 90 % via `data-full="true"`, with no text or icon companion. § 1 `color-not-only`.
- **`alt=""` on logo `<img>`** is intentional (decorative; brand text follows) — acceptable.
- **`prefers-reduced-motion`** respected for shimmer and result fade-up, but **not for `.progress-strip .progress-dot { animation: lb-pulse }`** — that pulse runs in reduced-motion too. Same for `.success-dot` glow.
- **Touch targets** ≥ 44 px on buttons (good). But the FAQ disclosure `<button>`s in pricing are just text in a `<button>` with no padding declared explicitly — likely under 44 px on mobile.
- **`aria-controls`** wired on the public nav toggle ✓.
- **Chart-style usage-bar** has no `aria-valuenow` / `aria-valuemax` / `role="progressbar"`. Screen readers see a styled span with no semantic.
- **No "Skip to content" announcement after route change** in the SPA-style app navigation.
- **Live regions:** the toast region uses `aria-live="polite"` ✓.
- **Modal escape:** the paywall modal has `data-close-paywall` and clicks the backdrop, but no Escape-key handler in the listener.

---

## 13. Conversion issues

- **Homepage hero CTA is "Start with 3 free listings"** — works, but the secondary "Try the demo" steals primary attention via its prominent btn-secondary placement next to the primary. A demo link in the hero should be a text link, not a button.
- **No urgency, no scarcity, no offer.** No "Launch month: 25% off Seller", no "First 100 sellers", no "Save £20/year on annual".
- **Demo result does not auto-promote signup.** A user can see the full premium output and then leave with no friction.
- **Pricing → Stripe Checkout is one-click.** Good. But there is no "Try Seller free for 7 days" trial — for a £14.99 plan, a 7-day no-card trial is cheap insurance and lifts conversion.
- **Sign-up form has no benefit reminder above the fields.** A user who clicked "Subscribe Seller" then has to enter name/email/password with no plan recap. Per § 8 `progressive-disclosure`, the cart should follow the user.
- **Verify-email screen is the highest-drop-off step in any SaaS.** Yet the page is the smallest, plainest in the app (1.4 KB). No "Resend in X seconds" countdown UI is shown by default; no "Wrong email? Sign out and try again" affordance is well-positioned.
- **No reactivation flow** for users whose subscription cancelled.
- **No referral.** "Invite a Vinted-seller friend, get a month free" would be free growth.
- **Paywall modal is good but does not show "you've created N listings".** Actually it does, but it does not show the time-to-reset ("renews in 6 days") which is the most-conversion-driving piece of context.

---

## 14. 10/10 SaaS UI roadmap

### P0 — before launch (must)

1. **Pricing card hierarchy fix.** Make price the hero (44 px), limit a chip below ("75 listings/month"). Promote Elite's CTA to `btn-primary` (charcoal/dark variant).
2. **Editable output cards** in `/app/notes` and `/app/photo`. Even a `contenteditable="true"` on title and description with a "Saved" toast on blur would close the single biggest UX gap.
3. **Add `autocomplete="new-password"` on signup password input** (split auth.html into signup/login templates or branch in JS).
4. **Add `prefers-reduced-motion` guards** on `.progress-strip .progress-dot { animation: lb-pulse }` and `.success-dot`.
5. **Dedupe pricing surfaces.** Remove the homepage pricing teaser duplication; have one canonical pricing page and a CTA card on home.
6. **Fix the Open app + Sign out + Public nav clash on `/checkout/success`.** Show only the page-level CTAs (already there) and a minimal logo + Account link in the header.
7. **`/app/score` and `/app/replies` are exposed routes.** Either hide them completely from this release, or gate them with a clear "Available on Seller" upsell card.
8. **Photo previews after upload.** A grid of 4 thumbnails before Generate.
9. **Verify-email page upgrade** — match the success-page polish (real status pill, real action, real reassurance, real "Wrong email?" affordance).
10. **Add `role="progressbar"` and `aria-valuenow` to the billing usage bar.**

### P1 — before public marketing (should)

11. **Real social proof.** 3–5 verified UK Vinted-seller testimonials with first name, city, and seller-score. A "trusted by X UK sellers" counter once it's true.
12. **Annual billing toggle** on `/pricing` with a "Save 2 months" badge.
13. **Comparison table** on `/pricing` (rows: listings/month, generator, photo, replies, score, price guide, history, templates, support tier, early access).
14. **Branded 404 / 500.**
15. **Stripe in-app billing summary** ("Visa •• 4242 · Next charge £14.99 on 5 June 2026") on `/app/billing`.
16. **First-run tour** (3-step onboarding overlay on `/app` after verify) — uses the existing scaffold preview style.
17. **Keyboard shortcuts**: Cmd-Enter to generate, Cmd-C on focused result card to copy.
18. **Result-card stagger reveal** (30–50 ms each).
19. **Sign-up form keeps the chosen plan in context** — "You're signing up for Seller (£14.99/mo)".
20. **Real comparison images / SVG flat-lays** for Zara dress, Nike trainers, kids bundle, handbag, coat. Replace the CSS-shape silhouettes with hand-styled SVG.
21. **Brand voice pass.** Replace "Subscribe Starter" / "Subscribe Seller" with one consistent verb ("Get Seller", "Choose Seller", or "Start Seller plan"). Pick one and use it everywhere.
22. **Logo + wordmark refinement.** A 6-letter "ListBoost" wordmark with a custom L-cap and a single brand-defining tweak (e.g. the o is a Vinted-style price tag).
23. **Empty-state language consistency.** One sentence pattern: "Your [thing] will appear here. {What you'll get}."
24. **Result fade-up animation gated behind reduced-motion** ✓ (already done) — but the result panel itself should `aria-live="polite"` announce "Listing ready" once.
25. **Mobile bottom-nav glyphs.** Add 5 icons aligned with `nav-label-icon`.

### P2 — after first users (could)

26. **Editable per-section regenerate.** "Regenerate just the title" / "Generate 2 more buyer-reply variants".
27. **Diff view** on regenerate ("Title changed from X to Y").
28. **Multi-language output** for non-UK Vinted markets.
29. **Bulk listing CSV upload** for Elite tier (currently advertised as "Built for serious resellers" without a real bulk feature — fulfil it).
30. **Stripe customer portal embedded** instead of hosted redirect.
31. **Referral program**: "Invite a Vinted-seller friend, get £5 off next month".
32. **In-app receipt download.**
33. **Account avatar upload + display name** (UI-only, no backend hold-up — store in `users.name`).
34. **Live "Generated this month: N listings, fastest at Xs"** stat on the dashboard.
35. **"Hot phrases" panel** — keywords trending on Vinted UK that week, optional add to the prompt.
36. **Theme accents.** Let Elite users pick a brand accent (subtle, not garish).
37. **API access for Elite.** Even a generate-by-curl key would justify the £29.99 price for a power-seller.

---

## 15. Exact recommended fixes with likely files affected

| # | Fix | Files |
|---|---|---|
| 1 | Pricing-card price hero + Elite primary CTA | [public/index.html](../public/index.html), [public/pricing.html](../public/pricing.html), [public/site.js](../public/site.js) `pricingCardTemplate`, [public/styles.css](../public/styles.css) `.pricing-price` / `.pricing-buy` |
| 2 | Editable output sections | [public/site.js](../public/site.js) `outputTemplate`, `outputSection`, plus `/api/account/profile`-style PATCH route in `server.js` if you want server-side persistence |
| 3 | `autocomplete="new-password"` on signup | [public/auth.html](../public/auth.html), [public/site.js](../public/site.js) `installAuthMode` |
| 4 | Reduced-motion guards on pulse/glow | [public/styles.css](../public/styles.css) (`.progress-strip .progress-dot`, `.success-dot`) |
| 5 | Remove duplicate pricing teaser on homepage | [public/index.html](../public/index.html) `#pricing` section |
| 6 | Trim public header on `/checkout/success` | [public/site.js](../public/site.js) `installPublicShell` (remove `/checkout/success` from `isPublic` list, or render a slimmer variant) |
| 7 | Gate `/app/score` and `/app/replies` | [public/site.js](../public/site.js) `appRouteName`, [server.js](../server.js) `prettyRoutes` |
| 8 | Photo upload thumbnails | [public/site.js](../public/site.js) `installAppTools` (`photoRouteForm`) |
| 9 | Verify-email page upgrade | [public/verify-email.html](../public/verify-email.html), [public/site.js](../public/site.js) (resend-cooldown UI), [public/styles.css](../public/styles.css) (verify-banner styles) |
| 10 | `role="progressbar"` on `.billing-usage-bar` | [public/site.js](../public/site.js) `billingRouteTemplate`, `loadBilling` (set `aria-valuenow`) |
| 11 | Real testimonials section | [public/index.html](../public/index.html) (new section), [public/styles.css](../public/styles.css) |
| 12 | Annual billing toggle | [server.js](../server.js) `subscriptionPlans` (`yearlyPricePence` per plan, `STRIPE_PRICE_*_YEARLY` envs), `createSubscriptionCheckoutSession`, [public/site.js](../public/site.js) `pricingCardTemplate` |
| 13 | Comparison table | [public/pricing.html](../public/pricing.html), [public/styles.css](../public/styles.css) |
| 14 | Branded 404/500 | [public/404.html](../public/404.html) (already partial), new `public/500.html` |
| 15 | Stripe in-app billing summary | [server.js](../server.js) `handleBilling` (pull `subscription.latest_invoice` + `default_payment_method`), [public/site.js](../public/site.js) `loadBilling` |
| 16 | First-run tour | [public/site.js](../public/site.js) (new `installOnboardingTour`), [public/styles.css](../public/styles.css) |
| 17 | Keyboard shortcuts | [public/site.js](../public/site.js) `installAppTools` |
| 18 | Stagger reveal | [public/site.js](../public/site.js) `outputTemplate` (apply incremental `--lb-stagger` CSS var per card), [public/styles.css](../public/styles.css) |
| 19 | Plan-context on signup | [public/auth.html](../public/auth.html), [public/site.js](../public/site.js) `installAuthMode` (read `?plan=` query) |
| 20 | Real seller SVG flat-lays | [public/site.js](../public/site.js) `seller-card-art`, [public/styles.css](../public/styles.css) `.seller-art-*` |
| 21 | Brand-voice button-label pass | [public/site.js](../public/site.js) (every `Subscribe X`), [public/index.html](../public/index.html), [public/pricing.html](../public/pricing.html) |
| 22 | Logo + wordmark | `public/logo.svg`, [public/styles.css](../public/styles.css) `.lb-brand` |
| 23 | Empty-state copy unify | [public/site.js](../public/site.js) `emptyStateTemplate`, `scaffoldPreviewTemplate`, `photoStepsTemplate` |
| 24 | `aria-live` on result panel | [public/site.js](../public/site.js) (set `out.setAttribute("aria-live", "polite")`) |
| 25 | Mobile nav glyphs | [public/app.html](../public/app.html) `.app-nav` |

---

## Final word

The product works. The plumbing is solid. But the surface still reads as "a competent SaaS template" and not as "the only listing tool a UK Vinted seller would ever want". The list above is exactly the gap. P0 closes the worst bleeds and is achievable in a few focused days. P1 + P2 is where 6/10 becomes 9/10.
