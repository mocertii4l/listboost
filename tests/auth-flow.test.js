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

// Convert a Headers object's Set-Cookie list into a single `Cookie:` header value
// by stripping attributes (everything after the first ';') and joining with `; `.
function cookieJarFromResponse(response) {
  const list = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : (response.headers.get("set-cookie") || "").split(/,(?=\s*[A-Za-z_][A-Za-z0-9_-]*=)/);
  return list
    .map((entry) => String(entry || "").split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
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
  // Backwards-compat: a `cookie` accessor that flattens Set-Cookie attrs.
  Object.defineProperty(response.headers, "cookie", {
    value: cookieJarFromResponse(response),
    configurable: true
  });
  return { response, body, text, cookie: cookieJarFromResponse(response) };
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
    const cookie = signup.cookie;
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

test("verified user can log out and log back in", async () => {
  const port = await listen();
  try {
    const ip = "10.0.0.10";
    const signup = await request(port, "/api/signup", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
      body: JSON.stringify({ name: "Round Trip", email: "round-trip@example.com", password: "password123" })
    });
    assert.equal(signup.response.status, 200);
    const signupCookie = signup.cookie;
    assert.match(signupCookie, /lb_session=/);

    // Pull out the session token and use it to read /api/me to confirm the user exists.
    const me1 = await request(port, "/api/me", { headers: { cookie: signupCookie } });
    assert.equal(me1.response.status, 200);
    assert.equal(me1.body.user.email, "round-trip@example.com");

    // Simulate clicking the verify link by hitting /verify with the most recent token.
    const moduleUnderTest = await import("../server.js");
    const verifyToken = moduleUnderTest.createVerificationToken(me1.body.user.id);
    const verify = await request(port, `/verify?token=${verifyToken}`, { headers: { cookie: signupCookie } });
    assert.equal(verify.response.status, 302);
    assert.match(verify.response.headers.get("location"), /^\/app\?verified=1$/);

    // Confirm /app is reachable for the verified, signed-in user.
    const app1 = await request(port, "/app/notes", { headers: { cookie: signupCookie } });
    // Static page is served directly (200) for verified signed-in users.
    assert.equal(app1.response.status, 200);

    // Log out — server should clear the cookie and delete the session row.
    const logout = await request(port, "/api/logout", { method: "POST", headers: { cookie: signupCookie } });
    assert.equal(logout.response.status, 200);
    const setCookieList = typeof logout.response.headers.getSetCookie === "function"
      ? logout.response.headers.getSetCookie()
      : [logout.response.headers.get("set-cookie") || ""];
    const lbCookie = setCookieList.find((c) => c.startsWith("lb_session=")) || "";
    assert.match(lbCookie, /lb_session=;/);
    assert.match(lbCookie, /Max-Age=0/);

    // Old session should now be unusable.
    const meAfterLogout = await request(port, "/api/me", { headers: { cookie: signupCookie } });
    assert.equal(meAfterLogout.response.status, 200);
    assert.equal(meAfterLogout.body.user, null);

    // Log back in with the same credentials. THIS is the previously-broken step.
    const login = await request(port, "/api/login", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
      body: JSON.stringify({ email: "round-trip@example.com", password: "password123" })
    });
    assert.equal(login.response.status, 200);
    assert.equal(login.body.user.email, "round-trip@example.com");
    assert.equal(login.body.user.emailVerified, true);
    const newCookie = login.cookie;
    assert.match(newCookie, /lb_session=/);

    // The new session must give /api/me access.
    const me2 = await request(port, "/api/me", { headers: { cookie: newCookie } });
    assert.equal(me2.response.status, 200);
    assert.equal(me2.body.user.email, "round-trip@example.com");
  } finally {
    await close();
  }
});

test("login is case-insensitive and trims whitespace around the email", async () => {
  const port = await listen();
  try {
    const ip = "10.0.0.20";
    await request(port, "/api/signup", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
      body: JSON.stringify({ name: "Case Tester", email: "case@example.com", password: "password123" })
    });
    const upper = await request(port, "/api/login", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
      body: JSON.stringify({ email: "CASE@example.com", password: "password123" })
    });
    assert.equal(upper.response.status, 200);
    assert.equal(upper.body.user.email, "case@example.com");

    const padded = await request(port, "/api/login", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
      body: JSON.stringify({ email: "  case@example.com  ", password: "password123" })
    });
    assert.equal(padded.response.status, 200);
    assert.equal(padded.body.user.email, "case@example.com");
  } finally {
    await close();
  }
});

test("login rejects wrong password and unknown email with the same opaque 401", async () => {
  const port = await listen();
  try {
    const ip = "10.0.0.30";
    await request(port, "/api/signup", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
      body: JSON.stringify({ name: "Auth Tester", email: "auth-tester@example.com", password: "rightpass1" })
    });

    const wrong = await request(port, "/api/login", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
      body: JSON.stringify({ email: "auth-tester@example.com", password: "wrongpass1" })
    });
    assert.equal(wrong.response.status, 401);
    assert.match(wrong.body.error, /Email or password is incorrect/i);

    const unknown = await request(port, "/api/login", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
      body: JSON.stringify({ email: "ghost@example.com", password: "rightpass1" })
    });
    assert.equal(unknown.response.status, 401);
    assert.equal(unknown.body.error, wrong.body.error, "wrong password and unknown email must return identical opaque 401");
  } finally {
    await close();
  }
});

test("logout deletes the session row but does not corrupt the user; new login works and cookie is browser-discardable", async () => {
  const port = await listen();
  try {
    const ip = "10.0.0.40";
    const signup = await request(port, "/api/signup", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
      body: JSON.stringify({ name: "Persist", email: "persist@example.com", password: "password123" })
    });
    assert.equal(signup.response.status, 200);
    const cookie = signup.cookie;
    const userId = signup.body.user.id;

    const logout = await request(port, "/api/logout", { method: "POST", headers: { cookie, "x-forwarded-for": ip } });
    const setCookieList = typeof logout.response.headers.getSetCookie === "function"
      ? logout.response.headers.getSetCookie()
      : [logout.response.headers.get("set-cookie") || ""];
    const lbCookie = setCookieList.find((c) => c.startsWith("lb_session=")) || "";
    // Cleared cookie must be HttpOnly, SameSite=Lax, Path=/, Max-Age=0, Expires in the past.
    assert.match(lbCookie, /lb_session=;/);
    assert.match(lbCookie, /Path=\//);
    assert.match(lbCookie, /HttpOnly/);
    assert.match(lbCookie, /SameSite=Lax/);
    assert.match(lbCookie, /Max-Age=0/);
    assert.match(lbCookie, /Expires=Thu, 01 Jan 1970/);

    // Login again must work (user row, password hash, verified flag must be intact).
    const login = await request(port, "/api/login", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
      body: JSON.stringify({ email: "persist@example.com", password: "password123" })
    });
    assert.equal(login.response.status, 200);
    assert.equal(login.body.user.id, userId, "user id must remain stable across logout/login");
    assert.equal(login.body.user.email, "persist@example.com");
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
    const ip = "10.0.0.99";
    const signup = await request(port, "/api/signup", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
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
      headers: { "x-forwarded-for": ip },
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
