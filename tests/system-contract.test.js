import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const serverJs = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const siteJs = readFileSync(new URL("../public/site.js", import.meta.url), "utf8");
const appHtml = readFileSync(new URL("../public/app.html", import.meta.url), "utf8");
const pricingHtml = readFileSync(new URL("../public/pricing.html", import.meta.url), "utf8");
const authHtml = readFileSync(new URL("../public/auth.html", import.meta.url), "utf8");
const exampleHtml = readFileSync(new URL("../public/example.html", import.meta.url), "utf8");

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
  assert.match(appHtml, /Generate from notes/);
  assert.match(appHtml, /Recent generations/);
  assert.match(siteJs, /installCheckoutSuccess/);
  assert.match(siteJs, /theme-toggle/);
});

test("password toggles and public header states are wired", () => {
  assert.match(authHtml, /type="password"/);
  assert.match(siteJs, /installPasswordToggles/);
  assert.match(siteJs, /Show password/);
  assert.match(siteJs, /Hide password/);
  assert.match(siteJs, /input\.type = showing \? "password" : "text"/);
  assert.match(siteJs, /Log in/);
  assert.match(siteJs, /Start free/);
  assert.match(siteJs, /js-email/);
  assert.match(siteJs, /Log out/);
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
  assert.match(serverJs, /handleDemoGenerate/);
  assert.match(serverJs, /\/api\/demo-generate/);
  assert.match(siteJs, /\/api\/demo-generate/);
  assert.doesNotMatch(siteJs, /Generated output appears here[\s\S]*api\/generate/);
});
