# Copy.ai-Style Redesign QA

This pass moves ListBoost toward a premium light SaaS look inspired by Copy.ai's general feel, without copying its brand, words, logo or page structure.

## What Changed

- Public homepage now uses a light SaaS visual system with subtle gradients, bolder hero typography, rounded demo panels and softer cards.
- Homepage hero copy now says: "Create better Vinted listings in seconds".
- Homepage adds a product demo section showing camera-roll upload into a generated Vinted listing package.
- Pricing plans now show clearer upgrade value: Starter is the core workflow, Seller unlocks the phone-first seller workflow, Elite is for reseller volume and priority help.
- Auth pages now have a centred premium card, social-style Google/Microsoft buttons, email/password fallback, and terms/privacy text.
- App photo upload now separates camera roll from camera capture and accepts `image/*,.heic,.heif` for better iPhone compatibility.
- App photo upload shows selected-photo previews before generation.
- App mobile CSS tightens headings, panels, file-picker controls and bottom navigation.

## QA Checklist

- `npm run check` must pass.
- Homepage should have no horizontal overflow at phone width.
- Homepage hero should show `Start free` and `See example`.
- `/signup` should show Google/Microsoft buttons and email/password fields.
- `/app/photo` should show `Choose from camera roll` and `Take photo` as separate actions.
- `/app/photo` should show thumbnails after files are selected.
- Pricing cards should still post backend plan ids: `starter`, `seller`, `reseller`.
- Stripe, auth, database, API route and environment logic are intentionally unchanged.

## Local Preview

Run:

```bash
npm run check
PORT=3014 DATA_DIR=/tmp/listboost-local-preview-data RESEND_MOCK_EMAIL=true npm start
```

Then open:

- `http://127.0.0.1:3014/`
- `http://127.0.0.1:3014/signup`
- `http://127.0.0.1:3014/pricing`
- `http://127.0.0.1:3014/app/photo`
