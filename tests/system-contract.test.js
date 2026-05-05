import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const serverJs = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const siteJs = readFileSync(new URL("../public/site.js", import.meta.url), "utf8");
const appHtml = readFileSync(new URL("../public/app.html", import.meta.url), "utf8");
const pricingHtml = readFileSync(new URL("../public/pricing.html", import.meta.url), "utf8");
const authHtml = readFileSync(new URL("../public/auth.html", import.meta.url), "utf8");
const exampleHtml = readFileSync(new URL("../public/example.html", import.meta.url), "utf8");
const stylesCss = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
const authUtilsJs = readFileSync(new URL("../public/auth-utils.js", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const privacyHtml = readFileSync(new URL("../public/privacy.html", import.meta.url), "utf8");
const termsHtml = readFileSync(new URL("../public/terms.html", import.meta.url), "utf8");
const supportHtml = readFileSync(new URL("../public/support.html", import.meta.url), "utf8");
const verifyHtml = readFileSync(new URL("../public/verify-email.html", import.meta.url), "utf8");
const notFoundHtml = readFileSync(new URL("../public/404.html", import.meta.url), "utf8");
const publicFiles = readdirSync(new URL("../public", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(html|js|css)$/.test(entry.name))
  .map((entry) => [entry.name, readFileSync(new URL(`../public/${entry.name}`, import.meta.url), "utf8")]);

test("canonical domain and checkout routes are present", () => {
  assert.match(serverJs, /listboost\.uk/);
  assert.match(serverJs, /https:\/\/www\.listboost\.uk/);
  assert.match(serverJs, /\/checkout\/success\?session_id=/);
  assert.match(serverJs, /\/checkout\/cancel/);
  assert.match(serverJs, /checkoutMatch/);
});

test("new app surfaces include required modules", () => {
  for (const path of ["/app/notes", "/app/photo", "/app/score", "/app/replies", "/app/history", "/app/billing", "/app/account"]) {
    assert.match(serverJs, new RegExp(path.replace(/\//g, "\\/")));
  }
  assert.match(appHtml, /id="appRoute"/);
  assert.match(siteJs, /function notesRouteTemplate/);
  assert.match(siteJs, /Generate sell-ready listing/);
  assert.match(siteJs, /function repliesRouteTemplate/);
  assert.match(siteJs, /Buyer reply tools/);
  assert.match(siteJs, /function billingRouteTemplate/);
  assert.match(siteJs, /Recent billing activity/);
  assert.match(siteJs, /installCheckoutSuccess/);
  assert.match(siteJs, /theme-toggle/);
});

test("app route templates isolate feature content and expose active nav", () => {
  assert.match(siteJs, /data-route="dashboard"/);
  assert.match(siteJs, /data-route="notes"/);
  assert.match(siteJs, /data-route="photo"/);
  assert.match(siteJs, /data-route="score"/);
  assert.match(siteJs, /data-route="replies"/);
  assert.match(siteJs, /data-route="history"/);
  assert.match(siteJs, /data-route="billing"/);
  assert.match(siteJs, /aria-current", "page"/);
  assert.match(siteJs, /loadAppHistory/);
  assert.match(serverJs, /pagination/);
  assert.match(serverJs, /handleBilling/);
});

test("app generator flow is guided, copyable and usage aware", () => {
  assert.match(siteJs, /class="notes-route"/);
  assert.match(siteJs, /class="notes-layout"/);
  assert.match(siteJs, /id="notesInput"/);
  assert.match(siteJs, /Example: Zara navy satin midi dress/);
  assert.match(siteJs, /example-chip/);
  assert.match(siteJs, /notesCharCount/);
  assert.match(siteJs, /class="js-usage"/);
  assert.match(siteJs, /Generate sell-ready listing/);
  assert.match(siteJs, /Generating your listing/);
  assert.match(siteJs, /results-skeleton/);
  assert.match(siteJs, /Copy all/);
  assert.match(siteJs, /Save to history/);
  assert.match(siteJs, /formatUsageText/);
  assert.match(siteJs, /Upgrade your plan to continue generating listings/);
  assert.match(siteJs, /showPaywallModal/);
  assert.match(siteJs, /No Vinted login required/);
  assert.match(siteJs, /Copy and paste manually/);
  assert.match(siteJs, /Your data is private/);
});

test("generated output shows value signals and before-after transformation", () => {
  assert.match(serverJs, /TITLE: write a short Vinted-style title/);
  assert.match(serverJs, /DESCRIPTION: use clean bullet-style lines/);
  assert.match(serverJs, /PRICE: use realistic UK resale pricing/);
  assert.match(serverJs, /KEYWORDS: include strong plain search terms/);
  assert.match(serverJs, /BUYER REPLY: write in a natural UK seller tone/);
  assert.match(siteJs, /Your input vs generated listing/);
  assert.match(siteJs, /Optimised for Vinted search/);
  assert.match(siteJs, /High-conversion description/);
  assert.match(siteJs, /Suggested competitive pricing/);
  assert.match(siteJs, /Suggested buyer reply/);
  assert.match(siteJs, /result-listing-preview/);
  assert.match(stylesCss, /\.before-after-grid/);
  assert.match(stylesCss, /\.value-label/);
});

test("copy feedback nudges users toward listing", () => {
  assert.match(siteJs, /copySuccessCount/);
  assert.match(siteJs, /Copied to clipboard/);
  assert.match(siteJs, /You're ready to list this item/);
});

test("usage-limit paywall pushes subscription upgrade", () => {
  assert.match(siteJs, /You've created/);
  assert.match(siteJs, /Pick the monthly plan that matches your listing volume/);
  assert.match(siteJs, /Recommended monthly/);
  assert.match(siteJs, /data-subscription-plan/);
  assert.match(siteJs, /Upgrade your plan to continue generating listings/);
  assert.match(siteJs, /is-dominant/);
  assert.match(stylesCss, /\.paywall-pack\.is-dominant/);
  assert.match(stylesCss, /\.paywall-proof/);
});

test("generation success shows usage momentum", () => {
  assert.match(siteJs, /recordGenerationMomentum/);
  assert.match(siteJs, /lb_generated_/);
  assert.match(siteJs, /You've generated 1 listing today/);
  assert.match(siteJs, /You're on a roll - keep going/);
  assert.match(siteJs, /momentum-feedback/);
  assert.match(stylesCss, /\.momentum-feedback/);
});

test("app navigation switches routes client-side", () => {
  assert.match(siteJs, /function navigateApp/);
  assert.match(siteJs, /history\.pushState/);
  assert.match(siteJs, /window\.addEventListener\("popstate"/);
  assert.match(stylesCss, /\.app-nav a\.is-active[\s\S]*background/);
});

test("password toggles and public header states are wired", () => {
  assert.match(authHtml, /type="password"/);
  assert.match(siteJs, /installPasswordToggles/);
  assert.match(siteJs, /Show password/);
  assert.match(authUtilsJs, /Hide password/);
  assert.match(siteJs, /togglePasswordVisibility/);
  assert.match(siteJs, /Log in/);
  assert.match(siteJs, /Start free - 3 listings/);
  assert.match(siteJs, /js-email/);
  assert.match(siteJs, /Sign out/);
  assert.match(siteJs, /js-public-logout/);
});

test("auth routes get correct labels and required signup name field", () => {
  assert.match(authHtml, /<h1 id="authHeading">Sign in<\/h1>/);
  assert.match(authHtml, /<label class="signup-name-field hidden">Full name<input name="name" type="text" autocomplete="name" maxlength="80"/);
  assert.match(authHtml, /<button class="btn btn-primary" type="submit">Sign in<\/button>/);
  assert.match(siteJs, /location\.pathname === "\/signup"/);
  assert.match(siteJs, /heading\) heading\.textContent = isSignup \? "Create account" : "Sign in"/);
  assert.match(siteJs, /validateFullName/);
  assert.match(serverJs, /validateName/);
  assert.match(serverJs, /INSERT INTO users \(id, email, name, password_hash/);
});

test("verification and account settings are first-class app flows", () => {
  assert.match(verifyHtml, /Check your email to verify your account/);
  assert.match(verifyHtml, /class="js-email"/);
  assert.match(verifyHtml, /id="resendVerification"/);
  assert.match(verifyHtml, /Wrong email\? Sign out/);
  assert.match(serverJs, /\/api\/resend-verification/);
  assert.match(serverJs, /resend-verification:\$\{sessionToken\}/);
  assert.match(serverJs, /windowMs: 60_000/);
  assert.match(serverJs, /location: `\/verify-email\?next=/);
  assert.match(siteJs, /Email verified - welcome/);
  assert.match(siteJs, /function accountRouteTemplate/);
  assert.match(siteJs, /\/api\/account\/profile/);
  assert.match(siteJs, /\/api\/account\/password/);
  assert.match(siteJs, /Verified email/);
  assert.match(siteJs, /readonly required/);
  assert.match(siteJs, /data-theme-choice="system"/);
  assert.match(serverJs, /Verified email cannot be changed/);
});

test("photo upload supports mobile camera and premium output", () => {
  assert.match(siteJs, /capture="environment"/);
  assert.match(siteJs, /accept="image\/\*"/);
  assert.match(siteJs, /Photo Listing/);
  assert.match(siteJs, /Mobile cameras are supported/);
  assert.match(serverJs, /\/api\/generate-from-photos/);
});

test("button system has no legacy button aliases", () => {
  for (const [name, content] of publicFiles) {
    assert.doesNotMatch(content, /class="button/);
    assert.doesNotMatch(content, /\.button/);
    assert.doesNotMatch(content, /button primary|button secondary|button ghost|button danger/);
  }
  assert.match(stylesCss, /\.btn-primary/);
  assert.match(stylesCss, /\.btn-secondary/);
});

test("copy buttons use the shared toast confirmation", () => {
  assert.match(siteJs, /data-copy/);
  assert.match(siteJs, /toastRegion/);
  assert.match(siteJs, /Copied to clipboard/);
  assert.match(siteJs, /setTimeout\(\(\) =>/);
});

test("checkout success page links back to app and shows plan/usage", () => {
  const successHtml = readFileSync(new URL("../public/checkout-success.html", import.meta.url), "utf8");
  assert.match(successHtml, /href="\/app\/notes"/);
  assert.match(successHtml, /href="\/app\/billing"/);
  assert.match(successHtml, /href="\/app"/);
  assert.match(successHtml, /Start generating listings/);
  assert.match(successHtml, /View billing/);
  assert.match(successHtml, /Go to dashboard/);
  assert.match(successHtml, /class="js-current-plan"/);
  assert.match(successHtml, /class="js-usage"/);
  assert.match(successHtml, /class="js-success-headline"/);
});

test("public CTAs have valid hrefs and pricing has subscribe buttons", () => {
  assert.match(indexHtml, /href="\/signup"/);
  assert.match(indexHtml, /href="\/example"/);
  assert.match(pricingHtml, /href="\/signup"/);
  for (const plan of ["starter", "seller", "reseller"]) {
    assert.match(pricingHtml, new RegExp(`data-subscription-plan="${plan}"[^>]*>Subscribe`));
    assert.match(indexHtml, new RegExp(`data-subscription-plan="${plan}"`));
  }
  for (const html of [indexHtml, pricingHtml]) {
    for (const match of html.matchAll(/<button(\s[^>]*)?>/g)) {
      const attrs = match[1] || "";
      assert.match(attrs, /type="(button|submit)"/, `button missing type at: ${match[0]}`);
    }
  }
});

test("homepage shows seller-example product cards (Zara, Nike, Kids bundle)", () => {
  assert.match(indexHtml, /class="seller-cards"/);
  assert.match(indexHtml, /Zara Navy Satin Midi Dress/);
  assert.match(indexHtml, /Nike Air Force 1/);
  assert.match(indexHtml, /Kids Winter Bundle/);
  assert.match(indexHtml, /class="seller-tags"/);
  assert.match(indexHtml, /class="seller-price"/);
});

test("app generator empty states scaffold the upcoming output", () => {
  assert.match(siteJs, /scaffoldPreviewTemplate/);
  assert.match(siteJs, /photoStepsTemplate/);
  assert.match(siteJs, /Upload up to 4 photos/);
  assert.match(siteJs, /Add missing details/);
  assert.match(siteJs, /Generate listing/);
  assert.match(stylesCss, /\.scaffold-preview/);
  assert.match(stylesCss, /\.photo-empty/);
});

test("app nav routes resolve to /app static page", () => {
  for (const route of ["/app", "/app/notes", "/app/photo", "/app/billing", "/app/account", "/app/history"]) {
    assert.match(serverJs, new RegExp(`"${route.replace(/\//g, "\\/")}":\\s*"\\/app.html"`));
  }
});

test("decorative overlays do not steal pointer events", () => {
  const overlays = [
    /\.hero-preview::before[\s\S]*?pointer-events:\s*none/,
    /\.hero-preview::after[\s\S]*?pointer-events:\s*none/,
    /\.pricing-card\.is-featured::before[\s\S]*?pointer-events:\s*none/,
    /\.demo-generator-card::before[\s\S]*?pointer-events:\s*none/,
    /body\.confetti::after[\s\S]*?pointer-events:\s*none/
  ];
  for (const pattern of overlays) {
    assert.match(stylesCss, pattern, `expected decorative overlay to set pointer-events: none (pattern: ${pattern})`);
  }
});

test("app-link interceptor only fires inside the app shell", () => {
  assert.match(siteJs, /function isInsideApp/);
  assert.match(siteJs, /document\.getElementById\("appRoute"\)/);
  // The click handler must early-return when not inside /app
  assert.match(siteJs, /if \(!isInsideApp\(\)\) return;/);
});

test("checkout success copy is honest about email and links to support", () => {
  const successHtml = readFileSync(new URL("../public/checkout-success.html", import.meta.url), "utf8");
  // Old false claim must be gone
  assert.doesNotMatch(successHtml, /receipt will arrive/i);
  assert.match(successHtml, /href="mailto:support@listboost\.uk"/);
});

test("subscription confirmation email is wired to billing-cycle start", () => {
  assert.match(serverJs, /sendSubscriptionConfirmationEmail/);
  assert.match(serverJs, /Your ListBoost .* subscription is active/);
  assert.match(serverJs, /isFreshActivation/);
});

test("subscription confirmation email logs success and failure safely without secrets", () => {
  // Resend HTTP error path logs status + safe message but never the bearer token.
  assert.match(serverJs, /Subscription confirmation email failed status=/);
  assert.match(serverJs, /Subscription confirmation email queued/);
  // Mock mode and missing-key paths log distinct, machine-greppable reasons.
  assert.match(serverJs, /\[subscription-email\] mock mode \(RESEND_MOCK_EMAIL=true\)/);
  assert.match(serverJs, /RESEND_API_KEY missing/);
  // Failures must return a structured result, never throw to the webhook.
  assert.match(serverJs, /return \{ delivered: false, reason: "http-error"/);
  assert.match(serverJs, /return \{ delivered: false, reason: "network"/);
  assert.match(serverJs, /return \{ delivered: true, messageId/);
  // The bearer token must only appear inside the Authorization header construction, never in logs.
  const logLines = serverJs.match(/console\.(log|warn|error)\([^)]*\)/g) || [];
  for (const line of logLines) {
    assert.doesNotMatch(line, /resendApiKey/, `log line must not reference resendApiKey: ${line}`);
    assert.doesNotMatch(line, /Bearer\s+\$\{/, `log line must not interpolate Bearer token: ${line}`);
  }
});

test("billing-cycle start emits a structured log line", () => {
  assert.match(serverJs, /\[billing-cycle\] started user=/);
  assert.match(serverJs, /\[billing-cycle\] skipping confirmation email/);
});

test("/health surfaces email mock mode and from-domain (no secrets)", () => {
  assert.match(serverJs, /emailMockMode:/);
  assert.match(serverJs, /emailFromConfigured:/);
  assert.match(serverJs, /emailFromDomain:/);
  assert.doesNotMatch(serverJs, /resendApiKey:\s*resendApiKey/);
});

test("checkout success copy does not promise guaranteed email delivery", () => {
  const successHtml = readFileSync(new URL("../public/checkout-success.html", import.meta.url), "utf8");
  // The earlier guaranteed-delivery copy must not appear.
  assert.doesNotMatch(successHtml, /We sent a confirmation/);
  assert.doesNotMatch(successHtml, /receipt will arrive/i);
  // Must say the subscription is active and offer a way forward without claiming delivery.
  assert.match(successHtml, /Your subscription is active/);
  assert.match(successHtml, /If email confirmations are enabled/);
  assert.match(successHtml, /href="mailto:support@listboost\.uk"/);
});

test("confirmation email only fires on subscription-start, not on renewals", () => {
  // The fresh-activation gate must depend on the source string containing 'subscription-start'.
  assert.match(serverJs, /isFreshActivation = String\(source \|\| ""\)\.includes\("subscription-start"\)/);
  // The renewal handler in grantRenewalCreditsFromInvoice uses the 'stripe:invoice.paid' source which does NOT match.
  assert.match(serverJs, /source: "stripe:invoice\.paid"/);
  // The fresh activation in activateSubscriptionFromCheckout uses 'stripe:subscription-start'.
  assert.match(serverJs, /source: "stripe:subscription-start"/);
});

test("billing route shows plan, status, usage bar, benefits and truthful manage button", () => {
  assert.match(siteJs, /function billingRouteTemplate/);
  assert.match(siteJs, /js-current-plan/);
  assert.match(siteJs, /js-billing-status-pill/);
  assert.match(siteJs, /js-usage-bar/);
  assert.match(siteJs, /billing-benefits-list/);
  assert.match(siteJs, /planBenefitsFor/);
  // Manage subscription should only render when isPaying
  assert.match(siteJs, /const canPortal = isPaying/);
  assert.match(siteJs, /data-manage-subscription/);
});

test("legacy credit wording is no longer surfaced to users", () => {
  for (const html of [indexHtml, pricingHtml, exampleHtml, supportHtml]) {
    assert.doesNotMatch(html, /credits\/month/);
    assert.doesNotMatch(html, /one-time pack/i);
  }
  assert.doesNotMatch(siteJs, /credits remaining/i);
  assert.doesNotMatch(siteJs, /Buy credits/);
});

test("404 page renders with the site shell", () => {
  assert.match(notFoundHtml, /Page not found/);
  assert.match(notFoundHtml, /class="auth-shell"/);
  assert.match(notFoundHtml, /class="card auth-card"/);
  assert.match(notFoundHtml, /class="btn btn-primary"/);
});

test("dark mode contrast keeps app usage readable", () => {
  assert.match(stylesCss, /:root\[data-theme="dark"\][\s\S]*--text: #f4fffc/);
  assert.match(stylesCss, /:root\[data-theme="dark"\] \.balance-card h2/);
  assert.match(stylesCss, /:root\[data-theme="dark"\] \.js-usage/);
  assert.match(stylesCss, /color: var\(--text\)/);
});

test("pricing page renders subscription tiers only", () => {
  for (const plan of ["starter", "seller", "reseller"]) {
    assert.match(pricingHtml, new RegExp(`id="subscribe-${plan}"`));
    assert.match(pricingHtml, new RegExp(`data-subscription-plan="${plan}"`));
  }
  assert.doesNotMatch(pricingHtml, /data-checkout-pack/);
  assert.doesNotMatch(pricingHtml, /one-time/);
  assert.match(pricingHtml, /20/);
  assert.match(pricingHtml, /100/);
  assert.match(pricingHtml, /Unlimited/);
  assert.match(pricingHtml, /Best value/);
  assert.match(pricingHtml, /Subscribe monthly/);
  assert.match(pricingHtml, /Photo upload and buyer replies/);
  assert.match(pricingHtml, /priority support/i);
  assert.match(pricingHtml, /&pound;5\/month/);
  assert.match(pricingHtml, /&pound;12\/month/);
  assert.match(pricingHtml, /&pound;25\/month/);
});

test("example demo uses anonymous live generation endpoint", () => {
  assert.match(exampleHtml, /id="runDemo"/);
  assert.match(exampleHtml, /Zara navy satin midi dress, UK 10, worn twice/);
  assert.match(exampleHtml, /Generate sell-ready listing/);
  assert.match(exampleHtml, /No Vinted login/);
  assert.match(exampleHtml, /No card needed/);
  assert.match(exampleHtml, /Copy &amp; paste manually/);
  assert.match(exampleHtml, /Create free account · 3 free listings/);
  assert.match(serverJs, /handleDemoGenerate/);
  assert.match(serverJs, /\/api\/demo-generate/);
  assert.match(siteJs, /\/api\/demo-generate/);
  assert.match(siteJs, /Create free account - 3 listings on us/);
  assert.match(siteJs, /demoInput/);
  assert.doesNotMatch(siteJs, /Generated output appears here[\s\S]*api\/generate/);
});

test("subscription billing surfaces monthly plans and usage status", () => {
  assert.match(serverJs, /mode:\s*"subscription"/);
  assert.match(serverJs, /subscription_plan/);
  assert.match(serverJs, /subscription_status/);
  assert.match(serverJs, /usage_this_month/);
  assert.match(serverJs, /usage_limit/);
  assert.match(serverJs, /billing_period_end/);
  assert.match(serverJs, /checkout\.session\.completed/);
  assert.match(serverJs, /invoice\.paid/);
  assert.match(serverJs, /customer\.subscription\.updated/);
  assert.match(serverJs, /customer\.subscription\.deleted/);
  assert.match(siteJs, /Current plan/);
  assert.match(siteJs, /js-billing-status-pill/);
  assert.match(siteJs, /Listings used this cycle/);
  assert.match(siteJs, /Cycle ends/);
  assert.match(siteJs, /Subscribe monthly|Switch up or down/);
});

test("public pages include social metadata and legal pages use shared shell", () => {
  for (const html of [indexHtml, pricingHtml, exampleHtml, privacyHtml, termsHtml, supportHtml]) {
    assert.match(html, /og:title/);
    assert.match(html, /og:description/);
    assert.match(html, /og:image/);
    assert.match(html, /twitter:card/);
  }
  assert.match(privacyHtml, /id="main"/);
  assert.match(termsHtml, /id="main"/);
  assert.match(privacyHtml, /support@listboost\.uk/);
  assert.match(termsHtml, /support@listboost\.uk/);
  assert.match(privacyHtml, /class="legal-links"/);
  assert.match(termsHtml, /class="legal-links"/);
  assert.match(supportHtml, /Support FAQ/);
  assert.match(supportHtml, /support@listboost\.uk/);
  assert.match(serverJs, /"\/support": "\/support\.html"/);
  assert.match(siteJs, /Support centre/);
  assert.doesNotMatch(privacyHtml, /hello@listboost\.app/);
  assert.doesNotMatch(termsHtml, /hello@listboost\.app/);
  assert.match(stylesCss, /\.page-wrap[\s\S]*width: min\(1240px/);
});
