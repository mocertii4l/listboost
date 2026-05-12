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
const stylesV3Css = readFileSync(new URL("../public/styles-v3.css", import.meta.url), "utf8");
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

test("static product photos are served with browser image mime types", () => {
  assert.match(serverJs, /\.jpg": "image\/jpeg"/);
  assert.match(serverJs, /\.jpeg": "image\/jpeg"/);
  assert.match(serverJs, /\.png": "image\/png"/);
  assert.match(serverJs, /\.webp": "image\/webp"/);
  assert.match(serverJs, /\.gif": "image\/gif"/);
});

test("SEO text files are served with crawler-friendly mime types", () => {
  assert.match(serverJs, /\.txt": "text\/plain; charset=utf-8"/);
  assert.match(serverJs, /\.xml": "application\/xml; charset=utf-8"/);
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
  assert.match(siteJs, /Reading your item details|Writing your listing/);
  assert.match(siteJs, /results-skeleton/);
  assert.match(siteJs, /Copy all/);
  assert.match(siteJs, /Save to history/);
  assert.match(siteJs, /formatUsageText/);
  assert.match(siteJs, /Upgrade your plan to continue generating listings/);
  assert.match(siteJs, /showPaywallModal/);
  assert.match(siteJs, /Review before copying/);
  assert.match(siteJs, /Price guidance included/);
  assert.match(siteJs, /Photo checklist included/);
  assert.doesNotMatch(siteJs, /No Vinted login required|Your data is private/);
});

test("generated output shows value signals and before-after transformation", () => {
  assert.match(serverJs, /DO NOT merely repeat the input with commas/);
  assert.match(serverJs, /TITLE: write a natural Vinted-style title under 65 characters/);
  assert.match(serverJs, /DESCRIPTION: write 5-7 short, copy-paste-ready lines/);
  assert.match(serverJs, /PRICE: use realistic UK resale pricing/);
  assert.match(serverJs, /KEYWORDS: include 8-10 Vinted search phrases/);
  assert.match(serverJs, /Avoid generic filler such as 'vinted', 'for sale', 'wardrobe clearout'/);
  assert.match(serverJs, /BUYER REPLY: write in a natural UK seller tone/);
  assert.match(serverJs, /keywordPhrasesFor/);
  assert.match(serverJs, /casual everyday trainers/);
  assert.match(serverJs, /clean sole trainers/);
  assert.match(serverJs, /List at \$\{price\.startPrice\} to leave room for offers/);
  assert.match(serverJs, /Do not simply caption the photo/);
  assert.doesNotMatch(serverJs, /Lovely \$\{titleCore\.toLowerCase\(\)\}/);
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
  // Paywall now renders directly from PRICING_CATALOGUE so its plans cannot drift.
  assert.match(siteJs, /paywall-pricing-grid/);
  assert.match(siteJs, /pricingGridHtml\(\{\}\)/);
  assert.match(siteJs, /data-subscription-plan/);
  assert.match(siteJs, /Upgrade your plan to continue generating listings/);
  assert.match(stylesCss, /\.paywall-proof/);
  assert.match(stylesCss, /\.paywall-backdrop[\s\S]*overflow-y: auto/);
  assert.match(stylesCss, /\.paywall-modal[\s\S]*max-height: calc\(100dvh - var\(--space-8\)\)/);
  assert.match(stylesCss, /\.paywall-pricing-grid[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});

test("admin allowance changes cannot be mistaken for used listings", () => {
  assert.match(serverJs, /function repairInvertedUsageIfNeeded/);
  assert.match(serverJs, /Repaired inverted usage\/allowance values/);
  assert.match(serverJs, /name="limit"[\s\S]*placeholder="allowance"/);
  assert.match(serverJs, /Set allowance/);
  assert.match(serverJs, /UPDATE users SET usage_this_month = \?, usage_limit = \?/);
  assert.match(siteJs, /function hasManualFreeAllowance/);
  assert.match(siteJs, /Manual allowance applied/);
});

test("homepage comparison cards reset the old before-after grid", () => {
  assert.match(stylesV3Css, /\.comparison-card \{[\s\S]*grid-template-columns: 1fr/);
  assert.match(stylesV3Css, /\.comparison-card > \* \{[\s\S]*grid-column: 1/);
  assert.match(stylesV3Css, /\.comparison-card \.badge \{[\s\S]*white-space: normal/);
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
  assert.match(siteJs, /aria-label="Start boosting listings"/);
  assert.match(siteJs, />Start boosting listings</);
  assert.match(siteJs, /js-email/);
  assert.match(siteJs, /Sign out/);
  assert.match(siteJs, /js-public-logout/);
});

test("auth routes get correct labels and required signup name field", () => {
  assert.match(authHtml, /<h1 id="authHeading">Sign in<\/h1>/);
  assert.match(authHtml, /<label class="signup-name-field hidden">Full name<input name="name" type="text" autocomplete="name" maxlength="80"/);
  assert.match(authHtml, /<button class="btn btn-primary" type="submit">Sign in<\/button>/);
  assert.match(authHtml, /Continue with Google/);
  assert.match(authHtml, /data-oauth-provider="google"/);
  assert.doesNotMatch(authHtml, /Continue with Microsoft|data-oauth-provider="microsoft"/);
  assert.doesNotMatch(authHtml, /Google sign-in uses secure redirect|never sees your Google password/);
  assert.doesNotMatch(authHtml, /mini-badge|Soon/);
  assert.match(authHtml, /Secure seller workspace/);
  assert.match(authHtml, /No card needed to start/);
  assert.match(authHtml, /Cancel or switch plans any time/);
  assert.match(authHtml, /Independent from Vinted/);
  assert.match(authHtml, /Privacy-first account handling/);
  assert.match(authHtml, /Terms of service/);
  assert.match(authHtml, /Privacy notice/);
  assert.match(siteJs, /location\.pathname === "\/signup"/);
  assert.match(siteJs, /heading\) heading\.textContent = isSignup \? "Create account" : "Sign in"/);
  assert.match(siteJs, /data-oauth-provider/);
  assert.match(siteJs, /auth_error/);
  assert.match(siteJs, /sign-in is not active in this preview yet/);
  assert.doesNotMatch(siteJs, /data-social-auth|sign-in is coming soon/);
  assert.match(serverJs, /handleOAuthStart/);
  assert.match(serverJs, /handleOAuthCallback/);
  assert.match(serverJs, /GOOGLE_CLIENT_ID/);
  assert.match(serverJs, /MICROSOFT_CLIENT_ID/);
  assert.match(siteJs, /validateFullName/);
  assert.match(serverJs, /validateName/);
  assert.match(serverJs, /INSERT INTO users \(id, email, name, password_hash/);
  assert.match(stylesV3Css, /\.auth-split-form \.auth-card \{\s*[\s\S]*?max-width: min\(360px, calc\(100vw - 28px\)\)/);
  assert.match(stylesV3Css, /\.auth-security-note,\s*[\s\S]*?\.auth-legal\s*\{\s*[\s\S]*?overflow-wrap: anywhere/);
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
  assert.match(siteJs, /accept="image\/jpeg,image\/png,image\/webp,image\/gif,image\/heic,image\/heif,\.heic,\.heif"/);
  assert.match(siteJs, /data-upload-source="library"/);
  assert.match(siteJs, /data-upload-source="camera"/);
  assert.match(siteJs, /Photo library \/ files/);
  assert.match(siteJs, /without forcing the camera/);
  assert.match(siteJs, /optimise large phone photos before upload/);
  assert.match(siteJs, /Choose photos from camera roll or files/);
  assert.match(siteJs, /Take photo/);
  assert.match(siteJs, /cameraPhoto/);
  assert.match(siteJs, /photoPreviewGrid/);
  assert.match(siteJs, /canvas\.toDataURL\("image\/jpeg", 0\.86\)/);
  assert.match(siteJs, /That phone photo could not be read here/);
  assert.match(siteJs, /photoCategories = \[/);
  assert.match(siteJs, /Women's clothing/);
  assert.match(siteJs, /Trainers/);
  assert.match(siteJs, /Designer/);
  assert.match(siteJs, /Home & decor/);
  assert.match(siteJs, /Electronics/);
  assert.match(siteJs, /Bundles/);
  assert.match(siteJs, /class="photo-empty-mock-photo"/);
  assert.match(siteJs, /\/images\/listing-gallery\/zara-dress\.jpg/);
  assert.match(siteJs, /Photo Listing/);
  assert.match(siteJs, /Choose Photo Library \/ camera roll or Browse files/);
  assert.match(serverJs, /\/api\/generate-from-photos/);
});

test("paid feature entitlements are enforced server-side and surfaced in the app", () => {
  assert.match(serverJs, /FEATURE_ENTITLEMENTS/);
  assert.match(serverJs, /photos:\s*\{\s*minimumPlan:\s*"seller"/);
  assert.match(serverJs, /buyerReplies:\s*\{\s*minimumPlan:\s*"seller"/);
  assert.match(serverJs, /listingScore:\s*\{\s*minimumPlan:\s*"seller"/);
  assert.match(serverJs, /history:\s*\{\s*minimumPlan:\s*"seller"/);
  assert.match(serverJs, /userCanUseFeature\(user, "photos"\)/);
  assert.match(serverJs, /sendFeatureLocked\(res, visitor, user, requestedFeature\)/);
  assert.match(siteJs, /FEATURE_REQUIREMENTS/);
  assert.match(siteJs, /function canUseFeature/);
  assert.match(siteJs, /featureLockTemplate/);
  assert.match(siteJs, /feature:\s*"listingScore"/);
  assert.match(siteJs, /feature:\s*"buyerReplies"/);
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

test("homepage shows honest image-based resale listing cards", () => {
  assert.match(indexHtml, /class="market-grid cross-market-grid"/);
  assert.match(indexHtml, /class="market-listing-card"/);
  assert.match(indexHtml, /class="market-card-photo"/);
  for (const image of [
    "nike-trainers.jpg",
    "white-trainers-floor.jpg",
    "tan-nike-af1.jpg",
    "leather-bag.jpg",
    "cargo-trousers.jpg",
    "silver-necklace.jpg"
  ]) {
    assert.match(indexHtml, new RegExp(`/images/homepage/${image}`));
  }
  assert.match(indexHtml, /Worn white Nike trainers/);
  assert.match(indexHtml, /Black leather biker jacket/);
  assert.match(indexHtml, /Pearl strand necklace/);
  assert.doesNotMatch(indexHtml, /Adidas Samba|Carhartt|Levi's|Doc Martens|North Face|Ferragamo|Superdry/i);
  assert.match(indexHtml, /Original mock listing cards with real item photos/);
  const cards = (indexHtml.match(/class="market-listing-card"/g) || []).length;
  assert.equal(cards, 6, `expected exactly 6 image-based listing cards, found ${cards}`);
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

test("Seller card remains the featured / best-value plan", () => {
  for (const html of [pricingHtml, indexHtml]) {
    // Article wrapper for Seller has the featured class plus the brand-badged "Best value" pill.
    assert.match(html, /<article class="pricing-card subscription is-featured featured" id="subscribe-seller"/);
    const sellerBlock = html.match(/id="subscribe-seller"[\s\S]*?<\/article>/)[0];
    assert.match(sellerBlock, /badge badge-brand">Best value/);
  }
});

test("pricing card layout keeps bullets compact and buttons pinned to the bottom", () => {
  // The card itself uses flex-column (so margin-top: auto on .pricing-buy works).
  assert.match(stylesCss, /\.pricing-card\s*\{[^}]*display:\s*flex/);
  assert.match(stylesCss, /\.pricing-card\s*\{[^}]*flex-direction:\s*column/);
  // The compare list absorbs vertical space (so cards stay equal height) but its inner
  // rows must NOT stretch — align-content: start packs them at the top.
  assert.match(stylesCss, /\.pricing-card \.pricing-compare\s*\{[^}]*flex:\s*1\s+1\s+auto/);
  assert.match(stylesCss, /\.pricing-card \.pricing-compare\s*\{[^}]*align-content:\s*start/);
  // Grid must fix row heights to content so 3-bullet cards don't grow gaps to match a 10-bullet card.
  assert.match(stylesCss, /\.pricing-compare\s*\{[^}]*grid-auto-rows:\s*max-content/);
  // Mobile keeps long GBP prices readable instead of clipping.
  assert.match(stylesV3Css, /@media \(max-width: 640px\)[\s\S]*?\.pricing-price\s*\{[\s\S]*?display:\s*grid/);
  assert.match(stylesV3Css, /@media \(max-width: 640px\)[\s\S]*?\.pricing-price strong\s*\{[\s\S]*?clamp\(34px, 12vw, 42px\)/);
  // The buy button uses margin-top: auto to pin to the bottom edge.
  assert.match(stylesCss, /\.pricing-buy\s*\{[^}]*margin-top:\s*auto/);
});

test("pricing surfaces use the single PRICING_CATALOGUE source of truth", () => {
  // The catalogue exists in site.js with all three plan ids, current prices, and the Elite display name.
  assert.match(siteJs, /const PRICING_CATALOGUE\s*=\s*\[/);
  assert.match(siteJs, /id:\s*"starter"[\s\S]*?monthlyLimit:\s*20[\s\S]*?pricePence:\s*699/);
  assert.match(siteJs, /id:\s*"seller"[\s\S]*?monthlyLimit:\s*75[\s\S]*?pricePence:\s*1499[\s\S]*?featured:\s*true/);
  assert.match(siteJs, /id:\s*"reseller"[\s\S]*?monthlyLimit:\s*250[\s\S]*?pricePence:\s*2999/);
  // Static HTML opts in to JS hydration via data-pricing-grid (v3 layout uses class="pricing-v3").
  assert.match(indexHtml, /class="pricing-v3"\s+data-pricing-grid="true"/);
  assert.match(pricingHtml, /class="pricing-v3"\s+data-pricing-grid="true"/);
  // Bootstrap calls hydratePricingGrids().
  assert.match(siteJs, /hydratePricingGrids\(\)/);
  // Paywall modal also renders from the catalogue (no bespoke per-plan paywall markup remains).
  assert.match(siteJs, /paywall-pricing-grid/);
  assert.match(siteJs, /pricingGridHtml\(\{\}\)/);
});

test("static pricing HTML cannot drift from the catalogue copy", () => {
  // Each plan's exact bullet list as rendered in static HTML must match the catalogue.
  const catalogue = {
    starter: ["20 listings per month", "Notes-to-listing generator", "Editable resale title, description and keywords", "Price guidance and photo checklist", "Copy buttons for every section"],
    seller: ["75 listings per month", "Everything in Starter", "Photo upload from phone camera roll", "Fast / fair / max price guidance", "Buyer reply generator", "Listing score checker", "Saved history for repeat sellers", "Best value for weekly listing"],
    reseller: ["250 listings per month", "Everything in Seller", "Batch-friendly reseller workflow", "Advanced photo checklist", "Detailed pricing confidence notes", "Listing history", "Priority support", "Early access to reseller tools", "Best for daily sellers"]
  };
  for (const [planId, bullets] of Object.entries(catalogue)) {
    for (const html of [pricingHtml, indexHtml]) {
      const block = html.match(new RegExp(`id="subscribe-${planId}"[\\s\\S]*?</article>`))[0];
      for (const bullet of bullets) {
        assert.match(block, new RegExp(bullet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${planId} bullet missing in static HTML: ${bullet}`);
      }
    }
  }
});

test("editable result sections render textareas and use edited values for copy", () => {
  assert.match(siteJs, /function editableSection/);
  assert.match(siteJs, /function readEditableField/);
  assert.match(siteJs, /function buildAllCopyFromEditable/);
  // outputTemplate uses editableSection for all six fields.
  assert.match(siteJs, /editableSection\(\{ field: "title"/);
  assert.match(siteJs, /editableSection\(\{ field: "description"/);
  assert.match(siteJs, /editableSection\(\{ field: "keywords"/);
  assert.match(siteJs, /editableSection\(\{ field: "priceGuidance"/);
  assert.match(siteJs, /editableSection\(\{ field: "photoChecklist"/);
  assert.match(siteJs, /editableSection\(\{ field: "buyerReply"/);
  // Helper copy is present and actionable.
  assert.match(siteJs, /Edit anything before copying to Vinted/);
  // The copy handler reads live values, not the originally-rendered AI text.
  assert.match(siteJs, /data-copy-field/);
  assert.match(siteJs, /data-copy-all/);
  assert.match(siteJs, /data-reset-field/);
  assert.match(siteJs, /Reset to AI version/);
  // Copy-all button replaces the old static data-copy="..." flow.
  assert.match(siteJs, /readEditableField\(field\)/);
  assert.match(siteJs, /buildAllCopyFromEditable\(\)/);
});

test("paywall modal can be dismissed with Escape and renders from the catalogue", () => {
  assert.match(siteJs, /event\.key === "Escape"[\s\S]{0,200}paywall-backdrop/);
  // No bespoke per-plan paywall markup remains.
  assert.doesNotMatch(siteJs, /paywall-pack is-featured is-dominant/);
});

test("homepage hero is reseller-focused with a product workspace mock", () => {
  // V3 hero uses a Crosslist-inspired, ListBoost-original workspace mockup.
  assert.match(indexHtml, /class="hero-v3 premium-hero cross-hero"/);
  assert.match(indexHtml, /class="workspace-mock cross-product-mock"/);
  assert.match(indexHtml, /class="cross-listing-preview"/);
  assert.match(indexHtml, /class="cross-editor-panel"/);
  assert.match(indexHtml, /Black leather biker jacket/);
  assert.match(indexHtml, /class="workspace-tags"/);
  assert.match(indexHtml, /Listing score/);
  assert.match(indexHtml, /Price range/);
  assert.match(indexHtml, /Photo checklist/);
  assert.match(indexHtml, /Buyer preview/);
  assert.match(indexHtml, /No Vinted login required/);
  assert.match(indexHtml, /Manual posting only/);
  // Marketing-v3 dark page mode must be active on the homepage.
  assert.match(indexHtml, /<body data-page="marketing-v3"/);
});

test("homepage trust section gives honest trust signals without fake testimonials", () => {
  // The homepage uses lightweight trust chips and no fabricated quote cards.
  assert.match(indexHtml, /No marketplace password/);
  assert.match(indexHtml, /Manual posting only/);
  assert.match(indexHtml, /Copy and post manually/);
  assert.match(indexHtml, /Built for clothes, shoes, bags and accessories/);
  assert.match(indexHtml, /Start free with 3 listings/);
  assert.doesNotMatch(indexHtml, /Trusted by\s+1000\+\s+Vinted\s+Sellers/);
  assert.match(indexHtml, /"@type": "SoftwareApplication"/);
  // No fake testimonials: forbid quote-attribution patterns and class="testimonial".
  assert.doesNotMatch(indexHtml, /\bsays\b\s+[A-Z][a-z]+,\s*[A-Z]/);
  assert.doesNotMatch(indexHtml, /class="testimonial/);
  assert.match(indexHtml, /class="section feature-bento-v6 cross-product"/);
  assert.match(indexHtml, /class="workflow-strip"/);
  assert.match(indexHtml, /Write better listings with AI/);
  assert.match(indexHtml, /Make photos easier for buyers to trust/);
});

test("mobile app nav uses inline SVG icons + visible labels", () => {
  const appHtml = readFileSync(new URL("../public/app.html", import.meta.url), "utf8");
  // Each nav item has a stacked icon + text label.
  for (const route of ["dashboard", "notes", "photo", "history", "billing"]) {
    assert.match(appHtml, new RegExp(`data-app-nav="${route}"`));
  }
  // Inline SVGs (5 nav items, each with one <svg>).
  const svgCount = (appHtml.match(/class="app-nav-icon"/g) || []).length;
  assert.equal(svgCount, 5, `expected 5 inline nav SVGs, found ${svgCount}`);
  assert.match(stylesCss, /\.app-nav-icon/);
  // 56px tap target on mobile.
  assert.match(stylesCss, /\.app-nav a\s*\{[^}]*min-height:\s*56px/);
});

test("public UI never shows old launch prices, old limits, or unlimited claims", () => {
  for (const html of [indexHtml, pricingHtml]) {
    assert.doesNotMatch(html, /&pound;5\/month\b/);
    assert.doesNotMatch(html, /&pound;12\/month\b/);
    assert.doesNotMatch(html, /&pound;25\/month\b/);
    assert.doesNotMatch(html, /\b100 listings\/month\b/);
    assert.doesNotMatch(html, /Unlimited listings/i);
  }
  // site.js JS-rendered fallbacks and feature lists must not echo old values.
  assert.doesNotMatch(siteJs, /pricePence:\s*500\b/);
  assert.doesNotMatch(siteJs, /pricePence:\s*1200\b/);
  assert.doesNotMatch(siteJs, /pricePence:\s*2500\b/);
  assert.doesNotMatch(siteJs, /monthlyLimit:\s*100\b/);
  assert.doesNotMatch(siteJs, /unlimited:\s*true/);
  assert.doesNotMatch(siteJs, /"Unlimited listings"/);
});

test("public marketing explains ListBoost's focused resale workflow without naming other AI tools", () => {
  assert.match(indexHtml, /A listing workspace for real resale sellers/);
  assert.match(indexHtml, /From camera roll to buyer-ready copy/);
  assert.match(indexHtml, /Write better listings with AI/);
  assert.match(indexHtml, /Preview the buyer experience/);
  assert.match(indexHtml, /copy and post manually/i);
  assert.match(indexHtml, /Saved history for repeat sellers/);
  assert.match(siteJs, /Category-aware wording/);
  assert.match(siteJs, /Fast \/ fair \/ max prices/);
  assert.match(siteJs, /Copy-ready sections/);
  assert.doesNotMatch(indexHtml, /ChatGPT|Claude/);
  assert.doesNotMatch(pricingHtml, /ChatGPT|Claude/);
  assert.match(pricingHtml, /not just text generation/);
  assert.match(pricingHtml, /You are paying for the workflow/);
  for (const html of [indexHtml, pricingHtml]) {
    assert.doesNotMatch(html, /Backend plan ids/i);
    assert.doesNotMatch(html, /internally it remains/i);
  }
});

test("homepage pricing teaser matches the new feature lists", () => {
  const sellerBlock = indexHtml.match(/id="subscribe-seller"[\s\S]*?<\/article>/)[0];
  assert.match(sellerBlock, /75 listings per month/);
  assert.match(sellerBlock, /Photo upload from phone camera roll/);
  assert.match(sellerBlock, /Fast \/ fair \/ max price guidance/);
  assert.match(sellerBlock, /Listing score checker/);
  assert.match(sellerBlock, /Saved history for repeat sellers/);
  assert.match(sellerBlock, /Full phone-first seller workflow/);
  // V3 layout: <strong>£X.XX</strong><span>per month</span>.
  assert.match(sellerBlock, /<strong>&pound;14\.99<\/strong>/);
  const eliteBlock = indexHtml.match(/id="subscribe-reseller"[\s\S]*?<\/article>/)[0];
  assert.match(eliteBlock, /<h3>Elite<\/h3>/);
  assert.match(eliteBlock, /250 listings per month/);
  assert.match(eliteBlock, /<strong>&pound;29\.99<\/strong>/);
  assert.match(eliteBlock, /Priority support/);
  assert.doesNotMatch(eliteBlock, /Reusable listing templates/);
  assert.doesNotMatch(eliteBlock, /Unlimited/);
});

test("plan id 'reseller' stays stable internally even though display says Elite", () => {
  // The button still posts the backend id `reseller`.
  for (const html of [pricingHtml, indexHtml]) {
    assert.match(html, /data-subscription-plan="reseller"/);
  }
  // site.js maps "reseller" to "Elite" via publicPlanName.
  assert.match(siteJs, /function publicPlanName/);
  assert.match(siteJs, /if \(id === "reseller"\) return "Elite"/);
});

test("billing route benefits list matches the per-plan public spec", () => {
  // Starter — 20/month + core notes workflow features
  assert.match(siteJs, /starter:\s*\[\s*"20 listings per month"[\s\S]*?"Notes-to-listing generator"[\s\S]*?"Editable resale title, description and keywords"[\s\S]*?"Price guidance and photo checklist"[\s\S]*?"Copy buttons for every section"/);
  // Seller — 75/month + 6 spec features
  assert.match(siteJs, /seller:\s*\[\s*"75 listings per month"[\s\S]*?"Everything in Starter"[\s\S]*?"Photo upload from phone camera roll"[\s\S]*?"Fast \/ fair \/ max price guidance"[\s\S]*?"Buyer reply generator"[\s\S]*?"Listing score checker"[\s\S]*?"Saved history for repeat sellers"/);
  // Elite — 250/month + priority support; no unavailable template or unlimited claim
  assert.match(siteJs, /reseller:\s*\[\s*"250 listings per month"[\s\S]*?"Batch-friendly reseller workflow"[\s\S]*?"Priority support"[\s\S]*?"Early access to reseller tools"/);
  assert.doesNotMatch(siteJs, /Reusable listing templates/);
  assert.doesNotMatch(siteJs, /"Unlimited listings"/);
});

test("generation UI shows progress messages, speed copy and a busy button", () => {
  assert.match(siteJs, /Most listings finish in a few seconds/);
  assert.match(siteJs, /generationProgressSteps/);
  assert.match(siteJs, /Reading your item details/);
  assert.match(siteJs, /Writing your listing/);
  assert.match(siteJs, /Preparing copy buttons/);
  assert.match(siteJs, /progress-still-going|Still working/);
  assert.match(siteJs, /function startGenerationProgress/);
  assert.match(siteJs, /function setGeneratorBusy/);
  assert.match(stylesCss, /\.progress-strip/);
  assert.match(stylesCss, /\.progress-steps/);
  assert.match(stylesCss, /\.progress-still-going/);
});

test("server logs generation duration without leaking user input", () => {
  // Capture each `[generation] completed ...` template literal, including its interpolations.
  const logLines = serverJs.match(/console\.log\(`\[generation\] completed[\s\S]*?\)\;/g) || [];
  assert.equal(logLines.length >= 3, true, `expected >=3 [generation] log sites, found ${logLines.length}`);
  for (const line of logLines) {
    assert.match(line, /route=/);
    assert.match(line, /durationMs=/);
    assert.match(line, /plan=/);
    // Must NOT log raw user content / model output.
    assert.doesNotMatch(line, /itemDetails/);
    assert.doesNotMatch(line, /buyerQuestion/);
    assert.doesNotMatch(line, /input\.notes/);
    assert.doesNotMatch(line, /result\.title/);
    assert.doesNotMatch(line, /result\.description/);
  }
  // The OpenAI calls cap output tokens to keep latency bounded.
  assert.match(serverJs, /max_output_tokens:\s*900/);
  assert.match(serverJs, /max_output_tokens:\s*1000/);
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

test("pricing page renders Starter / Seller / Elite subscription tiers with launch pricing", () => {
  for (const plan of ["starter", "seller", "reseller"]) {
    assert.match(pricingHtml, new RegExp(`id="subscribe-${plan}"`));
    assert.match(pricingHtml, new RegExp(`data-subscription-plan="${plan}"`));
  }
  assert.doesNotMatch(pricingHtml, /data-checkout-pack/);
  assert.doesNotMatch(pricingHtml, /one-time/);
  assert.match(pricingHtml, /Best value/);
  // New launch prices (v3 layout uses "<strong>£X.XX</strong><span>per month</span>").
  assert.match(pricingHtml, /<strong>&pound;6\.99<\/strong>/);
  assert.match(pricingHtml, /<strong>&pound;14\.99<\/strong>/);
  assert.match(pricingHtml, /<strong>&pound;29\.99<\/strong>/);
  // Old prices and unlimited wording must NOT appear in public HTML.
  assert.doesNotMatch(pricingHtml, /<strong>&pound;5<\/strong>/);
  assert.doesNotMatch(pricingHtml, /<strong>&pound;12<\/strong>/);
  assert.doesNotMatch(pricingHtml, /<strong>&pound;25<\/strong>/);
  assert.doesNotMatch(pricingHtml, /100 listings\/month/);
  assert.doesNotMatch(pricingHtml, /Unlimited listings/);
  assert.doesNotMatch(pricingHtml, /<strong>Unlimited<\/strong>/);
  // Plan labels
  assert.match(pricingHtml, /<h3>Starter<\/h3>/);
  assert.match(pricingHtml, /<h3>Seller<\/h3>/);
  assert.match(pricingHtml, /<h3>Elite<\/h3>/);
  assert.match(pricingHtml, /Subscribe Elite/);
  assert.doesNotMatch(pricingHtml, /Subscribe Reseller/);
  assert.doesNotMatch(pricingHtml, /<h3>Reseller<\/h3>/);

  // Starter must show the core features currently in the public catalogue.
  const starterBlock = pricingHtml.match(/id="subscribe-starter"[\s\S]*?<\/article>/)[0];
  assert.match(starterBlock, /20 listings per month/);
  assert.match(starterBlock, /Notes-to-listing generator/);
  assert.match(starterBlock, /Editable resale title, description and keywords/);
  assert.match(starterBlock, /Price guidance and photo checklist/);
  assert.match(starterBlock, /Copy buttons for every section/);

  // Seller must show 75/month + the 6 spec features.
  const sellerBlock = pricingHtml.match(/id="subscribe-seller"[\s\S]*?<\/article>/)[0];
  assert.match(sellerBlock, /75 listings per month/);
  assert.match(sellerBlock, /Everything in Starter/);
  assert.match(sellerBlock, /Photo upload from phone camera roll/);
  assert.match(sellerBlock, /Fast \/ fair \/ max price guidance/);
  assert.match(sellerBlock, /Buyer reply generator/);
  assert.match(sellerBlock, /Listing score checker/);
  assert.match(sellerBlock, /Saved history for repeat sellers/);
  assert.match(sellerBlock, /Best value for weekly listing/);
  assert.doesNotMatch(sellerBlock, /100 listings/);

  // Elite must show 250/month + premium bullets, and never claim unlimited or unavailable templates.
  const eliteBlock = pricingHtml.match(/id="subscribe-reseller"[\s\S]*?<\/article>/)[0];
  const eliteBullets = (eliteBlock.match(/<li>/g) || []).length;
  assert.equal(eliteBullets >= 9, true, `Elite should list 9+ bullets, found ${eliteBullets}`);
  assert.match(eliteBlock, /250 listings per month/);
  assert.doesNotMatch(eliteBlock, /Reusable listing templates/);
  assert.match(eliteBlock, /Best for daily sellers/);
  assert.match(eliteBlock, /Priority support/);
  assert.doesNotMatch(eliteBlock, /Unlimited/);
});

test("example demo uses anonymous live generation endpoint", () => {
  assert.match(exampleHtml, /id="runDemo"/);
  assert.match(exampleHtml, /Zara navy satin midi dress, UK 10, worn twice/);
  assert.match(exampleHtml, /Generate sell-ready listing/);
  assert.match(exampleHtml, /No Vinted login/);
  assert.match(exampleHtml, /No card needed/);
  assert.match(exampleHtml, /Copy &amp; paste manually/);
  assert.match(exampleHtml, /3 free demo tries per day/);
  assert.match(exampleHtml, /id="demoLimitNote"/);
  assert.match(exampleHtml, /Create free account[\s\S]{0,12}3 free listings/);
  assert.match(serverJs, /handleDemoGenerate/);
  assert.match(serverJs, /\/api\/demo-generate/);
  assert.match(serverJs, /DEMO_DAILY_LIMIT\s*=\s*3/);
  assert.match(siteJs, /\/api\/demo-generate/);
  assert.match(siteJs, /demoUsage/);
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
  assert.match(supportHtml, /data-page="marketing-v3"/);
  assert.match(supportHtml, /\/styles-v3\.css/);
  assert.match(privacyHtml, /support@listboost\.uk/);
  assert.match(termsHtml, /support@listboost\.uk/);
  assert.match(privacyHtml, /class="legal-links"/);
  assert.match(termsHtml, /class="legal-links"/);
  assert.match(privacyHtml, /Plain-English summary/);
  assert.match(privacyHtml, /Passwords are stored as salted pbkdf2 hashes/);
  assert.match(privacyHtml, /Your rights under UK GDPR/);
  assert.match(privacyHtml, /We do not sell your personal data/);
  assert.match(termsHtml, /Plain-English summary/);
  assert.match(termsHtml, /Plans, usage and billing/);
  assert.match(termsHtml, /AI-generated output/);
  assert.match(termsHtml, /Governing law/);
  assert.match(supportHtml, /Support FAQ/);
  assert.match(supportHtml, /support@listboost\.uk/);
  assert.match(serverJs, /"\/support": "\/support\.html"/);
  assert.match(siteJs, /Support centre/);
  assert.doesNotMatch(privacyHtml, /hello@listboost\.app/);
  assert.doesNotMatch(termsHtml, /hello@listboost\.app/);
  assert.match(stylesCss, /\.page-wrap[\s\S]*width: min\(1240px/);
});
