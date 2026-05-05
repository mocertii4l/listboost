import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const indexHtml = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const siteJs = readFileSync(new URL("../public/site.js", import.meta.url), "utf8");
const stylesCss = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
const serverJs = readFileSync(new URL("../server.js", import.meta.url), "utf8");

test("public pricing shows multiple live credit packs", () => {
  assert.match(indexHtml, /data-pack-id="starter"/);
  assert.match(indexHtml, /data-pack-id="seller"/);
  assert.match(indexHtml, /data-pack-id="reseller"/);
  assert.match(serverJs, /credits:\s*50/);
  assert.match(serverJs, /credits:\s*150/);
  assert.match(serverJs, /credits:\s*400/);
  assert.match(serverJs, /pricePence:\s*500/);
  assert.match(serverJs, /pricePence:\s*1200/);
  assert.match(serverJs, /pricePence:\s*2500/);
  assert.doesNotMatch(indexHtml, /4242 4242 4242 4242/);
  assert.doesNotMatch(indexHtml, /Test card/i);
});

test("checkout sends the selected pack to the backend", () => {
  assert.match(appJs, /buyCredits\(packId\)/);
  assert.match(appJs, /JSON\.stringify\(\{ packId \}\)/);
  assert.match(serverJs, /requestedPackId/);
  assert.match(serverJs, /packId: pack\.id/);
});

test("account bootstrap exposes pricing and environment metadata", () => {
  assert.match(serverJs, /creditPacks: publicCreditPacks\(\)/);
  assert.match(serverJs, /adminEnabled: Boolean\(adminEmail && adminPassword\)/);
  assert.match(appJs, /updateEnvironmentLinks\(data\)/);
  assert.match(appJs, /renderPricingPacks\(data\.creditPacks \|\| \[\]\)/);
});

test("homepage renders premium marketing structure", () => {
  assert.match(indexHtml, /Turn messy item notes into sell-ready Vinted listings in seconds/);
  assert.match(indexHtml, /Start with 5 free credits/);
  assert.match(indexHtml, /Try the demo/);
  assert.match(indexHtml, /data-listing-card="hero"/);
  assert.match(indexHtml, /id="before-after"/);
  assert.match(indexHtml, /zara dress size 10 worn twice navy blue/);
  assert.match(indexHtml, /class="demo-strip"/);
  assert.match(indexHtml, /id="how-it-works"/);
  assert.match(indexHtml, /id="features"/);
  assert.match(indexHtml, /id="pricing"/);
  assert.match(indexHtml, /Questions sellers ask/);
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
