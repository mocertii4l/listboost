import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const indexHtml = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const pricingHtml = readFileSync(new URL("../public/pricing.html", import.meta.url), "utf8");
const siteJs = readFileSync(new URL("../public/site.js", import.meta.url), "utf8");
const stylesCss = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
const serverJs = readFileSync(new URL("../server.js", import.meta.url), "utf8");

test("public pricing surfaces three subscription plans", () => {
  for (const plan of ["starter", "seller", "reseller"]) {
    assert.match(indexHtml, new RegExp(`data-subscription-plan="${plan}"`));
    assert.match(pricingHtml, new RegExp(`data-subscription-plan="${plan}"`));
  }
  assert.doesNotMatch(indexHtml, /data-checkout-pack/);
  assert.doesNotMatch(pricingHtml, /data-checkout-pack/);
  assert.doesNotMatch(indexHtml, /one-time/);
  assert.doesNotMatch(pricingHtml, /one-time/);
  assert.match(serverJs, /monthlyLimit:\s*20/);
  assert.match(serverJs, /monthlyLimit:\s*75/);
  assert.match(serverJs, /monthlyLimit:\s*250/);
  assert.match(serverJs, /pricePence:\s*699/);
  assert.match(serverJs, /pricePence:\s*1499/);
  assert.match(serverJs, /pricePence:\s*2999/);
  assert.match(serverJs, /FREE_PLAN[\s\S]*monthlyLimit:\s*3/);
  // Old prices and unlimited tier must not exist anywhere in server.js.
  assert.doesNotMatch(serverJs, /pricePence:\s*500\b/);
  assert.doesNotMatch(serverJs, /pricePence:\s*1200\b/);
  assert.doesNotMatch(serverJs, /pricePence:\s*2500\b/);
  assert.doesNotMatch(serverJs, /monthlyLimit:\s*100\b/);
  // The Reseller plan id must not declare a null (unlimited) monthlyLimit anymore.
  const sellerLine = (serverJs.match(/id:\s*"reseller"[\s\S]*?\}/m) || [""])[0];
  assert.doesNotMatch(sellerLine, /monthlyLimit:\s*null/);
  assert.doesNotMatch(indexHtml, /4242 4242 4242 4242/);
  assert.doesNotMatch(indexHtml, /Test card/i);
});

test("subscription checkout sends planId to the backend", () => {
  assert.match(siteJs, /data-subscription-plan/);
  assert.match(siteJs, /JSON\.stringify\(\{ planId: subscriptionButton\.dataset\.subscriptionPlan \}\)/);
  assert.match(serverJs, /requestedPlanId/);
  assert.match(serverJs, /planId: plan\.id/);
});

test("account bootstrap exposes subscription plans and environment metadata", () => {
  assert.match(serverJs, /subscriptionPlans: publicSubscriptionPlans\(\)/);
  assert.match(serverJs, /adminEnabled: Boolean\(adminEmail && adminPassword\)/);
  assert.match(siteJs, /renderSubscriptionPlansGrid/);
  assert.match(siteJs, /getSubscriptionPlans/);
});

test("homepage renders premium marketing structure", () => {
  // Copy.ai-inspired light SaaS hero copy.
  assert.match(indexHtml, /Create better[\s\S]*?Vinted[\s\S]*?listings[\s\S]*?in seconds/);
  assert.match(indexHtml, /ListBoost uses AI to turn your item photos and details/);
  // Primary CTA copy.
  assert.match(indexHtml, /Start free/);
  assert.match(indexHtml, /See example/);
  // V3 hero uses workspace-mock instead of an item-card mockup.
  assert.match(indexHtml, /class="workspace-mock/);
  assert.match(indexHtml, /class="hero-v3"/);
  assert.match(indexHtml, /class="hero-proof-v3"/);
  assert.match(indexHtml, /class="section product-demo-v4"/);
  assert.match(indexHtml, /Upload from camera roll/);
  assert.match(indexHtml, /class="section moat-v3"/);
  assert.match(indexHtml, /A Vinted workflow, not a blank writing box/);
  // Premium marketing shell is applied.
  assert.match(indexHtml, /<body data-page="marketing-v3"/);
  // Section anchors are still present.
  assert.match(indexHtml, /id="how-it-works"/);
  assert.match(indexHtml, /id="features"/);
  assert.match(indexHtml, /id="pricing"/);
  assert.match(indexHtml, /id="faq"/);
  assert.match(siteJs, /public-footer/);
});

test("homepage consumes shared template helpers", () => {
  assert.match(siteJs, /function iconSvg/);
  assert.match(siteJs, /function buttonTemplate/);
  assert.match(siteJs, /function cardTemplate/);
  assert.match(siteJs, /function listingCardTemplate/);
  assert.match(siteJs, /function pricingCardTemplate/);
  assert.match(siteJs, /function authShellTemplate/);
  assert.match(siteJs, /function emptyStateTemplate/);
  assert.match(siteJs, /hydrateListingCardPlaceholders/);
  assert.match(siteJs, /hydrateIconPlaceholders/);
});

test("styles use a single root token block", () => {
  assert.equal((stylesCss.match(/^:root \{/gm) || []).length, 1);
  assert.match(stylesCss, /:root\[data-theme="dark"\]/);
  assert.match(stylesCss, /@media \(prefers-color-scheme: dark\)/);
  assert.match(stylesCss, /\.btn-primary/);
  assert.match(stylesCss, /\.card-elevated/);
  assert.match(stylesCss, /\.listing-card/);
  assert.match(stylesCss, /\.pricing-card/);
});

test("homepage avoids development and placeholder leakage", () => {
  assert.doesNotMatch(indexHtml, /localhost/i);
  assert.doesNotMatch(indexHtml, /lorem ipsum/i);
  assert.doesNotMatch(indexHtml, /Test card/i);
  assert.doesNotMatch(indexHtml, /dev environment/i);
});
