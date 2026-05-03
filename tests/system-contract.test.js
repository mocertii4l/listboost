import { readFileSync } from "node:fs";
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

test("canonical domain and checkout routes are present", () => {
  assert.match(serverJs, /listboost\.uk/);
  assert.match(serverJs, /https:\/\/www\.listboost\.uk/);
  assert.match(serverJs, /\/checkout\/success\?session_id=/);
  assert.match(serverJs, /\/checkout\/cancel/);
  assert.match(serverJs, /checkoutMatch/);
});

test("new app surfaces include required modules", () => {
  for (const path of ["/app/notes", "/app/photo", "/app/score", "/app/replies", "/app/history", "/app/billing"]) {
    assert.match(serverJs, new RegExp(path.replace(/\//g, "\\/")));
  }
  assert.match(appHtml, /id="appRoute"/);
  assert.match(siteJs, /function notesRouteTemplate/);
  assert.match(siteJs, /Paste your item details/);
  assert.match(siteJs, /function repliesRouteTemplate/);
  assert.match(siteJs, /Buyer reply tools/);
  assert.match(siteJs, /function billingRouteTemplate/);
  assert.match(siteJs, /Recent transactions/);
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

test("app generator flow is guided, copyable and credit aware", () => {
  assert.match(siteJs, /class="generator-route"/);
  assert.match(siteJs, /Black Zara dress, size 10, worn twice, good condition/);
  assert.match(siteJs, /hidden><\/section>|hidden/);
  assert.match(siteJs, /Generating your listing/);
  assert.match(siteJs, /Copy all/);
  assert.match(siteJs, /credit used/);
  assert.match(siteJs, /You're out of credits/);
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
  assert.match(stylesCss, /\.before-after-grid/);
  assert.match(stylesCss, /\.value-label/);
});

test("copy feedback nudges users toward listing", () => {
  assert.match(siteJs, /copySuccessCount/);
  assert.match(siteJs, /Copied — paste this into Vinted/);
  assert.match(siteJs, /You're ready to list this item/);
});

test("zero-credit paywall shows upgrade psychology", () => {
  assert.match(siteJs, /You've created/);
  assert.match(siteJs, /Most sellers upgrade to keep listing faster/);
  assert.match(siteJs, /Number\(pack\.credits\) === 150/);
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
  assert.match(siteJs, /Start free/);
  assert.match(siteJs, /js-email/);
  assert.match(siteJs, /Log out/);
});

test("auth routes get correct labels and shared public shell", () => {
  assert.match(authHtml, /<h1 id="authHeading">Sign in<\/h1>/);
  assert.match(authHtml, /<button class="button primary" type="submit">Sign in<\/button>/);
  assert.match(siteJs, /location\.pathname === "\/signup"/);
  assert.match(siteJs, /heading\) heading\.textContent = isSignup \? "Create account" : "Sign in"/);
  for (const route of ["/signup", "/login", "/verify-email", "/forgot-password", "/reset-password"]) {
    assert.match(siteJs, new RegExp(route.replace(/\//g, "\\/")));
  }
});

test("dark mode contrast keeps app credits readable", () => {
  assert.match(stylesCss, /:root\[data-theme="dark"\][\s\S]*--color-fg: #f4fffc/);
  assert.match(stylesCss, /:root\[data-theme="dark"\] \.balance-card h2/);
  assert.match(stylesCss, /:root\[data-theme="dark"\] \.js-credits/);
  assert.match(stylesCss, /color: var\(--color-fg\)/);
});

test("pricing page renders three buyable packs", () => {
  for (const pack of ["starter", "seller", "reseller"]) {
    assert.match(pricingHtml, new RegExp(`id="${pack}"`));
    assert.match(pricingHtml, new RegExp(`data-checkout-pack="${pack}"`));
  }
  assert.match(pricingHtml, /50/);
  assert.match(pricingHtml, /150/);
  assert.match(pricingHtml, /400/);
  assert.match(pricingHtml, /Best value/);
});

test("example demo uses anonymous live generation endpoint", () => {
  assert.match(exampleHtml, /id="runDemo"/);
  assert.match(exampleHtml, /Black Zara dress size 10 worn twice good condition/);
  assert.match(exampleHtml, /Generate demo listing/);
  assert.match(serverJs, /handleDemoGenerate/);
  assert.match(serverJs, /\/api\/demo-generate/);
  assert.match(siteJs, /\/api\/demo-generate/);
  assert.match(siteJs, /Create free account to generate your own listings/);
  assert.match(siteJs, /demoInput/);
  assert.doesNotMatch(siteJs, /Generated output appears here[\s\S]*api\/generate/);
});

test("public pages include social metadata and legal pages use shared shell", () => {
  for (const html of [indexHtml, pricingHtml, exampleHtml, privacyHtml, termsHtml]) {
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
  assert.doesNotMatch(privacyHtml, /hello@listboost\.app/);
  assert.doesNotMatch(termsHtml, /hello@listboost\.app/);
  assert.match(stylesCss, /\.page-wrap[\s\S]*width: min\(1240px/);
});
