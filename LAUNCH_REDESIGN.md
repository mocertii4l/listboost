# ListBoost Redesign Launch Runbook

## What Changed

The `redesign-v1` branch introduces a safer public/product structure for ListBoost:

- Canonical `www.listboost.uk` redirect from apex `listboost.uk`.
- Three pack pricing model: Starter, Seller, Reseller.
- New public routes: `/example`, `/pricing`, `/signup`, `/login`, `/verify-email`, `/forgot-password`, `/reset-password`.
- New app routes mapped to the signed-in workspace: `/app`, `/app/notes`, `/app/photo`, `/app/score`, `/app/replies`, `/app/history`, `/app/billing`.
- New checkout routes: `/checkout/:packId`, `/checkout/success`, `/checkout/cancel`.
- Brand assets: SVG logo, favicon, apple touch icon, Open Graph SVG.
- Robots and sitemap files.
- Contract tests for pricing, checkout, canonical routes and account bootstrap metadata.

## Production CREDIT_PACKS_JSON

Paste this into Railway production when approving the redesign:

```json
[{"id":"starter","name":"Starter","credits":50,"pricePence":500,"label":"Try it","description":"A practical first pack for a wardrobe clear-out or first seller test."},{"id":"seller","name":"Seller","credits":150,"pricePence":1200,"label":"Best value","description":"The best value pack for regular Vinted sellers listing every week.","featured":true},{"id":"reseller","name":"Reseller","credits":400,"pricePence":2500,"label":"Power seller","description":"For bulk listing sessions, serious resellers and repeat sellers."}]
```

The fallback in `server.js` matches this JSON exactly.

## Stripe Products And Prices

Create these in Stripe live mode before merging:

| Product | Price | Metadata |
| --- | ---: | --- |
| ListBoost Starter Credits | GBP 5.00 | `packId=starter`, `credits=50` |
| ListBoost Seller Credits | GBP 12.00 | `packId=seller`, `credits=150` |
| ListBoost Reseller Credits | GBP 25.00 | `packId=reseller`, `credits=400` |

Current code creates inline Checkout prices from `CREDIT_PACKS_JSON`; dedicated Stripe Price IDs are optional for this branch. If you decide to switch to fixed Price IDs later, add `stripePriceId` to each pack and update `handleCheckout`.

## Railway Preview Environment

Do not point the preview at production data.

1. Railway project: add a new environment named `preview-redesign`.
2. Deploy branch: `redesign-v1`.
3. Add a fresh volume mounted at `/data-preview`.
4. Set `DATA_DIR=/data-preview`.
5. Set `APP_URL` to the Railway preview domain.
6. Use test Stripe keys in preview unless you explicitly want live test purchases.
7. Keep production `main` and production volume untouched.

## Merge And Deploy

1. Review the draft PR from `redesign-v1` to `main`.
2. Confirm `npm run check` passes in GitHub Actions.
3. Smoke test preview:
   - `/health`
   - `/`
   - `/pricing`
   - `/example`
   - `/signup`
   - `/login`
   - `/app`
   - `/checkout/starter`
4. Paste `CREDIT_PACKS_JSON` into Railway production.
5. Confirm Stripe webhook still points to `https://www.listboost.uk/api/stripe-webhook`.
6. Merge only after approval.
7. Watch Railway deployment logs and confirm `/health` returns `productionReady: true`.

## Rollback

If anything fails:

1. In Railway, redeploy the latest known-good `main` deployment before the merge.
2. Remove or revert `CREDIT_PACKS_JSON` to the previous value if needed.
3. Confirm `/health` is green.
4. Confirm Stripe checkout and webhook credit grants still work.

Previous fallback was a single 50-credit pack controlled by:

```env
CREDIT_PACK_SIZE=50
CREDIT_PACK_PRICE_PENCE=500
```

## Known Follow-Ups

- Password reset is styled but still support-assisted. Implement tokenised reset before public scale.
- Dedicated Stripe Price IDs are documented but the branch currently uses inline Checkout prices from `CREDIT_PACKS_JSON`.
- Full Playwright visual baselines require installing Playwright browsers in CI or a local visual QA machine.
