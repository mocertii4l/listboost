# AGENT_HANDOFF.md

> Living handoff between Claude (senior PM/QA/reviewer) and Codex (implementer).
> Inspection date: 2026-05-11. Branch: `homepage-premium-polish`. Working tree: in-progress polish.

---

## -2. Codex Implementation Pass - 2026-05-12

### Files Changed

- `scripts/fetch-homepage-images.js`: removed unused `mirror-outfit` and `football-shirt` manifest entries, switched all remaining homepage image sources to optimized `images.unsplash.com` URLs, and added `--force` refetch support.
- `public/images/homepage/*.jpg`: refetched remaining homepage images with stable filenames and much smaller byte sizes.
- `public/auth.html`, `public/privacy.html`, `public/support.html`, `public/terms.html`: neutralized stale meta-description wording from Vinted-specific listing phrases to resale listing/support wording.
- `public/site.js`: changed fallback pricing-card copy from "Vinted listing tools" to "resale listing tools".
- `AGENT_HANDOFF.md`: added this pass summary.

### Images Removed

- `public/images/homepage/mirror-outfit.jpg` - unused; removed.
- `public/images/homepage/football-shirt.jpg` - unused; removed.

Search check: `rg -n "mirror-outfit|football-shirt" public scripts` returns no live/script references after the manifest cleanup.

### Final Homepage Image Sizes

Total homepage image folder: 13 JPGs, 1.41 MB.

| File | Size |
|---|---:|
| `adidas-sambas.jpg` | 124.1 KB |
| `cargo-trousers.jpg` | 91.1 KB |
| `carhartt-hoodie.jpg` | 187.1 KB |
| `doc-martens-boots.jpg` | 107.8 KB |
| `leather-bag.jpg` | 109.9 KB |
| `levis-jeans.jpg` | 168.3 KB |
| `nike-trainers.jpg` | 63.0 KB |
| `north-face-puffer.jpg` | 69.1 KB |
| `silver-necklace.jpg` | 48.3 KB |
| `summer-dress.jpg` | 82.7 KB |
| `wardrobe-rail.jpg` | 118.4 KB |
| `white-trainers-floor.jpg` | 87.1 KB |
| `zara-jacket.jpg` | 186.2 KB |

All homepage JPGs are below the 250 KB target.

### Meta Descriptions Updated

- `public/auth.html`
- `public/privacy.html`
- `public/support.html`
- `public/terms.html`

`public/example.html` already had Claude's resale wording. `verify-email.html`, `forgot-password.html`, and `reset-password.html` were already neutral. Intentional body/legal copy such as "independent from Vinted" was left unchanged.

### Commands Run And Results

- `git status --short` - reviewed dirty Pass 1 worktree before changing files.
- `Get-Process -Id 37072` / `Get-NetTCPConnection -LocalPort 3001` - confirmed ListingBoost dev server was running.
- `Stop-Process -Id 37072` - stopped the Pass 1 dev server; port 3001 no longer listened.
- `rg -n "mirror-outfit|football-shirt" .` - confirmed unused image names were only in handoff/script, not live UI.
- `Remove-Item public/images/homepage/mirror-outfit.jpg, public/images/homepage/football-shirt.jpg` - removed unused files.
- `npm run fetch:homepage-images -- --force` - refetched 13 optimized homepage images successfully.
- Homepage image size check - all images below 250 KB; folder total 1.41 MB.
- Stale phrase search for `Vinted listing output|Vinted seller notes|Vinted dashboard|Vinted listing packages|Vinted listing tools|UK Vinted seller listing generation` in `public/` - no matches after cleanup.
- `npm run check` - passed, 98 tests.
- Temporary smoke server on `PORT=3001` - `/`, `/pricing`, key homepage images, `/robots.txt`, `/sitemap.xml` all returned 200 with expected MIME types and compressed image byte sizes.
- `Stop-Process` for temporary smoke server - stopped; port 3001 no longer listened.
- `git commit -m "feat(home): premium homepage polish, Tailwind build, demo cap, compressed images"` - created commit `7376600`.
- `npx update-browserslist-db@latest` - completed but produced no package/lockfile diff; no Browserslist commit was created.
- `npm ls caniuse-lite` - reports no installed top-level/dependency entry in this repo.
- `npm run build` after the Browserslist update - passed, but the same Browserslist freshness warning still appears.

### Commit Hashes Created

- `7376600` - `feat(home): premium homepage polish, Tailwind build, demo cap, compressed images`
- Browserslist update commit: not created because `npx update-browserslist-db@latest` left no git diff to commit.

### Remaining Blockers

- Browserslist/caniuse-lite warning still appears after `npx update-browserslist-db@latest`; the command reports success but leaves no package/lockfile change. Claude should decide whether to add an explicit Browserslist/caniuse-lite dependency, ignore the warning, or handle it in CI config.
- Production-only blockers remain: Railway env, `/data` volume, Stripe live prices/webhook, Resend domain, DNS/TLS, and real checkout/webhook smoke.
- Full browser visual QA still needs Claude/browser pass; this pass used HTTP smoke plus contract tests.

