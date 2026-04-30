import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const indexHtml = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const serverJs = readFileSync(new URL("../server.js", import.meta.url), "utf8");

test("public pricing shows multiple live credit packs", () => {
  assert.match(indexHtml, /data-pack-id="starter"/);
  assert.match(indexHtml, /data-pack-id="seller"/);
  assert.match(indexHtml, /data-pack-id="reseller"/);
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
