import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const tempDir = mkdtempSync(join(tmpdir(), "listboost-checkout-"));

process.env.LISTBOOST_NO_LISTEN = "true";
process.env.STRIPE_MOCK_CHECKOUT = "true";
process.env.DATA_DIR = tempDir;
process.env.NODE_ENV = " production\n";
process.env.APP_URL = ' "https://listboost-preview-production.up.railway.app\n" ';
process.env.STRIPE_SECRET_KEY = " sk_test_preview\n";
process.env.STRIPE_WEBHOOK_SECRET = " whsec_preview\n";
process.env.OPENAI_API_KEY = " sk-test-openai\n";
process.env.RESEND_API_KEY = " re_test\n";
process.env.EMAIL_FROM = ' "ListBoost <support@listboost.uk>" ';
process.env.SUPPORT_EMAIL = " support@listboost.uk\n";
process.env.ADMIN_EMAIL = " admin@listboost.uk\n";
process.env.ADMIN_PASSWORD = " secret\n";
process.env.REQUIRE_EMAIL_VERIFICATION = "false";
process.env.CREDIT_PACKS_JSON = JSON.stringify([
  { id: "starter", name: "Starter", credits: 50, pricePence: 500, label: "Try it", description: "Starter pack" },
  { id: "seller", name: "Seller", credits: 150, pricePence: 1200, label: "Best value", description: "Seller pack", featured: true },
  { id: "reseller", name: "Reseller", credits: 400, pricePence: 2500, label: "Power seller", description: "Reseller pack" }
]);

const moduleUnderTest = await import("../server.js");
const { server, trimConfiguredEnv, normalizeAppUrl } = moduleUnderTest;

function listen() {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close() {
  server.closeAllConnections?.();
  return new Promise((resolve) => server.close(resolve));
}

async function request(port, path, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    redirect: "manual",
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { text };
  }
  return { response, body };
}

test.after(async () => {
  if (server.listening) await close();
});

test("env loader trims URL and secret variables", () => {
  const env = {
    APP_URL: ' "https://example.com\n" ',
    OPENAI_API_KEY: " sk_test_openai\n",
    STRIPE_SECRET_KEY: "\tsk_test_secret ",
    STRIPE_WEBHOOK_SECRET: "'whsec_test\n'",
    RESEND_API_KEY: " re_123 ",
    EMAIL_FROM: ' "ListBoost <verify@example.com>" ',
    SUPPORT_EMAIL: " support@example.com\n",
    ADMIN_EMAIL: " admin@example.com ",
    ADMIN_PASSWORD: " password\n",
    DATA_DIR: " ./data\n",
    ANTHROPIC_API_KEY: " ant_test ",
    OPENAI_MODEL: " gpt-4.1-mini\n",
    OPENAI_VISION_MODEL: " gpt-4.1-mini "
  };
  trimConfiguredEnv(env);
  assert.equal(env.APP_URL, "https://example.com");
  assert.equal(env.STRIPE_SECRET_KEY, "sk_test_secret");
  assert.equal(env.STRIPE_WEBHOOK_SECRET, "whsec_test");
  assert.equal(env.EMAIL_FROM, "ListBoost <verify@example.com>");
  assert.equal(env.DATA_DIR, "./data");
  assert.equal(normalizeAppUrl(" https://example.com/\n"), "https://example.com");
});

test("checkout creates a Stripe URL for a valid pack and rejects invalid packs", async () => {
  const port = await listen();

  const signup = await request(port, "/api/signup", {
    method: "POST",
    body: JSON.stringify({ email: "buyer@example.com", password: "password123" })
  });
  assert.ok([200, 201].includes(signup.response.status));
  const cookie = signup.response.headers.get("set-cookie");
  assert.match(cookie, /lb_session=/);

  const valid = await request(port, "/api/create-checkout-session", {
    method: "POST",
    headers: { cookie },
    body: JSON.stringify({ packId: "starter" })
  });
  assert.equal(valid.response.status, 200);
  assert.equal(valid.body.packId, "starter");
  assert.match(valid.body.url, /^https:\/\/checkout\.stripe\.test\/session\/starter$/);

  const route = await request(port, "/checkout/seller", {
    method: "GET",
    headers: { cookie }
  });
  assert.equal(route.response.status, 303);
  assert.equal(route.response.headers.get("location"), "https://checkout.stripe.test/session/seller");

  const invalid = await request(port, "/api/create-checkout-session", {
    method: "POST",
    headers: { cookie },
    body: JSON.stringify({ packId: "not-real" })
  });
  assert.equal(invalid.response.status, 400);
  assert.match(invalid.body.error, /Unknown credit pack/);
});
