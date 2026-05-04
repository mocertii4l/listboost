import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";

const tempRoot = mkdtempSync(join(tmpdir(), "listboost-checkout-"));
const tempDir = join(tempRoot, "missing-data-dir");

process.env.LISTBOOST_NO_LISTEN = "true";
process.env.STRIPE_MOCK_CHECKOUT = "true";
process.env.DATA_DIR = tempDir;
process.env.NODE_ENV = " production\n";
process.env.APP_URL = ' "https://listboost-preview-production.up.railway.app\n" ';
process.env.STRIPE_SECRET_KEY = " sk_test_preview\n";
process.env.STRIPE_WEBHOOK_SECRET = " whsec_preview\n";
process.env.OPENAI_API_KEY = " sk-test-openai\n";
process.env.RESEND_API_KEY = " re_test\n";
process.env.RESEND_MOCK_EMAIL = "true";
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
const {
  server,
  trimConfiguredEnv,
  normalizeAppUrl,
  resolveDataDir,
  ensureDataDir,
  createPasswordResetToken,
  getPasswordResetCountForUser
} = moduleUnderTest;
const serverJs = readFileSync(new URL("../server.js", import.meta.url), "utf8");
const stripeForTests = new Stripe(process.env.STRIPE_SECRET_KEY);

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

async function stripeWebhook(port, event) {
  const payload = JSON.stringify(event);
  const signature = stripeForTests.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET
  });
  return request(port, "/api/stripe-webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: payload
  });
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

test("DATA_DIR is created and used when it does not exist", async () => {
  assert.equal(existsSync(tempDir), true);
  const port = await listen();
  const health = await request(port, "/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.body.checks.dataDir, tempDir);
  await close();
});

test("DATA_DIR resolution does not silently fall back", () => {
  assert.equal(resolveDataDir("/data").dataDir, "/data");
  const fallback = resolveDataDir("", tempRoot);
  assert.equal(fallback.dataDir, join(tempRoot, "data"));

  const filePath = join(tempRoot, "not-a-directory");
  writeFileSync(filePath, "x");
  assert.throws(
    () => ensureDataDir(resolveDataDir(filePath, tempRoot)),
    /DATA_DIR cannot be created or written/
  );
});

test("checkout success and cancel URLs are fixed from APP_URL", () => {
  const checkoutBlock = serverJs.match(/async function createCheckoutSession[\s\S]*?\n}\n/)?.[0] || "";
  assert.match(serverJs, /success_url:\s*`\$\{appUrl\}\/checkout\/success\?session_id=\{CHECKOUT_SESSION_ID\}`/);
  assert.match(serverJs, /cancel_url:\s*`\$\{appUrl\}\/checkout\/cancel`/);
  assert.doesNotMatch(checkoutBlock, /referer|referrer/i);
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
  await close();
});

test("subscription checkout starts monthly billing and webhook grants refill credits", async () => {
  const port = await listen();

  const signup = await request(port, "/api/signup", {
    method: "POST",
    body: JSON.stringify({ email: "subscriber@example.com", password: "password123" })
  });
  assert.equal(signup.response.status, 200);
  const cookie = signup.response.headers.get("set-cookie");
  const userId = signup.body.user.id;

  const checkout = await request(port, "/api/create-subscription-checkout-session", {
    method: "POST",
    headers: { cookie },
    body: JSON.stringify({ planId: "seller" })
  });
  assert.equal(checkout.response.status, 200);
  assert.equal(checkout.body.mode, "subscription");
  assert.equal(checkout.body.planId, "seller");
  assert.match(checkout.body.url, /^https:\/\/checkout\.stripe\.test\/subscription\/seller$/);

  const startEvent = await stripeWebhook(port, {
    id: "evt_subscription_start",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_subscription_seller",
        mode: "subscription",
        payment_status: "paid",
        client_reference_id: userId,
        customer: "cus_subscriber",
        subscription: "sub_seller",
        metadata: {
          userId,
          planId: "seller",
          credits: "150",
          billingType: "subscription"
        }
      }
    }
  });
  assert.equal(startEvent.response.status, 200);

  const afterStart = await request(port, "/api/billing", { headers: { cookie } });
  assert.equal(afterStart.response.status, 200);
  assert.equal(afterStart.body.subscription.plan, "seller");
  assert.equal(afterStart.body.subscription.status, "active");
  assert.equal(afterStart.body.credits.subscriptionCredits, 150);
  assert.equal(afterStart.body.credits.remaining, 155);
  assert.equal(afterStart.body.refills[0].credits, 150);

  const renewalEvent = await stripeWebhook(port, {
    id: "evt_subscription_renewal",
    type: "invoice.paid",
    data: {
      object: {
        id: "in_seller_renewal",
        billing_reason: "subscription_cycle",
        customer: "cus_subscriber",
        subscription: "sub_seller",
        subscription_details: {
          metadata: {
            userId,
            planId: "seller",
            credits: "150"
          }
        },
        lines: { data: [{ period: { end: 1819843200 } }] }
      }
    }
  });
  assert.equal(renewalEvent.response.status, 200);

  const afterRenewal = await request(port, "/api/billing", { headers: { cookie } });
  assert.equal(afterRenewal.response.status, 200);
  assert.equal(afterRenewal.body.credits.subscriptionCredits, 300);
  assert.equal(afterRenewal.body.credits.remaining, 305);
  assert.equal(afterRenewal.body.refills.length, 2);
  await close();
});

