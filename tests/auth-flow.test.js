import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const tempRoot = mkdtempSync(join(tmpdir(), "listboost-auth-"));

process.env.LISTBOOST_NO_LISTEN = "true";
process.env.DATA_DIR = tempRoot;
process.env.NODE_ENV = "development";
process.env.APP_URL = "http://localhost:3000";
process.env.REQUIRE_EMAIL_VERIFICATION = "true";
process.env.RESEND_API_KEY = "re_test";
process.env.EMAIL_FROM = "ListBoost <support@listboost.uk>";
process.env.RESEND_MOCK_EMAIL = "false";
process.env.STRIPE_MOCK_CHECKOUT = "true";
process.env.STRIPE_SECRET_KEY = "sk_test_auth";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_auth";

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  text: async () => "{}"
});
const { server } = await import("../server.js");

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
  const response = await realFetch(`http://127.0.0.1:${port}${path}`, {
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
  return { response, body, text };
}

test.after(async () => {
  if (server.listening) await close();
});

test("unverified users are held on verify-email and resend is limited to 60 seconds", async () => {
  const port = await listen();
  try {
    const signup = await request(port, "/api/signup", {
      method: "POST",
      body: JSON.stringify({ name: "Verify Seller", email: "verify@example.com", password: "password123" })
    });
    assert.equal(signup.response.status, 200);
    assert.equal(signup.body.user.name, "Verify Seller");
    assert.equal(signup.body.verificationRequired, true);
    assert.equal(signup.body.user.emailVerified, false);
    const cookie = signup.response.headers.get("set-cookie");
    assert.match(cookie, /lb_session=/);

    const app = await request(port, "/app/notes", { headers: { cookie } });
    assert.equal(app.response.status, 302);
    assert.match(app.response.headers.get("location"), /^\/verify-email\?next=/);

    const verifyPage = await request(port, "/verify-email", { headers: { cookie } });
    assert.equal(verifyPage.response.status, 200);
    assert.match(verifyPage.text, /Resend verification email/);
    assert.match(verifyPage.text, /js-email/);

    const firstResend = await request(port, "/api/resend-verification", {
      method: "POST",
      headers: { cookie }
    });
    assert.equal(firstResend.response.status, 200);

    const secondResend = await request(port, "/api/resend-verification", {
      method: "POST",
      headers: { cookie }
    });
    assert.equal(secondResend.response.status, 429);
    assert.equal(secondResend.body.retryAfterSec <= 60, true);
  } finally {
    await close();
  }
});

test("password reset email failures are logged without exposing account existence", async () => {
  const port = await listen();
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const errors = [];
  try {
    const signup = await request(port, "/api/signup", {
      method: "POST",
      body: JSON.stringify({ name: "Reset Seller", email: "reset-log@example.com", password: "password123" })
    });
    assert.equal(signup.response.status, 200);

    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      text: async () => "resend down"
    });
    console.error = (...args) => errors.push(args.map(String).join(" "));

    const forgot = await request(port, "/api/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: "reset-log@example.com" })
    });
    assert.equal(forgot.response.status, 200);
    assert.match(forgot.body.message, /If an account exists/);
    assert.equal(errors.some((line) => line.includes("[email] password reset send failed")), true);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
    await close();
  }
});