### Exact Review Prompt For Claude Code

Review the latest two commits on `homepage-premium-polish`. Verify that homepage image assets are launch-ready by checking `public/images/homepage` sizes and total folder weight, and confirm the unused `mirror-outfit.jpg` and `football-shirt.jpg` files and manifest entries are gone. Verify stale meta-description wording has been replaced with resale wording on `auth.html`, `privacy.html`, `support.html`, `terms.html`, and `example.html`, while intentional "independent from Vinted" positioning remains. Run `npm run check`. Confirm whether the branch is ready for PR to `main`, and update `AGENT_HANDOFF.md` with any remaining blockers.

---

## -1. Claude Review Pass - 2026-05-11 (after Codex's Pass 1)

### Verdict

✅ **Codex's pass landed cleanly. 98 tests pass, build clean, no regressions, all in-scope items addressed.**
🟡 One **launch-blocking performance issue** found in this review (heavy homepage images), plus two small follow-ups. **Not a code blocker — purely image-asset and copy hygiene.**

### What Codex did well

- Added `npm run build` aliasing `build:css`, so a conventional Node deploy pipeline can compile the homepage CSS without custom config. Small change, big deploy-readiness win.
- Added `.txt` and `.xml` MIME types in [server.js:638-639](server.js#L638-L639) and pinned them with a regression test ([tests/system-contract.test.js:40-43](tests/system-contract.test.js#L40-L43)). Verified live: `/robots.txt` → `text/plain; charset=utf-8`, `/sitemap.xml` → `application/xml; charset=utf-8`. Before this fix, crawlers would have ignored both files.
- Rewrote README.md to reflect the active subscription model: pricing, Stripe price-env vars, all four required webhook events (`checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`), Railway env block, final-checks list. The README was the most-likely-to-mislead-operator file in the repo, and is now accurate.
- Removed retired credit-pack examples from `.env.example` so the file no longer conflicts with the live `SUBSCRIPTION_PLANS_JSON` source of truth.
- Updated test assertions in lockstep with the homepage rebuild (97 → 98 tests). The new test set asserts the actual surface (`market-listing-card` × 12, hero phrasing, anchors), not the old gallery shape — clean refactor, no skipped tests.

### Problems found in this review

1. **🔴 Homepage images are too heavy for launch.** Combined ≈ 8 MB across `public/images/homepage/`. Worst offenders:
   - `mirror-outfit.jpg` — **2.4 MB** — **unused on the homepage** (only referenced in `scripts/fetch-homepage-images.js`).
   - `nike-trainers.jpg` — **1.5 MB** — referenced **4×** on the homepage (gallery card, "how it works" step 3, dashboard preview, upload lane thumbnail). Even at `width="220"` thumbnail use, the full 1.5 MB is shipped.
   - `adidas-sambas.jpg` — 772 KB, referenced 4×.
   - `carhartt-hoodie.jpg` — 436 KB.
   - `zara-jacket.jpg` — 428 KB — hero image, eager-loaded (LCP candidate).
   - `football-shirt.jpg` — 311 KB — **unused on the homepage**.
   This is **not a code bug**, but on UK mobile (likely target audience for resale sellers) this will tank LCP / mobile data. **Fix before launch.**
2. **🟢 Meta-description copy on smaller pages still says "Vinted listing output" / "Vinted seller notes".** Codex updated index.html, pricing.html, and site.js to "resale", but `example.html`, `auth.html`, `privacy.html`, `support.html`, `terms.html` still have legacy "Vinted" wording in some places. **Important nuance**: many of those uses are *intentional* ("ListBoost is independent from Vinted", "not affiliated with Vinted") and should stay. Only the marketing-positioning meta descriptions should align with the homepage.
3. **🟢 Two unused images in the fetched set.** `mirror-outfit.jpg` (2.4 MB) and `football-shirt.jpg` (311 KB) aren't referenced in `public/index.html` or anywhere else. They're currently untracked working-tree files — if committed, they bloat the repo by ~2.7 MB for zero user benefit.
4. **🟡 Codex left a dev server running on `localhost:3001` (PID 37072).** Confirmed reachable. Not a launch blocker but should be stopped before committing/pushing to avoid file-lock surprises with the SQLite DB on a redeploy.

### Fixes Claude made in this pass

- `public/example.html`: updated `<meta name="description">` and `<meta property="og:description">` to use "resale" instead of "Vinted listing output" / "Vinted seller notes", matching the homepage. **Single localized edit, 2 lines, 98/98 tests still pass.** Other "Vinted" mentions on `auth.html`, `privacy.html`, `support.html`, `terms.html` were **left untouched on purpose** — most are intentional brand-positioning ("independent from Vinted"). Codex should sweep them by hand, not by find-and-replace.

### Checks re-run after the review

- `git status` ✓
- `git diff HEAD --stat` ✓
- `npm run check` ✓ (98 tests pass, all 4 JS files syntax-clean)
- `npm run build` ✓ (Browserslist warning only)
- Live smoke against running server at `http://localhost:3001`:
  - `GET /` → 200
  - `GET /robots.txt` → 200 `text/plain; charset=utf-8`
  - `GET /sitemap.xml` → 200 `application/xml; charset=utf-8`
  - `GET /images/homepage/nike-trainers.jpg` → 200 `image/jpeg`, 1,546,228 bytes (confirms the size issue above)
  - `GET /app` (anon) → 302 (correct gate to `/login`)

### Correction to my own earlier handoff

- I had instructed Codex to `git rm --cached server.out.log server.err.log`. **That instruction was wrong.** Those files are **not tracked** (`git ls-files server.out.log server.err.log` returns nothing). They're already correctly ignored by `.gitignore` and exist only as local runtime logs. **Codex correctly skipped this step.** Removing this from the open instructions.

### Next exact task for Codex (do this before committing the working tree)

**Task: Compress homepage images and drop two unused files.**

1. Delete the two unused files (they're untracked, so this is just `rm`):
   ```bash
   rm public/images/homepage/mirror-outfit.jpg
   rm public/images/homepage/football-shirt.jpg
   ```
   Confirm with `grep -r "mirror-outfit\|football-shirt" public/ scripts/` that the only remaining reference is in `scripts/fetch-homepage-images.js`. Then **also remove those two entries from the manifest** in [scripts/fetch-homepage-images.js](scripts/fetch-homepage-images.js) so a future `npm run fetch:homepage-images` doesn't re-download them.

2. Compress the remaining 13 homepage JPGs to a target width of 1200 px and quality 80-82. Easiest path: edit `scripts/fetch-homepage-images.js` to re-fetch with `&w=1200&q=80` (most URLs already use Unsplash's `?auto=format&fit=crop&w=1200&q=82` — those are fine; the heavy ones come from the `unsplash.com/photos/.../download?force=true&w=1200` URLs which **do not honour the `w` parameter** and return a multi-megabyte original). For those, switch the URL form to the `images.unsplash.com/photo-{id}?auto=format&fit=crop&w=1200&q=82` form (look up each photo ID from the existing URL).

   Target: every file in `public/images/homepage/` should be ≤ 250 KB. Total folder ≤ 3 MB. Do not commit a file > 500 KB unless you have a specific reason.

3. After compression: open `http://localhost:3001/` (Codex's running server, PID 37072) and confirm the homepage still renders correctly. Then stop the dev server before committing (`kill 37072` or close the terminal).

4. Run `npm run check` (must pass).

5. Sweep meta descriptions on the smaller HTML pages for "Vinted listing" / "Vinted seller notes" / "Vinted dashboard" wording in `<meta name="description">` and `<meta property="og:description">` only. **Leave intentional brand-positioning copy** ("independent from Vinted", "not affiliated with Vinted") **alone.** Specifically check: `public/auth.html`, `public/privacy.html`, `public/support.html`, `public/terms.html`, `public/verify-email.html`, `public/forgot-password.html`, `public/reset-password.html`.

6. Commit the working tree as **one** focused commit:
   ```
   feat(home): premium homepage polish, Tailwind build, demo cap, compressed images
   ```
   Include: `package.json`, `package-lock.json`, `.env.example`, `README.md`, `server.js`, `public/index.html`, `public/pricing.html`, `public/example.html` (Claude's meta-desc fix), `public/site.js`, `public/styles-linear.css`, `public/images/homepage/`, `src/styles-linear.css`, `scripts/fetch-homepage-images.js`, `tailwind.config.cjs`, `tests/system-contract.test.js`, `tests/ui-contract.test.js`, `AGENT_HANDOFF.md`. **Verify `npm run check` once more after staging, before commit.**

7. Run `npx update-browserslist-db@latest` and commit the lockfile bump as a separate small commit.

After those two commits land, the branch is ready for PR to `main` and the launch sequence in [LAUNCH_REDESIGN.md](LAUNCH_REDESIGN.md) can begin.

---

## 0. Codex Implementation Update - 2026-05-11

### Top 3 Launch-Blocking Tasks Identified

1. Standard deploy/build command was missing. The project had `build:css`, but no `npm run build`, so a conventional Node deploy/build step would not compile the served homepage CSS.
2. SEO root files were served as `application/octet-stream`. `/robots.txt` and `/sitemap.xml` existed, but the server MIME map did not include `.txt` or `.xml`.
3. Launch docs/env example still described retired credit-pack setup instead of the active monthly subscription model, which could lead to wrong Railway/Stripe configuration.

### Files Changed In This Codex Pass

- `package.json`: added `build` script that runs the Tailwind CSS build.
- `.env.example`: removed public credit-pack env examples and clarified Stripe is subscription checkout.
- `README.md`: updated pricing, Stripe price env vars, webhook events, Railway env, final checks and launch checklist for monthly subscriptions.
- `server.js`: added `.txt` and `.xml` MIME types.
- `tests/system-contract.test.js`: added a regression contract for crawler-friendly MIME types.
- `public/styles-linear.css`: regenerated via `npm run build`.
- `AGENT_HANDOFF.md`: updated with this implementation summary.

### What Was Fixed

- `npm run build` now works and produces `public/styles-linear.css`.
- `/robots.txt` now serves as `text/plain; charset=utf-8`.
- `/sitemap.xml` now serves as `application/xml; charset=utf-8`.
- Subscription setup docs now match the live product surface: Starter/Seller/Elite monthly plans and required Stripe subscription webhook events.

### Commands Run

- `git status --short` - dirty worktree existed before Codex changes; preserved existing work.
- `npm run check` - passed before edits, 97 tests.
- `npm run build:css` - passed; Browserslist/caniuse-lite freshness warning only.
- `npx --no-install playwright --version` - failed because Playwright is not installed locally.
- Browser plugin discovery - Browser plugin is present, but the required Node browser-control tool was not exposed; used HTTP smoke fallback.
- `npm run build` - passed after adding the build script; Browserslist warning only.
- `npm run check` - passed after final changes, 98 tests.
- `git diff --check` - passed; line-ending warnings only.
- HTTP smoke on updated server at `http://localhost:3001`: `/`, `/pricing`, `/robots.txt`, `/sitemap.xml`, `/styles-linear.css`, and homepage image asset all returned 200 with expected MIME types.

### Remaining Issues / Risks

- `caniuse-lite` is outdated; run `npx update-browserslist-db@latest` when ready for a maintenance lockfile change.
- Visual browser QA was not completed because the in-app Browser runtime was unavailable and Playwright is not installed. I validated via HTTP smoke, build and tests instead.
- Port `3000` is held by a pre-existing Node process from 2026-05-09, so updated local smoke used `PORT=3001`. Updated dev server is currently running at `http://localhost:3001` (PID 37072).
- Existing dirty homepage/pricing/Tailwind/image changes appear to be prior collaborator work and were not reverted.

### Suggested Next Task For Claude Review

Review the focused launch-readiness diff first: `package.json`, `.env.example`, `README.md`, `server.js`, and `tests/system-contract.test.js`. Then do a visual/mobile pass of the already-built homepage on `http://localhost:3001`, because this Codex pass could not use browser screenshot tooling.

---

## 1. Project Summary

**ListBoost** is a UK-focused AI assistant for resale-marketplace sellers (positioned around Vinted but explicitly independent). It turns rough seller notes or item photos into a copy-ready listing package: title, description, keywords, photo checklist, price guidance, listing score, and buyer reply. Sellers copy the output and post manually — ListBoost never connects to a marketplace account.

Monetisation: monthly Stripe subscriptions (Starter £6.99 / Seller £14.99 / Elite £29.99). Free tier = 3 listings. Anonymous live demo capped at 3/day.

The codebase is **not** a SPA framework — it's a vanilla Node HTTP server (`server.js`, ~5200 lines) serving static HTML pages from `public/` plus JSON APIs. The "app shell" (`/app/*`) is one HTML file (`public/app.html`) with client-side routing in `public/site.js`.

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js ≥ 20 (currently v24.11.0 locally), ESM (`"type": "module"`) |
| HTTP | `node:http` — raw `createServer`, no Express |
| DB | SQLite via `better-sqlite3`, file at `<DATA_DIR>/listboost.db` |
| AI | OpenAI SDK (primary), Anthropic SDK (fallback). Demo mode when no key set. |
| Payments | Stripe Checkout + webhook (`/api/stripe-webhook`) |
| Auth | Email/password (PBKDF2), HTTP-only session cookies, optional Google + Microsoft OAuth |
| Email | Resend (verification + reset). Mock mode when no key. |
| Styling | Hand-written CSS (`styles.css`, `styles-v3.css`, `styles-app-v3.css`) + Tailwind compiled to `styles-linear.css` (premium homepage layer only) |
| Build | `npm run build:css` runs Tailwind. No bundler — JS is plain ESM modules loaded via `<script type="module">`. |
| Tests | `node --test tests/*.test.js` — contract-style DOM/system tests, **97 passing**. |
| Deploy | Railway (`railway.json`), Node detected via Nixpacks, health probe at `/health`, persistent volume required at `/data`. |
| Package manager | **npm** (single `package-lock.json`, no yarn/pnpm lock). |

### Routes (resolved via `prettyRoutes` map in [server.js:3703-3727](server.js#L3703-L3727))

Public: `/`, `/example`, `/pricing`, `/support`, `/signup`, `/login`, `/verify-email`, `/forgot-password`, `/reset-password`, `/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml`.
App (gated; redirects to `/login` if signed out, `/verify-email` if unverified): `/app`, `/app/notes`, `/app/photo`, `/app/score`, `/app/replies`, `/app/history`, `/app/billing`, `/app/account`.
Checkout: `/checkout/success`, `/checkout/cancel`.
OAuth: `/auth/google`, `/auth/google/callback`, `/auth/microsoft`, `/auth/microsoft/callback`.
APIs: signup/login/logout, verify, generate, demo-generate, generate-from-photos, me, history, billing, create-checkout-session, create-subscription-checkout-session, create-billing-portal-session, stripe-webhook, admin/credits, account/profile, account/password, forgot/reset-password.
Host redirect: `listboost.uk` → `https://www.listboost.uk` at the server level.

---

## 3. What Appears Already Completed

- **All 97 tests pass** (`npm test` clean).
- All 4 JS files pass `node --check`.
- `npm run build:css` runs cleanly (Tailwind 3.4.17, ~451ms).
- Homepage (`public/index.html`) is fully rebuilt: hero, workflow strip, value cards, feature-story grid, listing gallery, before/after, device showcase, dashboard mock, pricing teaser, FAQ, final CTA. SEO meta (title, description, canonical, OG, JSON-LD SoftwareApplication) present. Skip-link, `aria-live` toast region, lazy/decoded images with width/height to prevent CLS.
- Pricing page rebuilt with three subscription tiers, FAQ, and CTA. Cards have a shared single source of truth (`PRICING_CATALOGUE` in [site.js:222](public/site.js#L222) — verified by the `static pricing HTML cannot drift from the catalogue copy` test).
- Auth pages (signup/login/verify/forgot/reset) styled, with Google OAuth visible and Microsoft hidden as intended.
- Email verification flow (single-use tokens, dev console fallback when Resend is absent).
- Stripe subscription checkout + webhook handling (idempotent — verified by the `duplicate checkout.session.completed` test).
- Plan entitlement gating: `/app/photo`, `/app/score`, `/app/replies`, `/app/history` redirect to `/app/billing?locked=…` if the user's plan doesn't allow that feature ([server.js:3744-3754](server.js#L3744-L3754)).
- `/health` endpoint reports `productionReady`, lists missing env keys, and exposes `dataDir`.
- 404 page styled. 500 page minified single-line but functional.
- Admin page (`/admin`) behind HTTP Basic Auth.
- Robots + sitemap present and pointed at `www.listboost.uk`.
- Mobile sticky CTA on `/example`, mobile app nav with inline SVG icons (verified by `mobile app nav uses inline SVG icons + visible labels` test).
- Dark/light theme toggle wired with `prefers-color-scheme` fallback + localStorage persistence ([site.js:38-68](public/site.js#L38-L68)).
- Demo limiter (3/day) with usage state passed back via `data.demoUsage` ([site.js:2352-2385](public/site.js#L2352-L2385)).
- Pointer-aware "linear spotlight" background effect on the homepage (`installLinearSpotlight`) — respects `prefers-reduced-motion`.

### Codex's in-flight work (uncommitted)

```
M package.json           +Tailwind build script, +fetch:homepage-images script, +tailwindcss devDep
M package-lock.json      lock for tailwind
M public/index.html      465↑ lines — premium homepage rebuild
M public/pricing.html    "Vinted" → "resale" copy polish
M public/site.js         +66 lines — new public nav, dark toggle on marketing, demo limiter, more icons
M tests/system-contract.test.js  +108/-? — coverage for the new structure
M tests/ui-contract.test.js     +26/-? — coverage for the new structure
?? public/images/homepage/      16 product photos for the homepage
?? public/styles-linear.css     compiled Tailwind output (~76KB minified)
?? scripts/fetch-homepage-images.js  helper to refetch Unsplash sources
?? src/styles-linear.css        Tailwind input source
?? tailwind.config.cjs          Tailwind config
```

Tests in this state still pass. Build still passes. The branch is **ready for commit** once the polish items below are reviewed.

---

## 4. Launch Blockers

Severity: 🔴 must fix before public launch · 🟡 fix before money flows · 🟢 polish

### 🔴 Blockers

1. **No production env file is checked into Railway yet.** The README and `LAUNCH_REDESIGN.md` document what's needed; the actual Railway env must be set per `LAUNCH_REDESIGN.md` §"Railway Preview Environment" / README §"Deploy to Railway". Hit `/health` after deploy and assert `productionReady: true` and `missing: []`.
2. **Stripe live products + webhook signing secret** not yet attached in production (per `LAUNCH_REDESIGN.md` — current code uses inline Checkout prices from `CREDIT_PACKS_JSON` / `SUBSCRIPTION_PLANS_JSON`, which is acceptable but requires the live secret).
3. **Persistent volume mounted at `/data`** on Railway with `DATA_DIR=/data`. Without it, every redeploy wipes signups/credits (README §"Database" / §"Deploy to Railway" step 3).
4. **DNS for `listboost.uk` + `www.listboost.uk`** — code already redirects apex → www; verify the Railway custom-domain step is complete and TLS is issued.

### 🟡 Pre-Money Blockers

5. **Real-card webhook end-to-end test** in production not yet run. The integration test `subscription checkout starts monthly billing and webhook resets usage on renewal` covers the happy path, but a real Stripe webhook arriving at the live URL has to be confirmed manually post-deploy.
6. **Resend domain verification** for `verify@listboost.uk` is documented but must be confirmed live (otherwise verification emails won't arrive and signups stall).
7. **OAuth callback URLs** for Google/Microsoft must be registered against `https://www.listboost.uk/auth/google/callback` etc. (`.env.example` lists them).
8. **Browserslist is outdated.** `caniuse-lite` warned during `npm run build:css`. Not a blocker but should be refreshed (`npx update-browserslist-db@latest`).

### 🟢 Polish (see §6)

---

## 5. Bugs / Broken Areas

### Confirmed

- **Browserslist warning** during `npm run build:css`. Cosmetic only.
- **Inconsistent stylesheet linking across pages.** `index.html` loads three stylesheets (`/styles.css`, `/styles-v3.css`, `/styles-linear.css`), but `pricing.html`, `auth.html`, `example.html` only load `/styles.css` + `/styles-v3.css`. `app.html` loads `/styles.css` + `/styles-app-v3.css`. Confirm this is intentional — `/styles-linear.css` is the premium homepage theme. If any class from it is referenced on other pages it will look wrong. (Likely intentional; flag for verification only.)
- **Logged dev verification link in committed `server.out.log`.** The file `server.out.log` contains a real-looking dev verification token URL. The repo `.gitignore` excludes `*.log` and `server.err.log` but the file is already committed. Should be untracked: `git rm --cached server.out.log server.err.log` (do not delete; just untrack). **Stop before doing this — verify these files don't contain anything we want to preserve.**
- **`server.js` is 161KB / ~5200 lines in a single file.** Not a bug, but a long-term maintainability blocker. Do not refactor for launch; flag for post-launch.

### Risks worth a manual sweep

- **OAuth state handling**: confirm `/auth/google/callback` flow rejects mismatched/expired state. (Test `forgot and reset password flow is token based and single use` covers tokens; no explicit OAuth-state test was found in the suite.)
- **Stripe webhook idempotency keys**: covered by a test for `duplicate checkout.session.completed`. Manually verify `invoice.paid` renewal idempotency in live.
- **Photo upload size enforcement**: client-side `MAX_PHOTO_BYTES = 1_400_000`. Server-side limit should also be enforced — confirm in `handleGenerateFromPhotos` before launch (not verified during this pass; do not assume).
- **`data-page="marketing-v3"`** appears on `auth.html`, `example.html`, `pricing.html`, but only `index.html` adds the `linear-premium` class. The "spotlight" pointer effect is correctly gated to only fire on the homepage ([site.js:706-720](public/site.js#L706)) so this is OK, but copy/paste authors of new pages should know.

---

## 6. Missing Polish Items

### Marketing pages

- The pricing page (`public/pricing.html`) has inline `style="..."` attributes for layout (centred hero). Tolerable, but ideally replaced with a class. **Do not change** unless touching pricing for another reason.
- `/example` page has heavy inline styles inside the empty state ([example.html:75-87](public/example.html#L75-L87)). Same note: tolerable, but consider extracting to a CSS class post-launch.
- Sitemap is missing `/signup` and `/login`. Intentional? If you want signup discoverable in search, add them.
- `public/styles-linear.css` is referenced only from `index.html`. Reasonable, but consider adding it (and the linear-premium body class) to the pricing page if you want visual consistency at launch. **Do not change without explicit ask** — could break the pricing-page layout tests.

### App shell

- `public/app.html` loads `/styles.css` + `/styles-app-v3.css` but no Open Graph meta. App is gated so this is acceptable.
- `app.html` `<title>` is just "App - ListBoost" for every route — could be updated dynamically via the client router (low priority).

### Forms / states

- Empty states exist on history, demo, and generator (good). Confirm error states render the `emptyStateTemplate` with `icon: "x"` and a short helpful message (already done for score, reply forms — verified). The demo error state is just `<p class="error">…</p>` ([site.js:2375](public/site.js#L2375)) — minor visual inconsistency, consider routing through `emptyStateTemplate` too.

### Accessibility

- Skip-links present on most pages (good).
- `aria-live="polite"` on `#toastRegion` (good).
- `prefers-reduced-motion` honoured for the spotlight animation (good).
- The dark theme toggle on marketing is a button with `aria-pressed` (good).
- Forms have visible field-error `<p>` siblings with `aria-live="polite"` (good).
- Open audit items: confirm visible focus rings on all `.btn` variants in dark mode (test `dark mode contrast keeps app usage readable` passes — likely fine).

### SEO

- `index.html` has full meta + JSON-LD (good).
- `pricing.html` has canonical + OG (good) but no JSON-LD `Product` / `Offer`. **Optional** — could be added later.
- `example.html` has canonical + OG (good).
- `auth.html`, `verify-email.html`, `forgot-password.html`, `reset-password.html`, `support.html`, `privacy.html`, `terms.html` — verify each has at minimum `title`, `description`, `viewport`. Confirmed: auth has title+description; haven't read all the smaller pages line-for-line. **Codex: spot-check these.**

### Performance

- Inter font is loaded via Google Fonts with a print/onload swap pattern (good — non-blocking).
- Images use `loading="lazy"` and `decoding="async"` on non-LCP images (good); the hero image is eager (correct).
- `styles-linear.css` minified (76KB). Acceptable.
- One small win: the inline JSON-LD on homepage hard-codes a `"price": "6.99"` offer — this matches the Starter monthly. Confirm intended.

---

## 7. Suggested Task Order for Codex

Strict order — earlier items unblock later ones. Each one is a small, reviewable change.

### Stage A — Land the in-flight redesign (current branch)

1. **Commit the working tree** on `homepage-premium-polish` as a single feat commit: `feat(home): premium homepage polish, Tailwind build, demo cap`. Include the new `scripts/`, `src/`, `tailwind.config.cjs`, `public/styles-linear.css`, `public/images/homepage/`, and the modified `index.html`, `pricing.html`, `site.js`, `package.json`, tests. **Verify `npm run check` still passes** before commit.
2. **Untrack the committed log files.** `git rm --cached server.out.log server.err.log` then commit. They're already in `.gitignore` but slipped in earlier. Stop and ask before pushing if these files contain anything Codex wants to keep.
3. **Run `npx update-browserslist-db@latest`** then commit `package-lock.json`. One-line maintenance.

### Stage B — Pre-launch verification (no code changes)

4. Open the dev server (`npm run dev`) and walk these flows in a browser at `http://localhost:3000`:
   - Home loads, dark toggle flips, mobile menu opens, all in-page anchors land.
   - Pricing page renders three cards; clicking a `Subscribe …` button while signed out should redirect to signup with `next=` query.
   - Example page generates a demo, then on the 4th try shows the 3/day cap.
   - Signup → verification-email gate → app shell.
   - `/app/photo` while on free plan redirects to `/app/billing?locked=photos`.
   - 404 page renders for a junk URL.
   - 500 page (`/500.html`) loads directly.
5. **Mobile sweep**: resize to 375×667 and re-walk hero, pricing cards, app nav. The mobile sticky CTA on `/example` should not cover the FAQ.

### Stage C — SEO + small polish

6. Spot-check meta tags on `support.html`, `privacy.html`, `terms.html`, `verify-email.html`, `forgot-password.html`, `reset-password.html` — confirm each has `<title>`, `<meta name="description">`, `<meta name="viewport">`, and either `<link rel="canonical">` or a noindex if appropriate.
7. Demo error state: route the catch block in [site.js:2374-2382](public/site.js#L2374) through `emptyStateTemplate({ icon: "x", heading: "Demo paused", body: error.message })` for visual consistency.

### Stage D — Launch

8. Push branch, open PR to `main`, watch CI (`npm run check`).
9. Follow `LAUNCH_REDESIGN.md` §"Merge And Deploy" for production rollout.
10. Hit `https://www.listboost.uk/health` after deploy and confirm `productionReady: true`.

---

## 8. Exact Files Codex Should Work On First

Order matches §7. All paths from repo root.

1. `package.json`, `package-lock.json` — only if Stage A.3 (browserslist update) is run.
2. `server.out.log`, `server.err.log` — untrack only (don't delete).
3. `public/site.js` — Stage C.7 only (single block change).
4. `public/support.html`, `public/privacy.html`, `public/terms.html`, `public/verify-email.html`, `public/forgot-password.html`, `public/reset-password.html` — Stage C.6 spot-checks.

That's the entire Stage A–C scope. **Everything else stays untouched.**

---

## 9. Files to AVOID Unless Necessary

| File | Why |
|---|---|
| `server.js` | 5200 lines, careful manual routing, full test coverage. Touching it risks contract-test failures. |
| `public/app.js` | 920 lines, drives the legacy in-app generator. Tested. Don't refactor for launch. |
| `tests/system-contract.test.js`, `tests/ui-contract.test.js` | These pin the public surface; only edit if you intentionally change that surface. |
| `public/styles.css`, `public/styles-v3.css`, `public/styles-app-v3.css` | Hand-tuned legacy CSS. Touch only the smallest possible scope. |
| `data/`, `node_modules/`, `*.log` | Generated/ignored. |
| `docs/ui-ux-pro-max/` | Reference pack — already gitignored (you'll see it on disk but not in commits). |
| `README.md`, `LAUNCH_REDESIGN.md`, `DESIGN.md` | Already accurate. Update only if behaviour changes. |

---

## 10. Commands Codex Should Run After Changes

```bash
# Single command verifies everything that matters:
npm run check       # syntax-checks all JS + runs 97 tests

# Only when CSS source changed (src/styles-linear.css or tailwind.config.cjs):
npm run build:css

# Only when refreshing homepage product photos:
npm run fetch:homepage-images
```

`npm run dev` to start the server at `http://localhost:3000` for manual QA.

**Hard rule:** do not push a commit where `npm run check` fails.

---

## 11. Acceptance Criteria — "Website Finished"

### Build & code health

- [ ] `npm run check` passes (syntax + 97 tests).
- [ ] `npm run build:css` produces `public/styles-linear.css` without warnings (browserslist note OK).
- [ ] No new files committed under `data/`, `node_modules/`, or matching `*.log`.

### Manual smoke (local + production)

- [ ] Homepage `/` loads with hero image, pricing cards, FAQ open/close, mobile menu opens, dark/light toggle persists across reload.
- [ ] `/pricing` renders three subscription cards; each `Subscribe …` button works (signed-in: Stripe redirect; signed-out: routes to signup).
- [ ] `/example` accepts a free-text note, generates a listing within ~10s, shows demo cap on the 4th attempt within 24h.
- [ ] `/signup` → verification email or dev console fallback → `/app` shell loads with skeleton then content.
- [ ] `/app/photo` redirects to `/app/billing?locked=photos` for free plan; works after upgrading to Seller.
- [ ] Stripe webhook (live) grants subscription, `/app/billing` shows correct plan + usage, cancel/portal works.
- [ ] `/health` returns `200` with `productionReady: true` and `missing: []` in production.
- [ ] 404 page renders for unknown URLs. 500 page renders when forced.

### SEO + accessibility

- [ ] Every public-facing HTML page has `<title>`, `<meta name="description">`, `<meta name="viewport">`.
- [ ] `/robots.txt` and `/sitemap.xml` reachable at root.
- [ ] Skip-link visible on tab on every page that has a `<main id="main">`.
- [ ] Tab order through the homepage hero reaches both CTAs before the workspace mock.
- [ ] No console errors in DevTools on a clean homepage load.

### Mobile

- [ ] At 375×667 (iPhone SE), every page is scrollable without horizontal overflow.
- [ ] App nav uses icon+label and fits on a single row.
- [ ] Mobile sticky CTA on `/example` doesn't overlap the final FAQ entry.

### Stripe + Email

- [ ] Real test card on live mode (or test mode) completes checkout, webhook fires, usage limit lifts.
- [ ] Resend `EMAIL_FROM` domain is verified and a real signup receives the verification email within 60s.

### Domain + Deploy

- [ ] `listboost.uk` 301-redirects to `https://www.listboost.uk` (handled by `server.js` host check).
- [ ] TLS valid on both apex and `www`.
- [ ] Railway volume mounted at `/data` and `DATA_DIR=/data` set; DB survives a redeploy.

When all of the above are ticked, the website is **done**.

---

## 12. Open Assumptions (Claude → Codex)

Explicitly written down so Codex can correct any that are wrong.

1. **Assumed**: Codex's in-flight changes in the working tree are intentional and ready to commit pending review. (Confirmed by inspecting the diffs — they're a self-consistent homepage upgrade + Tailwind addition.)
2. **Assumed**: The three layered stylesheets on the homepage (`styles.css` + `styles-v3.css` + `styles-linear.css`) are intentional. Other public pages omitting `styles-linear.css` is also intentional. **If wrong**, the homepage `.linear-premium` body class will degrade.
3. **Assumed**: `data-page="marketing-v3"` is a meaningful CSS scope hook on auth/pricing/example pages. **Unverified** that all `.marketing-v3` selectors render correctly without `.linear-premium`. Confirmed only by `homepage renders premium marketing structure` and `pricing page renders Starter / Seller / Elite subscription tiers with launch pricing` tests passing.
4. **Assumed**: Codex will run `npm run check` before committing. (See README §"Local Run" "Validate before pushing" — already documented.)
5. **Assumed**: The Anthropic SDK dependency (`@anthropic-ai/sdk` ^0.71.0) is intentional as a fallback to OpenAI, not legacy.
6. **Assumed**: `LAUNCH_REDESIGN.md` documents pack pricing (£5/£12/£25 credit packs) that's now superseded by the subscription model. The active source of truth is `SUBSCRIPTION_PLANS_JSON` (and `PRICING_CATALOGUE` in `site.js`) — not credit packs. **If wrong**, `LAUNCH_REDESIGN.md` needs updating; do not change Stripe/server code, just docs.
7. **Assumed**: The committed `server.out.log` containing a dev verification token (`http://localhost:3000/verify?token=…`) is a stale local artefact and that token is invalidated. **Do not push this token publicly** when committing — the file should be `git rm --cached`'d, not edited.

---

## 13. Quick Reference

```
Project root:       c:\Users\fowzi\Documents\Codex\2026-05-04\listboost-build-a-top-tier-product
Repo:               git-tracked, branch homepage-premium-polish, main = main
Node:               v24.11.0 (engines: >=20)
Package manager:    npm 11.6.1
Dev server:         npm run dev   → http://localhost:3000
Tests:              npm test      → 97 pass
Full check:         npm run check
CSS build:          npm run build:css
Deploy:             Railway (railway.json), health probe /health
```

**Reviewer:** Claude (this file).
**Implementer:** Codex.
**Communication channel:** this file + git commits.
**Update this file** whenever a stage in §7 lands, by ticking the relevant box in §11 and noting blockers as they're closed.
