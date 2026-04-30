# ListBoost for Vinted

ListBoost is a UK-focused Vinted selling assistant. It creates listings from notes or item photos, scores listing quality, suggests pricing, drafts buyer replies, stores history, and sells credit packs through Stripe.

## Local Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Copy `.env.example` to `.env` and add your keys. Do not commit `.env`.

Validate before pushing:

```bash
npm run check
```

## Current Features

- Email/password accounts with HTTP-only sessions
- Email verification gate
- Account credit balances
- Stripe Checkout credit packs
- Stripe webhook endpoint
- Notes-to-listing generation
- Photo-to-listing generation with safety rules
- Listing score and improvement checklist
- Fast/fair/max pricing and offer guidance
- Buyer negotiation replies
- Vinted message templates
- Saved listing history with copy, regenerate, and delete actions
- Privacy and terms pages
- Admin page for viewing users/payments and adjusting credits
- `/health` launch-readiness endpoint

## Production Environment

Required for a public launch:

```env
NODE_ENV=production
APP_URL=https://listboost.uk
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini
OPENAI_VISION_MODEL=gpt-4.1-mini
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
EMAIL_FROM=ListBoost <verify@listboost.uk>
SUPPORT_EMAIL=support@listboost.uk
ADMIN_EMAIL=you@listboost.uk
ADMIN_PASSWORD=a-long-random-password
REQUIRE_EMAIL_VERIFICATION=true
DATA_DIR=/data
```

At least one AI provider key is required. OpenAI is preferred and used first when configured.

### Credit packs

ListBoost ships with three live credit packs:

- Starter: 25 credits for GBP 3
- Seller: 75 credits for GBP 7
- Reseller: 200 credits for GBP 15

To override them, set `CREDIT_PACKS_JSON` to an array of pack objects with `id`, `name`, `credits`, `pricePence`, `label`, `description`, and optional `featured`.

## Stripe Setup

1. Create a live Stripe account.
2. Add your live secret key as `STRIPE_SECRET_KEY`.
3. In Stripe Dashboard, create a webhook endpoint:

```text
https://listboost.uk/api/stripe-webhook
```

4. Subscribe to:

```text
checkout.session.completed
```

5. Copy the signing secret into:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

Credits are granted by the webhook. The checkout success page only shows pending/confirmed state.

## Email Setup

The app supports Resend for verification emails.

1. Create a Resend account.
2. Verify `listboost.uk` as a sending domain.
3. Add:

```env
RESEND_API_KEY=re_...
EMAIL_FROM=ListBoost <verify@listboost.uk>
```

In development, if `RESEND_API_KEY` is missing, verification links are printed to `server.log`.

## Admin

Set:

```env
ADMIN_EMAIL=you@listboost.uk
ADMIN_PASSWORD=a-long-random-password
```

Then visit `/admin` and sign in with HTTP Basic Auth.

## Health Check

```text
GET /health
```

In production, this returns `503` until required launch configuration is present. The response includes a `missing` array listing every config item that still needs to be set, plus the resolved `dataDir` so you can confirm the Railway volume is mounted where you expect.

## Database

The app uses SQLite via `better-sqlite3`. The DB lives at `<DATA_DIR>/listboost.db`. By default `DATA_DIR` resolves to `./data`. On Railway you must set `DATA_DIR` to the mount path of a persistent volume (see the deploy section below) — without a volume the DB is wiped on every redeploy.

For a bigger launch, move to hosted Postgres/Supabase and replace the SQLite queries.

## Deploy to Railway

### 1. Push to GitHub

From the project root:

```bash
git init
git add .
git commit -m "Initial ListBoost commit"
gh repo create listboost --private --source=. --remote=origin --push
```

If you don't have the `gh` CLI, create the repo on github.com manually, then:

```bash
git remote add origin https://github.com/<you>/listboost.git
git branch -M main
git push -u origin main
```

### 2. Create the Railway project

1. Go to https://railway.app, click **New Project → Deploy from GitHub repo** and pick `listboost`.
2. Railway autodetects Node via Nixpacks. `railway.json` sets `npm start` and `/health` as the health check.
3. In **Settings → Networking**, click **Generate Domain** so Railway assigns a temporary `*.up.railway.app` URL — you'll replace it with `listboost.uk` in step 5.

### 3. Attach a persistent volume (required for SQLite)

1. In the service, open the **Volumes** tab and click **New Volume**.
2. Set **Mount path** to `/data`. Pick at least 1 GB.
3. Set the env var `DATA_DIR=/data` so the app writes `listboost.db` onto the volume.

Without this, every redeploy creates a fresh empty database and all signups/credits are lost.

### 4. Set environment variables

In the Railway service **Variables** tab, add:

```env
NODE_ENV=production
APP_URL=https://listboost.uk
DATA_DIR=/data
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini
OPENAI_VISION_MODEL=gpt-4.1-mini
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
EMAIL_FROM=ListBoost <verify@listboost.uk>
SUPPORT_EMAIL=support@listboost.uk
REQUIRE_EMAIL_VERIFICATION=true
FREE_CREDITS=5
CREDIT_PACK_SIZE=50
CREDIT_PACK_PRICE_PENCE=500
ADMIN_EMAIL=you@listboost.uk
ADMIN_PASSWORD=a-long-random-password
```

Do not set `PORT` — Railway injects it automatically and the server reads `process.env.PORT`.

After saving, redeploy. Hit `https://<temp>.up.railway.app/health` and confirm `productionReady: true` and `missing: []`.

### 5. Connect the listboost.uk domain

1. In Railway: **Settings → Networking → Custom Domain → `listboost.uk`** (and again for `www.listboost.uk`). Railway shows DNS records to add.
2. At your domain registrar, set the records Railway gives you. Typically:
   - `listboost.uk` → `CNAME` (or `ALIAS`/`ANAME` at the apex) to the target Railway shows.
   - `www.listboost.uk` → `CNAME` to the same target.
3. Wait for DNS to propagate (usually minutes). Railway issues the TLS cert automatically.
4. Once the domain shows **Active**, set `APP_URL=https://listboost.uk` (already in step 4) and trigger a redeploy.

### 6. Stripe webhook

After the domain is live, in the Stripe Dashboard add the webhook endpoint:

```text
https://listboost.uk/api/stripe-webhook
```

Subscribe to `checkout.session.completed`, copy the signing secret into `STRIPE_WEBHOOK_SECRET`, and redeploy.

### 7. Final checks

- `GET https://listboost.uk/health` returns `200` with `productionReady: true`.
- Sign up, receive verification email from Resend.
- Run a notes generation and a photo generation.
- Buy a credit pack with a real card; confirm the webhook grants credits and the row appears in `/admin`.

## Launch Checklist

- Push to GitHub.
- Run `npm run check`.
- Deploy on Railway with a persistent volume mounted at `/data` and `DATA_DIR=/data`.
- Set `APP_URL=https://listboost.uk`.
- Add live OpenAI key.
- Add live Stripe key + webhook secret pointing at `https://listboost.uk/api/stripe-webhook`.
- Add Resend key with verified `listboost.uk` sender domain.
- Set admin credentials.
- Visit `/health` and confirm `productionReady: true` and `missing: []`.
- Test signup, email verification, notes generation, photo generation, checkout, webhook credit grant, and history.