test("generation consumes credits and returns a paywall response at zero", async () => {
  const port = await listen();
  const oldOpenAi = process.env.OPENAI_API_KEY;
  const oldAnthropic = process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  try {
    const signup = await request(port, "/api/signup", {
      method: "POST",
      body: JSON.stringify({ email: "credit-use@example.com", password: "password123" })
    });
    assert.equal(signup.response.status, 200);
    const cookie = signup.response.headers.get("set-cookie");

    for (let index = 0; index < 5; index += 1) {
      const generated = await request(port, "/api/generate", {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({
          itemDetails: `Black Zara dress size 10 worn twice good condition ${index}`,
          tone: "clean",
          sellerMode: "clearout",
          negotiationGoal: "friendly"
        })
      });
      assert.equal(generated.response.status, 200);
      assert.equal(generated.body.credits.remaining, 4 - index);
      assert.match(generated.body.title, /Zara|dress|Vinted|Black/i);
    }

    const blocked = await request(port, "/api/generate", {
      method: "POST",
      headers: { cookie },
      body: JSON.stringify({ itemDetails: "Black Zara dress size 10 good condition" })
    });
    assert.equal(blocked.response.status, 402);
    assert.equal(blocked.body.credits.remaining, 0);
  } finally {
    process.env.OPENAI_API_KEY = oldOpenAi;
    if (oldAnthropic) process.env.ANTHROPIC_API_KEY = oldAnthropic;
    else delete process.env.ANTHROPIC_API_KEY;
    await close();
  }
});

test("demo generation works without signup and returns the submitted input", async () => {
  const port = await listen();
  const oldOpenAi = process.env.OPENAI_API_KEY;
  const oldAnthropic = process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  try {
    const demo = await request(port, "/api/demo-generate", {
      method: "POST",
      body: JSON.stringify({ itemDetails: "Black Zara dress size 10 worn twice good condition" })
    });
    assert.equal(demo.response.status, 200);
    assert.equal(demo.body.demo, true);
    assert.equal(demo.body.input.itemDetails, "Black Zara dress size 10 worn twice good condition");
    assert.match(demo.body.title, /Zara|Dress|Black/i);
  } finally {
    process.env.OPENAI_API_KEY = oldOpenAi;
    if (oldAnthropic) process.env.ANTHROPIC_API_KEY = oldAnthropic;
    else delete process.env.ANTHROPIC_API_KEY;
    await close();
  }
});

test("forgot and reset password flow is token based and single use", async () => {
  const port = await listen();
  const signup = await request(port, "/api/signup", {
    method: "POST",
    body: JSON.stringify({ email: "reset@example.com", password: "oldpass123" })
  });
  assert.equal(signup.response.status, 200);
  const userId = signup.body.user.id;

  const before = getPasswordResetCountForUser(userId);
  const forgot = await request(port, "/api/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email: "reset@example.com" })
  });
  assert.equal(forgot.response.status, 200);
  assert.match(forgot.body.message, /If an account exists/);
  assert.equal(getPasswordResetCountForUser(userId), before + 1);

  const invalid = await request(port, "/api/reset-password", {
    method: "POST",
    body: JSON.stringify({ token: "not-valid", password: "newpass123" })
  });
  assert.equal(invalid.response.status, 400);

  const token = createPasswordResetToken(userId);
  const valid = await request(port, `/api/reset-password/validate?token=${encodeURIComponent(token)}`);
  assert.equal(valid.response.status, 200);
  assert.equal(valid.body.valid, true);

  const reset = await request(port, "/api/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password: "newpass123" })
  });
  assert.equal(reset.response.status, 200);

  const reuse = await request(port, "/api/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password: "another123" })
  });
  assert.equal(reuse.response.status, 400);

  const login = await request(port, "/api/login", {
    method: "POST",
    body: JSON.stringify({ email: "reset@example.com", password: "newpass123" })
  });
  assert.equal(login.response.status, 200);
  await close();
});
