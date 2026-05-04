import "dotenv/config";
import { createServer } from "node:http";
import { createHash, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { accessSync, constants as fsConstants, existsSync, mkdirSync, statSync } from "node:fs";
import { extname, isAbsolute, join, normalize } from "node:path";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import Stripe from "stripe";
import Database from "better-sqlite3";

const TRIMMED_ENV_KEYS = [
  "APP_URL",
  "OPENAI_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "SUPPORT_EMAIL",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "DATA_DIR",
  "ANTHROPIC_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_VISION_MODEL",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_VISION_MODEL",
  "CREDIT_PACKS_JSON",
  "NODE_ENV",
  "REQUIRE_EMAIL_VERIFICATION"
];

const rawDataDirEnv = process.env.DATA_DIR ?? "";

function cleanEnvValue(value) {
  let next = String(value ?? "").trim();
  if (
    next.length >= 2
    && ((next.startsWith('"') && next.endsWith('"')) || (next.startsWith("'") && next.endsWith("'")))
  ) {
    next = next.slice(1, -1).trim();
  }
  return next;
}

function trimConfiguredEnv(env = process.env) {
  for (const key of TRIMMED_ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(env, key)) {
      env[key] = cleanEnvValue(env[key]);
    }
  }
  return env;
}

trimConfiguredEnv();

function resolveDataDir(rawValue = process.env.DATA_DIR, cwd = process.cwd()) {
  const raw = rawValue == null ? "" : String(rawValue);
  const trimmed = cleanEnvValue(raw);
  const explicit = trimmed.length > 0;
  const resolved = explicit
    ? (isAbsolute(trimmed) ? trimmed : join(cwd, trimmed))
    : join(cwd, "data");
  return { raw, trimmed, explicit, dataDir: resolved };
}

function ensureDataDir(resolution) {
  try {
    mkdirSync(resolution.dataDir, { recursive: true });
    const stat = statSync(resolution.dataDir);
    if (!stat.isDirectory()) {
      throw new Error("resolved path is not a directory");
    }
    accessSync(resolution.dataDir, fsConstants.W_OK);
    return {
      ...resolution,
      exists: existsSync(resolution.dataDir),
      writable: true
    };
  } catch (error) {
    const source = resolution.explicit ? "DATA_DIR" : "local ./data fallback";
    throw new Error(`[launch-check] ${source} cannot be created or written at "${resolution.dataDir}": ${error.message}`);
  }
}

const port = Number(process.env.PORT || 3000);
const publicDir = join(process.cwd(), "public");
const dataDirDiagnostics = ensureDataDir(resolveDataDir(rawDataDirEnv));
const dataDirEnv = dataDirDiagnostics.trimmed;
const dataDir = dataDirDiagnostics.dataDir;
const usagePath = join(dataDir, "usage.json");
const dbPath = join(dataDir, "listboost.db");
const freeCredits = Number(process.env.FREE_CREDITS || 5);
const creditPackSize = Number(process.env.CREDIT_PACK_SIZE || 50);
const creditPackPricePence = Number(process.env.CREDIT_PACK_PRICE_PENCE || 500);
const creditPacks = buildCreditPacks();
const subscriptionPlans = buildSubscriptionPlans();
const appUrl = normalizeAppUrl(process.env.APP_URL || `http://localhost:${port}`);
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-02-25.clover" }) : null;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const isProduction = process.env.NODE_ENV === "production";
const requireEmailVerification = process.env.REQUIRE_EMAIL_VERIFICATION !== "false";
const adminEmail = String(process.env.ADMIN_EMAIL || "").toLowerCase();
const adminPassword = String(process.env.ADMIN_PASSWORD || "");
const resendApiKey = String(process.env.RESEND_API_KEY || "");
const emailFrom = String(process.env.EMAIL_FROM || "ListBoost <onboarding@resend.dev>");
const supportEmail = String(process.env.SUPPORT_EMAIL || "hello@listboost.app");
if (isProduction && !dataDirDiagnostics.explicit) {
  console.warn("[launch-check] DATA_DIR is unset in production. Using local ./data; configure persistent storage to avoid losing SQLite data.");
}

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

function buildCreditPacks() {
  const fallback = [
    {
      id: "starter",
      name: "Starter",
      credits: 50,
      pricePence: 500,
      label: "Try it",
      description: "A practical first pack for a wardrobe clear-out or first seller test."
    },
    {
      id: "seller",
      name: "Seller",
      credits: 150,
      pricePence: 1200,
      label: "Best value",
      description: "The best value pack for regular Vinted sellers listing every week.",
      featured: true
    },
    {
      id: "reseller",
      name: "Reseller",
      credits: 400,
      pricePence: 2500,
      label: "Power seller",
      description: "For bulk listing sessions, serious resellers and repeat sellers."
    }
  ];

  if (!process.env.CREDIT_PACKS_JSON) return fallback;

  try {
    const parsed = JSON.parse(process.env.CREDIT_PACKS_JSON);
    const packs = Array.isArray(parsed) ? parsed : [];
    const clean = packs
      .map((pack) => ({
        id: String(pack.id || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, ""),
        name: String(pack.name || "").trim(),
        credits: Number(pack.credits),
        pricePence: Number(pack.pricePence),
        label: String(pack.label || "").trim(),
        description: String(pack.description || "").trim(),
        featured: Boolean(pack.featured)
      }))
      .filter((pack) => pack.id && pack.name && Number.isFinite(pack.credits) && pack.credits > 0 && Number.isFinite(pack.pricePence) && pack.pricePence > 0);
    return clean.length ? clean.slice(0, 6) : fallback;
  } catch (error) {
    console.warn("[launch-check] CREDIT_PACKS_JSON is invalid. Using default credit packs.");
    return fallback;
  }
}

function normalizeAppUrl(value) {
  return cleanEnvValue(value).replace(/\/+$/, "");
}

function publicCreditPacks() {
  return creditPacks.map((pack) => ({
    id: pack.id,
    name: pack.name,
    credits: pack.credits,
    pricePence: pack.pricePence,
    price: `GBP ${(pack.pricePence / 100).toFixed(2).replace(/\.00$/, "")}`,
    label: pack.label,
    description: pack.description,
    featured: Boolean(pack.featured)
  }));
}

function buildSubscriptionPlans() {
  const fallback = [
    {
      id: "starter",
      name: "Starter",
      credits: 50,
      pricePence: 500,
      label: "Monthly starter",
      description: "For occasional sellers who want a steady monthly listing rhythm.",
      priceEnv: "STRIPE_PRICE_STARTER_MONTHLY"
    },
    {
      id: "seller",
      name: "Seller",
      credits: 150,
      pricePence: 1200,
      label: "Best value",
      description: "For active sellers who list every week and want credits ready.",
      featured: true,
      priceEnv: "STRIPE_PRICE_SELLER_MONTHLY"
    },
    {
      id: "reseller",
      name: "Reseller",
      credits: 400,
      pricePence: 2500,
      label: "Bulk seller",
      description: "For resellers running larger batches and repeat listing sessions.",
      priceEnv: "STRIPE_PRICE_RESELLER_MONTHLY"
    }
  ];

  if (!process.env.SUBSCRIPTION_PLANS_JSON) return fallback.map(withSubscriptionPriceId);

  try {
    const parsed = JSON.parse(process.env.SUBSCRIPTION_PLANS_JSON);
    const plans = Array.isArray(parsed) ? parsed : [];
    const clean = plans
      .map((plan) => ({
        id: String(plan.id || "").trim().toLowerCase(),
        name: String(plan.name || "").trim(),
        credits: Number(plan.credits),
        pricePence: Number(plan.pricePence),
        label: String(plan.label || "").trim(),
        description: String(plan.description || "").trim(),
        featured: Boolean(plan.featured),
        priceEnv: String(plan.priceEnv || "").trim(),
        priceId: String(plan.priceId || "").trim()
      }))
      .filter((plan) => plan.id && plan.name && Number.isFinite(plan.credits) && plan.credits > 0 && Number.isFinite(plan.pricePence) && plan.pricePence > 0);
    return clean.length ? clean.map(withSubscriptionPriceId) : fallback.map(withSubscriptionPriceId);
  } catch {
    console.warn("[launch-check] SUBSCRIPTION_PLANS_JSON is invalid. Using default subscription plans.");
    return fallback.map(withSubscriptionPriceId);
  }
}

function withSubscriptionPriceId(plan) {
  return {
    ...plan,
    priceId: plan.priceId || (plan.priceEnv ? cleanEnvValue(process.env[plan.priceEnv] || "") : "")
  };
}

function publicSubscriptionPlans() {
  return subscriptionPlans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    credits: plan.credits,
    pricePence: plan.pricePence,
    price: `GBP ${(plan.pricePence / 100).toFixed(2).replace(/\.00$/, "")}`,
    interval: "month",
    label: plan.label,
    description: plan.description,
    featured: Boolean(plan.featured)
  }));
}

function findCreditPack(packId) {
  const requestedPackId = String(packId || "").trim().toLowerCase();
  if (!requestedPackId) return creditPacks.find((item) => item.featured) || creditPacks[0];
  return creditPacks.find((item) => item.id === requestedPackId) || null;
}

function findSubscriptionPlan(planId) {
  const requestedPlanId = String(planId || "").trim().toLowerCase();
  if (!requestedPlanId) return subscriptionPlans.find((item) => item.featured) || subscriptionPlans[0];
  return subscriptionPlans.find((item) => item.id === requestedPlanId) || null;
}

function publicSubscriptionForUser(user) {
  const planId = user?.subscription_plan || "free";
  const plan = findSubscriptionPlan(planId);
  return {
    plan: planId,
    planName: plan ? plan.name : "Free",
    status: user?.subscription_status || "inactive",
    credits: Number(user?.subscription_credits || 0),
    nextCreditRefill: user?.next_credit_refill || null,
    stripeSubscriptionId: user?.stripe_subscription_id || null
  };
}

function pricePenceForCredits(credits) {
  const pack = creditPacks.find((item) => Number(item.credits) === Number(credits));
  return Number(pack?.pricePence || 0);
}

function formatPence(pence) {
  return `GBP ${(Number(pence || 0) / 100).toFixed(2).replace(/\.00$/, "")}`;
}

async function createCheckoutSession({ user, pack }) {
  if (process.env.STRIPE_MOCK_CHECKOUT === "true") {
    return { url: `https://checkout.stripe.test/session/${pack.id}` };
  }

  return stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: user.id,
    metadata: {
      userId: user.id,
      credits: String(pack.credits),
      packId: pack.id,
      billingType: "credits"
    },
    line_items: [
      {
        price_data: {
          currency: "gbp",
          product_data: {
            name: `${pack.credits} ListBoost credits`,
            description: pack.description || "Credits for Vinted listing generation and buyer replies."
          },
          unit_amount: pack.pricePence
        },
        quantity: 1
      }
    ],
    success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/checkout/cancel`
  });
}

function subscriptionLineItem(plan) {
  if (plan.priceId) return { price: plan.priceId, quantity: 1 };
  return {
    price_data: {
      currency: "gbp",
      product_data: {
        name: `ListBoost ${plan.name}`,
        description: plan.description || "Monthly ListBoost credits for Vinted sellers."
      },
      recurring: { interval: "month" },
      unit_amount: plan.pricePence
    },
    quantity: 1
  };
}

async function createSubscriptionCheckoutSession({ user, plan }) {
  if (process.env.STRIPE_MOCK_CHECKOUT === "true") {
    return { url: `https://checkout.stripe.test/subscription/${plan.id}` };
  }

  return stripe.checkout.sessions.create({
    mode: "subscription",
    client_reference_id: user.id,
    customer: user.stripe_customer_id || undefined,
    customer_email: user.stripe_customer_id ? undefined : user.email,
    metadata: {
      userId: user.id,
      planId: plan.id,
      credits: String(plan.credits),
      billingType: "subscription"
    },
    subscription_data: {
      metadata: {
        userId: user.id,
        planId: plan.id,
        credits: String(plan.credits)
      }
    },
    line_items: [subscriptionLineItem(plan)],
    success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/checkout/cancel`
  });
}
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    free_credits INTEGER NOT NULL DEFAULT ${freeCredits},
    paid_credits INTEGER NOT NULL DEFAULT 0,
    used_credits INTEGER NOT NULL DEFAULT 0,
    subscription_plan TEXT NOT NULL DEFAULT 'free',
    subscription_status TEXT NOT NULL DEFAULT 'inactive',
    subscription_credits INTEGER NOT NULL DEFAULT 0,
    next_credit_refill TEXT,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS payments (
    stripe_session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    credits INTEGER NOT NULL,
    processed_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS generations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS email_verifications (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS credit_audit (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    actor TEXT NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS subscription_refills (
    stripe_invoice_id TEXT PRIMARY KEY,
    stripe_subscription_id TEXT,
    user_id TEXT NOT NULL,
    plan TEXT NOT NULL,
    credits INTEGER NOT NULL,
    processed_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

const columnAdditions = [
  ["generations", "score", "INTEGER"],
  ["generations", "result_json", "TEXT"],
  ["users", "email_verified", "INTEGER NOT NULL DEFAULT 0"],
  ["users", "subscription_plan", "TEXT NOT NULL DEFAULT 'free'"],
  ["users", "subscription_status", "TEXT NOT NULL DEFAULT 'inactive'"],
  ["users", "subscription_credits", "INTEGER NOT NULL DEFAULT 0"],
  ["users", "next_credit_refill", "TEXT"],
  ["users", "stripe_customer_id", "TEXT"],
  ["users", "stripe_subscription_id", "TEXT"]
];
for (const [table, column, type] of columnAdditions) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!existing.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const tones = new Set(["uk-casual", "clean", "premium", "friendly", "quick-sale", "reseller"]);
const sellerModes = new Set(["clearout", "profit", "premium", "bundle", "kids"]);
const negotiationGoals = new Set(["polite-firm", "friendly", "urgent-close", "accept", "counter", "reject"]);

function json(res, status, data, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(data));
}

function readBody(req, maxBytes = 100_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error("Request is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function readRawBody(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Request is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const maxPhotos = 4;
const maxPhotoBodyBytes = 12_000_000;

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return Object.fromEntries(
    raw
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)])
  );
}

function createCookie(name, value, options = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${options.maxAge ?? 31536000}`
  ];
  if (isProduction) parts.push("Secure");
  if (options.clear) parts.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  return parts.join("; ");
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

const rateLimitBuckets = new Map();
function rateLimit(key, { max, windowMs }) {
  const now = Date.now();
  const entry = rateLimitBuckets.get(key);
  if (!entry || entry.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (entry.count >= max) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  entry.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitBuckets) {
    if (entry.resetAt <= now) rateLimitBuckets.delete(key);
  }
}, 60_000).unref?.();

function tooManyRequests(res, visitor, retryAfterSec, message) {
  json(res, 429, { error: message || "Too many requests. Try again shortly." }, {
    ...visitor.headers,
    "retry-after": String(retryAfterSec)
  });
}

function recordAudit(userId, actor, delta, reason) {
  db.prepare(
    "INSERT INTO credit_audit (id, user_id, actor, delta, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(randomUUID(), userId, actor, delta, reason, new Date().toISOString());
}

function getVisitor(req) {
  const cookies = parseCookies(req);
  const existing = cookies.lf_vid && /^[a-z0-9-]{16,80}$/i.test(cookies.lf_vid) ? cookies.lf_vid : null;
  const id = existing || randomUUID();
  const headers = existing ? {} : { "set-cookie": createCookie("lf_vid", id) };
  return { id, headers };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `pbkdf2$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [method, salt, hash] = String(stored || "").split("$");
  if (method !== "pbkdf2" || !salt || !hash) return false;
  const attempt = pbkdf2Sync(password, salt, 120000, 32, "sha256");
  const expected = Buffer.from(hash, "hex");
  return expected.length === attempt.length && timingSafeEqual(expected, attempt);
}

function createSession(userId) {
  const token = randomUUID() + randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);
  db.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(token, userId, now.toISOString(), expires.toISOString());
  return token;
}

function getUserBySession(req) {
  const cookies = parseCookies(req);
  if (!cookies.lb_session) return null;

  const row = db.prepare(`
    SELECT users.*
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ? AND sessions.expires_at > ?
  `).get(cookies.lb_session, new Date().toISOString());

  return row || null;
}

function authHeaders(token) {
  return { "set-cookie": createCookie("lb_session", token, { maxAge: 60 * 60 * 24 * 30 }) };
}

function clearAuthHeaders() {
  return { "set-cookie": createCookie("lb_session", "", { clear: true, maxAge: 0 }) };
}

async function loadUsage() {
  try {
    return JSON.parse(await readFile(usagePath, "utf8"));
  } catch {
    return {};
  }
}

async function saveUsage(usage) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(usagePath, JSON.stringify(usage, null, 2));
}

function getCredits(usage, visitorId) {
  const account = usage[visitorId] || {};
  const used = Number(account.used || 0);
  const paidCredits = Number(account.paidCredits || 0);
  const totalCredits = freeCredits + paidCredits;
  return {
    freeCredits,
    paidCredits,
    totalCredits,
    used,
    remaining: Math.max(totalCredits - used, 0),
    packSize: creditPackSize,
    packPricePence: creditPackPricePence
  };
}

function getAccountCredits(user) {
  const free = Number(user.free_credits || 0);
  const paid = Number(user.paid_credits || 0);
  const subscription = Number(user.subscription_credits || 0);
  const used = Number(user.used_credits || 0);
  const total = free + paid + subscription;
  return {
    freeCredits: free,
    paidCredits: paid,
    subscriptionCredits: subscription,
    totalCredits: total,
    used,
    remaining: Math.max(total - used, 0),
    packSize: creditPackSize,
    packPricePence: creditPackPricePence,
    subscriptionPlan: user.subscription_plan || "free",
    subscriptionStatus: user.subscription_status || "inactive",
    nextCreditRefill: user.next_credit_refill || null
  };
}

function publicUser(user) {
  return user ? {
    id: user.id,
    email: user.email,
    emailVerified: Boolean(user.email_verified),
    subscriptionPlan: user.subscription_plan || "free",
    subscriptionStatus: user.subscription_status || "inactive",
    subscriptionCredits: Number(user.subscription_credits || 0),
    nextCreditRefill: user.next_credit_refill || null
  } : null;
}

function getAiProvider() {
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "demo";
}

function getLaunchChecks() {
  const missing = [];
  if (!isProduction) missing.push("NODE_ENV is not 'production'.");
  if (isProduction && !appUrl.startsWith("https://")) missing.push("APP_URL must be an https:// URL.");
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) missing.push("OPENAI_API_KEY (or ANTHROPIC_API_KEY) is not set.");
  if (!stripe) missing.push("STRIPE_SECRET_KEY is not set.");
  if (stripe && !stripeWebhookSecret) missing.push("STRIPE_WEBHOOK_SECRET is not set.");
  if (requireEmailVerification && !resendApiKey) missing.push("RESEND_API_KEY is not set (REQUIRE_EMAIL_VERIFICATION=true).");
  if (!adminEmail) missing.push("ADMIN_EMAIL is not set.");
  if (!adminPassword) missing.push("ADMIN_PASSWORD is not set.");

  const productionReady = isProduction && missing.length === 0;
  return {
    nodeEnv: process.env.NODE_ENV || "development",
    appUrl,
    dataDir,
    dataDirRaw: dataDirDiagnostics.raw,
    dataDirTrimmed: dataDirDiagnostics.trimmed,
    dataDirExplicit: dataDirDiagnostics.explicit,
    dataDirExists: dataDirDiagnostics.exists,
    dataDirWritable: dataDirDiagnostics.writable,
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    stripeConfigured: Boolean(stripe),
    stripeWebhookConfigured: Boolean(stripeWebhookSecret),
    emailVerificationRequired: requireEmailVerification,
    emailSenderConfigured: Boolean(resendApiKey),
    adminConfigured: Boolean(adminEmail && adminPassword),
    database: "sqlite",
    missing,
    productionReady
  };
}

function logLaunchChecks() {
  const checks = getLaunchChecks();
  const warnings = [];
  console.log(`[launch-check] DATA_DIR raw=${JSON.stringify(dataDirDiagnostics.raw)} trimmed=${JSON.stringify(dataDirDiagnostics.trimmed)} resolved=${dataDirDiagnostics.dataDir} exists=${dataDirDiagnostics.exists} writable=${dataDirDiagnostics.writable}`);
  if (isProduction && !appUrl.startsWith("https://")) warnings.push("APP_URL should be an https:// production URL.");
  if (!checks.openaiConfigured && !checks.anthropicConfigured) warnings.push("No AI API key configured. App will run in demo mode.");
  if (stripe && !stripeWebhookSecret) warnings.push("STRIPE_WEBHOOK_SECRET is missing. Paid credits will remain pending until the webhook is configured.");
  if (requireEmailVerification && !resendApiKey) warnings.push("RESEND_API_KEY is missing. Verification links will only be logged, not emailed.");
  if (!adminEmail || !adminPassword) warnings.push("ADMIN_EMAIL / ADMIN_PASSWORD not set. /admin will return 401.");
  for (const warning of warnings) console.warn(`[launch-check] ${warning}`);
}

function buildPrompt({ tone, itemDetails, category, size, condition, buyerQuestion, sellerMode, negotiationGoal }) {
  return [
    "You are Vinted Listing Booster, a conversion-focused resale listing assistant for Vinted sellers.",
    "Rewrite rough seller notes into a listing that is accurate, searchable, buyer-friendly, safe, and easy to trust.",
    "TITLE: write a short Vinted-style title under 70 characters. Make it keyword-rich with brand, colour, item type, size, and condition only when provided.",
    "The description must be copy-paste ready: one short opening line, then concise bullet-style lines for size, condition, colour/material, flaws, postage, and fit only when the seller gave those facts.",
    "DESCRIPTION: use clean bullet-style lines, no fluff, no emojis, no markdown tables. Make each line easy to paste into Vinted.",
    "PRICE: use realistic UK resale pricing in GBP for Vinted. Include a short reason in priceGuidance.",
    "KEYWORDS: include strong plain search terms buyers would actually type. No hashtags.",
    "BUYER REPLY: write in a natural UK seller tone. Friendly, honest, concise, and useful.",
    "Use UK spelling and practical postage wording only when provided by the seller.",
    "Give a listing score out of 100 and explain what would improve it before posting.",
    "Give three price options: fastSale, fairPrice, maxPrice. Also include lowestOffer, startPrice, autoCounterOffer, and bundleDiscount.",
    "Include buyer replies for common Vinted messages, offers, postage questions, authenticity questions, and condition questions.",
    "If the seller provided a buyer message, write one specific reply that answers the buyer clearly, stays honest, and gently helps close the sale.",
    "SAFE-SELLING RULES (strict):",
    "- Do NOT claim authenticity, genuine, original, or designer unless the seller explicitly stated that fact.",
    "- Do NOT claim brand new, unworn, mint, or flawless unless the seller explicitly stated that fact.",
    "- Do NOT promise next-day or same-day postage unless the seller explicitly stated that fact.",
    "- If brand, size, condition, postage speed, or authenticity is uncertain, leave the related field empty in the description and add a clear entry to missingDetails.",
    "Return ONLY a single JSON object that conforms to the JSON shape below. No prose, no markdown fences, no commentary.",
    "",
    "JSON shape:",
    "{",
    '  "title": "string",',
    '  "description": "string",',
    '  "tags": ["string"],',
    '  "searchTerms": ["string"],',
    '  "listingScore": { "score": 0, "summary": "string", "improvements": ["string"] },',
    '  "priceOptions": { "fastSale": "string", "fairPrice": "string", "maxPrice": "string", "lowestOffer": "string", "startPrice": "string", "autoCounterOffer": "string", "bundleDiscount": "string" },',
    '  "priceGuidance": "string",',
    '  "photoChecklist": ["string"],',
    '  "buyerQuestionReply": "string",',
    '  "buyerReplies": ["string"],',
    '  "missingDetails": ["string"]',
    "}",
    "",
    "Platform: Vinted",
    `Tone: ${tone}`,
    `Seller mode: ${sellerMode}`,
    `Negotiation goal: ${negotiationGoal}`,
    `Category: ${category || "not provided"}`,
    `Size: ${size || "not provided"}`,
    `Condition: ${condition || "not provided"}`,
    `Rough seller notes: ${itemDetails}`,
    `Buyer message to answer: ${buyerQuestion || "not provided"}`
  ].join("\n");
}

function parseGeneratedJson(text) {
  if (text == null) throw new Error("Empty model response");
  const trimmed = String(text).trim();
  const cleaned = trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("Model response was not valid JSON");
  }
}

function looksLikeListing(result) {
  if (!result || typeof result !== "object") return false;
  if (typeof result.title !== "string") return false;
  if (typeof result.description !== "string") return false;
  return true;
}

async function callWithJsonRetry(fn) {
  try {
    const result = await fn(false);
    if (!looksLikeListing(result)) throw new Error("Model response missing required fields");
    return result;
  } catch (firstError) {
    console.warn("Model JSON parse failed, retrying once:", firstError.message);
    const result = await fn(true);
    if (!looksLikeListing(result)) {
      throw new Error("Model response missing required fields after retry");
    }
    return result;
  }
}

function sampleResult({ tone, itemDetails, category, size, condition, buyerQuestion }) {
  const firstLine = itemDetails.split(/\r?\n/).find(Boolean) || "your item";
  const concise = firstLine.replace(/[^\w\s.'&-]/g, "").trim().slice(0, 64) || "Quality Item";
  const titleCore = /zara|dress|size|black/i.test(concise)
    ? "Black Zara Midi Dress UK 10"
    : `${concise} UK ${size || ""}`.replace(/\s+/g, " ").trim();

  return {
    title: titleCore,
    description: [
      `Lovely ${titleCore.toLowerCase()} in a clean, easy-to-style look.`,
      `Size: ${size || "please confirm before posting"}`,
      `Condition: ${condition || "good preloved condition"}`,
      "Colour: black",
      "Great for evenings, workwear or a simple capsule wardrobe outfit.",
      "Happy to answer questions or send extra photos before you buy."
    ].join("\n"),
    tags: ["zara dress", "black midi dress", "uk 10", "preloved", "minimal style"],
    searchTerms: ["zara black dress", "black midi dress", "size 10 dress", "vinted uk", "capsule wardrobe"],
    listingScore: {
      score: 88,
      summary: "Clear, searchable and ready to paste after a quick final check.",
      improvements: ["Add a label photo", "Show the full length on a hanger", "Photograph any wear in natural light"]
    },
    priceOptions: {
      fastSale: "GBP 8",
      fairPrice: "GBP 12",
      maxPrice: "GBP 15",
      lowestOffer: "GBP 9",
      startPrice: "GBP 14",
      autoCounterOffer: "GBP 11",
      bundleDiscount: "10%"
    },
    priceGuidance: "Start around GBP 14 and expect serious buyers near GBP 10-12. Price lower if you want a same-week sale.",
    photoChecklist: [
      "Full front photo in natural light",
      "Back view showing the length and shape",
      "Close-up of Zara label and size tag",
      "Any marks or fabric wear shown clearly"
    ],
    buyerQuestionReply: buyerQuestion
      ? "Hi, yes it is still available. It is in good condition and I am happy to send an extra close-up if helpful."
      : "",
    buyerReplies: [
      "Hi, yes it is still available. I can post after payment and I am happy to send another photo if helpful.",
      "Thanks for the offer. I could meet you at GBP 11 if you are ready to buy today.",
      "It has only light signs of wear from normal use, but please check the photos before buying."
    ],
    missingDetails: ["Exact size or dimensions", "Brand/model", "Condition details", "Shipping or collection options"],
    provider: "demo"
  };
}

async function generateWithOpenAI(input) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const basePrompt = buildPrompt(input);
  return callWithJsonRetry(async (isRetry) => {
    const prompt = isRetry
      ? `${basePrompt}\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY a single JSON object matching the shape above. No prose. No code fences.`
      : basePrompt;
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: prompt,
      temperature: isRetry ? 0.2 : 0.4,
      text: { format: { type: "json_object" } }
    });
    return parseGeneratedJson(response.output_text);
  });
}

async function generateWithAnthropic(input) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const basePrompt = buildPrompt(input);
  return callWithJsonRetry(async (isRetry) => {
    const prompt = isRetry
      ? `${basePrompt}\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY a single JSON object matching the shape above. No prose. No code fences.`
      : basePrompt;
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest",
      max_tokens: 1200,
      temperature: isRetry ? 0.2 : 0.4,
      messages: [{ role: "user", content: prompt }]
    });
    const text = response.content.map((part) => (part.type === "text" ? part.text : "")).join("");
    return parseGeneratedJson(text);
  });
}

function buildVisionPrompt({ tone, notes, category, size, condition, sellerMode, negotiationGoal, photoCount }) {
  return [
    "You are Vinted Listing Booster, a conversion-focused resale listing assistant for Vinted sellers.",
    `Examine the ${photoCount} attached photo(s) of a single item carefully and identify the item from what you can actually see.`,
    "Extract these facts ONLY when clearly visible: itemType, dominantColor, brand, sizeLabel, apparent condition cues, visible flaws, style keywords.",
    "STRICT VISION SAFETY RULES - these override every other instruction:",
    "- If a brand logo or printed brand label is NOT clearly legible in the photos, leave brand as an empty string \"\" and add a missingDetails entry like 'Brand not visible - confirm before posting'.",
    "- If a size label or printed size tag is NOT clearly legible in the photos, leave sizeLabel as an empty string \"\" and add a missingDetails entry like 'Size label not visible - confirm before posting'.",
    "- Do NOT claim authenticity, genuine, original, or designer in the title, description, tags, or anywhere else. You cannot verify authenticity from a photo.",
    "- Do NOT claim 'no flaws', 'flawless', 'mint', 'perfect condition', or 'as new' unless the photos clearly show this and even then prefer cautious wording (for example 'no visible marks in photos').",
    "- Do NOT promise next-day or same-day postage. Only mention postage speed if the seller stated it in their notes.",
    "- Anything you are not sure about MUST go into missingDetails as a short instruction to the seller (e.g., 'Confirm size by photographing the size tag').",
    "If the seller provided extra notes, you may use them, but never override what photos clearly show, and never use them to claim brand or authenticity.",
    "Write in authentic UK Vinted style. Use UK spelling, GBP pricing, and practical postage wording.",
    "Include Vinted-friendly search terms as plain keywords, not hashtags.",
    "Give a listing score out of 100 and explain what would improve it before posting.",
    "Give three price options: fastSale, fairPrice, maxPrice. Also include lowestOffer, startPrice, autoCounterOffer, and bundleDiscount.",
    "Return ONLY a single JSON object that conforms to the JSON shape below. No prose, no markdown fences, no commentary.",
    "",
    "JSON shape:",
    "{",
    '  "title": "string",',
    '  "description": "string",',
    '  "tags": ["string"],',
    '  "searchTerms": ["string"],',
    '  "listingScore": { "score": 0, "summary": "string", "improvements": ["string"] },',
    '  "priceOptions": { "fastSale": "string", "fairPrice": "string", "maxPrice": "string", "lowestOffer": "string", "startPrice": "string", "autoCounterOffer": "string", "bundleDiscount": "string" },',
    '  "priceGuidance": "string",',
    '  "photoChecklist": ["string"],',
    '  "buyerReplies": ["string"],',
    '  "missingDetails": ["string"],',
    '  "extractedFromPhotos": { "itemType": "string", "color": "string", "brand": "string", "sizeLabel": "string", "condition": "string", "flaws": ["string"], "styleKeywords": ["string"] }',
    "}",
    "",
    "Platform: Vinted",
    `Tone: ${tone}`,
    `Seller mode: ${sellerMode}`,
    `Negotiation goal: ${negotiationGoal}`,
    `Category hint: ${category || "not provided"}`,
    `Seller-provided size: ${size || "not provided"}`,
    `Seller-provided condition: ${condition || "not provided"}`,
    `Extra seller notes: ${notes || "none"}`
  ].join("\n");
}

function parseDataUrl(dataUrl) {
  const match = /^data:([a-z]+\/[a-z0-9+.-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl || "").trim());
  if (!match) return null;
  const mime = match[1].toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime)) return null;
  return { mime, base64: match[2], dataUrl: String(dataUrl) };
}

async function generateFromPhotosWithOpenAI(input, photos) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const basePrompt = buildVisionPrompt({ ...input, photoCount: photos.length });
  return callWithJsonRetry(async (isRetry) => {
    const text = isRetry
      ? `${basePrompt}\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY a single JSON object matching the shape above. No prose. No code fences.`
      : basePrompt;
    const content = [
      { type: "input_text", text },
      ...photos.map((p) => ({ type: "input_image", image_url: p.dataUrl }))
    ];
    const response = await client.responses.create({
      model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [{ role: "user", content }],
      temperature: isRetry ? 0.2 : 0.4,
      text: { format: { type: "json_object" } }
    });
    return parseGeneratedJson(response.output_text);
  });
}

async function generateFromPhotosWithAnthropic(input, photos) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const basePrompt = buildVisionPrompt({ ...input, photoCount: photos.length });
  return callWithJsonRetry(async (isRetry) => {
    const text = isRetry
      ? `${basePrompt}\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY a single JSON object matching the shape above. No prose. No code fences.`
      : basePrompt;
    const content = [
      { type: "text", text },
      ...photos.map((p) => ({
        type: "image",
        source: { type: "base64", media_type: p.mime, data: p.base64 }
      }))
    ];
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_VISION_MODEL || process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest",
      max_tokens: 1500,
      temperature: isRetry ? 0.2 : 0.4,
      messages: [{ role: "user", content }]
    });
    const out = response.content.map((part) => (part.type === "text" ? part.text : "")).join("");
    return parseGeneratedJson(out);
  });
}

function samplePhotoResult({ tone, notes, category, size, condition }) {
  const detailLine = [category, size, condition].filter(Boolean).join(" | ");
  return {
    title: `${category || "Preloved item"} - photo-based draft`,
    description: [
      "Listing draft generated from photos in demo mode.",
      detailLine || "Add photos plus a few notes for a stronger listing.",
      "",
      `Tone: ${tone.replace("-", " ")}.`,
      notes ? `Seller notes: ${notes}` : "Add a note if the photos miss anything important."
    ].join("\n"),
    tags: ["vinted", "preloved", "from photos", "demo"],
    searchTerms: ["preloved", "second hand", "vinted", "uk seller"],
    listingScore: {
      score: 60,
      summary: "Demo mode - connect an API key for a real photo-based listing.",
      improvements: ["Add OPENAI_API_KEY in .env", "Take a clear front photo and a label close-up", "Add a short seller note for context"]
    },
    priceOptions: {
      fastSale: "GBP 18", fairPrice: "GBP 24", maxPrice: "GBP 30",
      lowestOffer: "GBP 20", startPrice: "GBP 28", autoCounterOffer: "GBP 24", bundleDiscount: "10%"
    },
    priceGuidance: "Compare 3-5 similar sold items on Vinted before committing to a price.",
    photoChecklist: ["Front photo in natural light", "Label close-up for size and brand", "Any wear or marks shown", "Back or sole photo for shoes/bags"],
    buyerReplies: [
      "Yes, this is still available.",
      "Condition is shown in the photos. Happy to send extra close-ups.",
      "Can post within 1-2 days of payment."
    ],
    missingDetails: ["Brand (not detected in demo mode)", "Exact size", "Confirmed condition"],
    extractedFromPhotos: {
      itemType: category || "",
      color: "",
      brand: "",
      sizeLabel: size || "",
      condition: condition || "",
      flaws: [],
      styleKeywords: []
    }
  };
}

function ensureVerified(user) {
  if (!requireEmailVerification) return true;
  return Boolean(user.email_verified);
}

function recordGeneration(user, result, savedInput) {
  const now = new Date().toISOString();
  db.prepare("UPDATE users SET used_credits = used_credits + 1, updated_at = ? WHERE id = ?").run(now, user.id);
  const persisted = savedInput ? { ...result, _input: savedInput } : result;
  db.prepare("INSERT INTO generations (id, user_id, title, score, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    randomUUID(),
    user.id,
    result.title || null,
    Number(result.listingScore?.score || 0),
    JSON.stringify(persisted),
    now
  );
  recordAudit(user.id, "system:generation", -1, "Listing generation");
  return db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
}

async function handleGenerateFromPhotos(req, res) {
  const visitor = getVisitor(req);
  try {
    const user = getUserBySession(req);
    if (!user) {
      json(res, 401, { error: "Create an account or sign in to generate listings." }, visitor.headers);
      return;
    }

    if (!ensureVerified(user)) {
      json(res, 403, { error: "Verify your email before generating listings. Check your inbox for the verification link." }, visitor.headers);
      return;
    }

    const ip = getClientIp(req);
    const limit = rateLimit(`gen-photos:${user.id}:${ip}`, { max: 12, windowMs: 60_000 });
    if (!limit.ok) {
      tooManyRequests(res, visitor, limit.retryAfterSec, "Slow down a moment, then try again.");
      return;
    }

    const raw = await readBody(req, maxPhotoBodyBytes);
    const body = JSON.parse(raw || "{}");

    const rawPhotos = Array.isArray(body.photos) ? body.photos : [];
    if (rawPhotos.length === 0) {
      json(res, 400, { error: "Add at least one photo first." }, visitor.headers);
      return;
    }
    if (rawPhotos.length > maxPhotos) {
      json(res, 400, { error: `Up to ${maxPhotos} photos per listing.` }, visitor.headers);
      return;
    }

    const photos = [];
    for (const item of rawPhotos) {
      const parsed = parseDataUrl(item);
      if (!parsed) {
        json(res, 400, { error: "Photos must be JPEG, PNG, WebP or GIF images." }, visitor.headers);
        return;
      }
      photos.push(parsed);
    }

    const tone = tones.has(body.tone) ? body.tone : "clean";
    const category = String(body.category || "").trim().slice(0, 80);
    const size = String(body.size || "").trim().slice(0, 80);
    const condition = String(body.condition || "").trim().slice(0, 80);
    const notes = String(body.notes || "").trim().slice(0, 1000);
    const sellerMode = sellerModes.has(body.sellerMode) ? body.sellerMode : "clearout";
    const negotiationGoal = negotiationGoals.has(body.negotiationGoal) ? body.negotiationGoal : "friendly";

    const credits = getAccountCredits(user);
    if (credits.remaining <= 0) {
      json(res, 402, { error: "You have used your free listings. Upgrade to keep generating.", credits }, visitor.headers);
      return;
    }

    const input = { tone, notes, category, size, condition, sellerMode, negotiationGoal };
    let result;
    let provider = "demo";

    if (process.env.OPENAI_API_KEY) {
      result = await generateFromPhotosWithOpenAI(input, photos);
      provider = "openai";
    } else if (process.env.ANTHROPIC_API_KEY) {
      result = await generateFromPhotosWithAnthropic(input, photos);
      provider = "anthropic";
    } else {
      result = samplePhotoResult(input);
    }

    if (!looksLikeListing(result)) {
      json(res, 502, { error: "The model returned an unexpected response. No credit was used. Try again." }, visitor.headers);
      return;
    }

    const updatedUser = recordGeneration(user, result, { source: "photos", ...input });
    json(res, 200, { ...result, provider, source: "photos", credits: getAccountCredits(updatedUser), user: publicUser(updatedUser) }, visitor.headers);
  } catch (error) {
    console.error(error);
    if (error && error.message === "Request is too large.") {
      json(res, 413, { error: "Photos are too large. Try fewer or smaller photos." }, visitor.headers);
      return;
    }
    json(res, 502, { error: "Could not build a listing from these photos. No credit was used. Try again or add a clearer photo." }, visitor.headers);
  }
}

async function handleGenerate(req, res) {
  const visitor = getVisitor(req);
  try {
    const user = getUserBySession(req);
    if (!user) {
      json(res, 401, { error: "Create an account or sign in to generate listings." }, visitor.headers);
      return;
    }

    if (!ensureVerified(user)) {
      json(res, 403, { error: "Verify your email before generating listings. Check your inbox for the verification link." }, visitor.headers);
      return;
    }

    const ip = getClientIp(req);
    const limit = rateLimit(`gen:${user.id}:${ip}`, { max: 20, windowMs: 60_000 });
    if (!limit.ok) {
      tooManyRequests(res, visitor, limit.retryAfterSec, "Slow down a moment, then try again.");
      return;
    }

    const raw = await readBody(req);
    const body = JSON.parse(raw || "{}");
    const tone = tones.has(body.tone) ? body.tone : "clean";
    const itemDetails = String(body.itemDetails || "").trim();
    const category = String(body.category || "").trim().slice(0, 80);
    const size = String(body.size || "").trim().slice(0, 80);
    const condition = String(body.condition || "").trim().slice(0, 80);
    const buyerQuestion = String(body.buyerQuestion || "").trim().slice(0, 500);
    const sellerMode = sellerModes.has(body.sellerMode) ? body.sellerMode : "clearout";
    const negotiationGoal = negotiationGoals.has(body.negotiationGoal) ? body.negotiationGoal : "friendly";

    if (itemDetails.length < 8) {
      json(res, 400, { error: "Add a few more details about the item first." }, visitor.headers);
      return;
    }

    const credits = getAccountCredits(user);
    if (credits.remaining <= 0) {
      json(res, 402, { error: "You have used your free listings. Upgrade to keep generating.", credits }, visitor.headers);
      return;
    }

    const input = { tone, itemDetails, category, size, condition, buyerQuestion, sellerMode, negotiationGoal };
    let result;
    let provider = "demo";

    if (process.env.OPENAI_API_KEY) {
      result = await generateWithOpenAI(input);
      provider = "openai";
    } else if (process.env.ANTHROPIC_API_KEY) {
      result = await generateWithAnthropic(input);
      provider = "anthropic";
    } else {
      result = sampleResult(input);
    }

    if (!looksLikeListing(result)) {
      json(res, 502, { error: "The model returned an unexpected response. No credit was used. Try again." }, visitor.headers);
      return;
    }

    const updatedUser = recordGeneration(user, result, { source: "notes", ...input });
    json(res, 200, { ...result, provider, credits: getAccountCredits(updatedUser), user: publicUser(updatedUser) }, visitor.headers);
  } catch (error) {
    console.error(error);
    json(res, 502, { error: "Could not improve this listing. No credit was used. Check your API key or try again." }, visitor.headers);
  }
}

async function handleDemoGenerate(req, res) {
  const visitor = getVisitor(req);
  const ip = getClientIp(req);
  const limit = rateLimit(`demo:${ip}`, { max: 10, windowMs: 60_000 });
  if (!limit.ok) {
    tooManyRequests(res, visitor, limit.retryAfterSec, "The demo is busy. Try again in a moment.");
    return;
  }

  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw || "{}");
    const itemDetails = String(body.itemDetails || "Black Zara dress size 10 worn twice good condition").trim().slice(0, 600);
    const input = {
      category: "Clothing",
      tone: "friendly",
      sellerMode: "clearout",
      negotiationGoal: "friendly",
      size: "UK 10",
      condition: "Good condition",
      itemDetails: itemDetails.length >= 8 ? itemDetails : "Black Zara dress size 10 worn twice good condition",
      buyerQuestion: ""
    };
    let result;
    let provider = "demo";
    if (process.env.OPENAI_API_KEY) {
      result = await generateWithOpenAI(input);
      provider = "openai";
    } else if (process.env.ANTHROPIC_API_KEY) {
      result = await generateWithAnthropic(input);
      provider = "anthropic";
    } else {
      result = sampleResult(input);
    }

    if (!looksLikeListing(result)) {
      json(res, 502, { error: "The demo returned an unexpected response. Try again." }, visitor.headers);
      return;
    }

    json(res, 200, { ...result, provider, demo: true, input }, visitor.headers);
  } catch (error) {
    console.error(error);
    json(res, 502, { error: "Could not run the live demo. Try again shortly." }, visitor.headers);
  }
}

async function handleMe(req, res) {
  const visitor = getVisitor(req);
  const user = getUserBySession(req);

  if (!user) {
    json(res, 200, {
      user: null,
      credits: {
        freeCredits,
        paidCredits: 0,
        subscriptionCredits: 0,
        totalCredits: freeCredits,
        used: 0,
        remaining: 0,
        packSize: creditPackSize,
        packPricePence: creditPackPricePence,
        subscriptionPlan: "free",
        subscriptionStatus: "inactive",
        nextCreditRefill: null
      },
      stripeReady: Boolean(stripe),
      aiProvider: getAiProvider(),
      appUrl,
      adminEnabled: Boolean(adminEmail && adminPassword),
      creditPacks: publicCreditPacks(),
      subscriptionPlans: publicSubscriptionPlans(),
      emailVerified: false,
      verificationRequired: requireEmailVerification
    }, visitor.headers);
    return;
  }

  json(res, 200, {
    user: publicUser(user),
    credits: getAccountCredits(user),
    stripeReady: Boolean(stripe),
    aiProvider: getAiProvider(),
    appUrl,
    adminEnabled: Boolean(adminEmail && adminPassword),
    creditPacks: publicCreditPacks(),
    subscriptionPlans: publicSubscriptionPlans(),
    subscription: publicSubscriptionForUser(user),
    emailVerified: Boolean(user.email_verified),
    verificationRequired: requireEmailVerification
  }, visitor.headers);
}

async function handleHealth(req, res) {
  const checks = getLaunchChecks();
  json(res, 200, {
    ok: true,
    status: "running",
    productionReady: checks.productionReady,
    checks
  });
}

function safeParseResultJson(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function stripInternalFields(result) {
  if (!result || typeof result !== "object") return result;
  const { _input, ...rest } = result;
  return rest;
}

async function handleHistory(req, res) {
  const visitor = getVisitor(req);
  const user = getUserBySession(req);

  if (!user) {
    json(res, 401, { error: "Sign in to view listing history." }, visitor.headers);
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(20, Math.max(1, Number.parseInt(url.searchParams.get("pageSize") || "20", 10) || 20));
  const search = String(url.searchParams.get("q") || "").trim();
  const offset = (page - 1) * pageSize;
  const where = search
    ? "WHERE user_id = ? AND (title LIKE ? OR result_json LIKE ?)"
    : "WHERE user_id = ?";
  const args = search ? [user.id, `%${search}%`, `%${search}%`] : [user.id];
  const total = db.prepare(`SELECT COUNT(*) AS count FROM generations ${where}`).get(...args);
  const rows = db.prepare(`
    SELECT id, title, score, result_json, created_at
    FROM generations
    ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...args, pageSize, offset);

  const history = rows.map((row) => {
    const result = safeParseResultJson(row.result_json);
    return {
      id: row.id,
      title: row.title,
      score: row.score,
      createdAt: row.created_at,
      description: result.description || "",
      priceOptions: result.priceOptions || null,
      canRegenerate: Boolean(result._input),
      source: result._input?.source || "notes"
    };
  });

  json(res, 200, {
    history,
    pagination: {
      page,
      pageSize,
      total: Number(total?.count || 0),
      totalPages: Math.max(1, Math.ceil(Number(total?.count || 0) / pageSize))
    }
  }, visitor.headers);
}

async function handleBilling(req, res) {
  const visitor = getVisitor(req);
  const user = getUserBySession(req);
  if (!user) {
    json(res, 401, { error: "Sign in to view billing." }, visitor.headers);
    return;
  }

  const payments = db.prepare(`
    SELECT stripe_session_id, credits, processed_at
    FROM payments
    WHERE user_id = ?
    ORDER BY processed_at DESC
    LIMIT 20
  `).all(user.id).map((row) => ({
    type: "payment",
    reference: row.stripe_session_id,
    credits: row.credits,
    createdAt: row.processed_at
  }));
  const audit = db.prepare(`
    SELECT actor, delta, reason, created_at
    FROM credit_audit
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(user.id).map((row) => ({
    type: "credit-audit",
    actor: row.actor,
    delta: row.delta,
    reason: row.reason,
    createdAt: row.created_at
  }));
  const refills = db.prepare(`
    SELECT stripe_invoice_id, stripe_subscription_id, plan, credits, processed_at
    FROM subscription_refills
    WHERE user_id = ?
    ORDER BY processed_at DESC
    LIMIT 20
  `).all(user.id).map((row) => ({
    type: "subscription-refill",
    reference: row.stripe_invoice_id,
    subscriptionId: row.stripe_subscription_id,
    plan: row.plan,
    credits: row.credits,
    createdAt: row.processed_at
  }));

  json(res, 200, {
    user: publicUser(user),
    credits: getAccountCredits(user),
    subscription: publicSubscriptionForUser(user),
    creditPacks: publicCreditPacks(),
    subscriptionPlans: publicSubscriptionPlans(),
    payments,
    refills,
    audit
  }, visitor.headers);
}

async function handleHistoryGet(req, res, id) {
  const visitor = getVisitor(req);
  const user = getUserBySession(req);
  if (!user) {
    json(res, 401, { error: "Sign in to open saved listings." }, visitor.headers);
    return;
  }

  const row = db.prepare(
    "SELECT id, title, score, result_json, created_at FROM generations WHERE id = ? AND user_id = ?"
  ).get(id, user.id);
  if (!row) {
    json(res, 404, { error: "Saved listing not found." }, visitor.headers);
    return;
  }

  const result = safeParseResultJson(row.result_json);
  const canRegenerate = Boolean(result._input);
  json(res, 200, {
    id: row.id,
    createdAt: row.created_at,
    canRegenerate,
    source: result._input?.source || "notes",
    result: stripInternalFields(result)
  }, visitor.headers);
}

async function handleHistoryDelete(req, res, id) {
  const visitor = getVisitor(req);
  const user = getUserBySession(req);
  if (!user) {
    json(res, 401, { error: "Sign in first." }, visitor.headers);
    return;
  }

  const info = db.prepare("DELETE FROM generations WHERE id = ? AND user_id = ?").run(id, user.id);
  if (info.changes === 0) {
    json(res, 404, { error: "Saved listing not found." }, visitor.headers);
    return;
  }
  json(res, 200, { ok: true, id }, visitor.headers);
}

async function handleRegenerate(req, res, id) {
  const visitor = getVisitor(req);
  try {
    const user = getUserBySession(req);
    if (!user) {
      json(res, 401, { error: "Sign in to regenerate listings." }, visitor.headers);
      return;
    }
    if (!ensureVerified(user)) {
      json(res, 403, { error: "Verify your email before regenerating listings." }, visitor.headers);
      return;
    }

    const ip = getClientIp(req);
    const limit = rateLimit(`regen:${user.id}:${ip}`, { max: 12, windowMs: 60_000 });
    if (!limit.ok) {
      tooManyRequests(res, visitor, limit.retryAfterSec, "Slow down a moment, then try again.");
      return;
    }

    const row = db.prepare(
      "SELECT id, result_json FROM generations WHERE id = ? AND user_id = ?"
    ).get(id, user.id);
    if (!row) {
      json(res, 404, { error: "Saved listing not found." }, visitor.headers);
      return;
    }

    const saved = safeParseResultJson(row.result_json);
    const savedInput = saved._input;
    if (!savedInput || typeof savedInput !== "object") {
      json(res, 409, { error: "This older listing cannot be regenerated. Open it and copy what you need, or run a fresh listing." }, visitor.headers);
      return;
    }
    if (savedInput.source === "photos") {
      json(res, 409, { error: "Photo-based listings cannot be regenerated automatically. Re-upload the photos to run again." }, visitor.headers);
      return;
    }

    const credits = getAccountCredits(user);
    if (credits.remaining <= 0) {
      json(res, 402, { error: "You have used your free listings. Upgrade to keep generating.", credits }, visitor.headers);
      return;
    }

    const input = {
      tone: tones.has(savedInput.tone) ? savedInput.tone : "clean",
      itemDetails: String(savedInput.itemDetails || "").slice(0, 4000),
      category: String(savedInput.category || "").slice(0, 80),
      size: String(savedInput.size || "").slice(0, 80),
      condition: String(savedInput.condition || "").slice(0, 80),
      buyerQuestion: String(savedInput.buyerQuestion || "").slice(0, 500),
      sellerMode: sellerModes.has(savedInput.sellerMode) ? savedInput.sellerMode : "clearout",
      negotiationGoal: negotiationGoals.has(savedInput.negotiationGoal) ? savedInput.negotiationGoal : "friendly"
    };

    if (input.itemDetails.length < 8) {
      json(res, 409, { error: "This older listing cannot be regenerated — its original notes are missing." }, visitor.headers);
      return;
    }

    let result;
    let provider = "demo";
    if (process.env.OPENAI_API_KEY) {
      result = await generateWithOpenAI(input);
      provider = "openai";
    } else if (process.env.ANTHROPIC_API_KEY) {
      result = await generateWithAnthropic(input);
      provider = "anthropic";
    } else {
      result = sampleResult(input);
    }

    if (!looksLikeListing(result)) {
      json(res, 502, { error: "The model returned an unexpected response. No credit was used. Try again." }, visitor.headers);
      return;
    }

    const updatedUser = recordGeneration(user, result, { source: "notes", regenerated_from: row.id, ...input });
    json(res, 200, { ...result, provider, regenerated: true, credits: getAccountCredits(updatedUser), user: publicUser(updatedUser) }, visitor.headers);
  } catch (error) {
    console.error(error);
    json(res, 502, { error: "Could not regenerate this listing. No credit was used. Try again." }, visitor.headers);
  }
}

async function handleCheckout(req, res, forcedPackId = "") {
  const visitor = getVisitor(req);
  const user = getUserBySession(req);
  const isRouteCheckout = Boolean(forcedPackId);

  if (!user) {
    const next = forcedPackId ? `/checkout/${encodeURIComponent(forcedPackId)}` : "/pricing";
    json(res, 401, { error: "Create an account or sign in before buying credits.", authUrl: `/signup?next=${encodeURIComponent(next)}` }, visitor.headers);
    return;
  }

  if (!stripe) {
    json(res, 503, { error: "Stripe is not connected yet. Add STRIPE_SECRET_KEY to .env and restart the app." }, visitor.headers);
    return;
  }

  try {
    const body = forcedPackId ? { packId: forcedPackId } : JSON.parse(await readBody(req, 20_000) || "{}");
    const requestedPackId = String(body.packId || "").trim().toLowerCase();
    const pack = findCreditPack(requestedPackId);
    if (!pack) {
      json(res, 400, { error: "Unknown credit pack. Please choose Starter, Seller or Reseller." }, visitor.headers);
      return;
    }

    const session = await createCheckoutSession({ user, pack });
    if (isRouteCheckout) {
      res.writeHead(303, { location: session.url, ...visitor.headers });
      res.end();
      return;
    }
    json(res, 200, { url: session.url, packId: pack.id }, visitor.headers);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: "Could not start Stripe Checkout." }, visitor.headers);
  }
}

function hasMutableSubscription(user) {
  return Boolean(user?.stripe_subscription_id)
    && ["active", "trialing", "past_due"].includes(String(user.subscription_status || "").toLowerCase());
}

async function changeStripeSubscriptionPlan({ user, plan }) {
  if (!plan.priceId) return null;
  const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
  const itemId = subscription.items?.data?.[0]?.id;
  if (!itemId) throw new Error("Subscription has no editable item.");
  const updated = await stripe.subscriptions.update(user.stripe_subscription_id, {
    items: [{ id: itemId, price: plan.priceId }],
    proration_behavior: "create_prorations",
    metadata: {
      ...(subscription.metadata || {}),
      userId: user.id,
      planId: plan.id,
      credits: String(plan.credits)
    }
  });
  syncSubscriptionFields({
    userId: user.id,
    customerId: stripeId(updated.customer),
    subscriptionId: stripeId(updated.id),
    plan,
    status: updated.status || "active",
    nextCreditRefill: subscriptionPeriodEnd(updated) || user.next_credit_refill || nextMonthIso()
  });
  recordAudit(user.id, "stripe:subscription.updated", 0, `Subscription switched to ${plan.name}`);
  return db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
}

async function handleSubscriptionCheckout(req, res) {
  const visitor = getVisitor(req);
  const user = getUserBySession(req);

  if (!user) {
    json(res, 401, { error: "Create an account or sign in before subscribing.", authUrl: `/signup?next=${encodeURIComponent("/app/billing")}` }, visitor.headers);
    return;
  }

  if (!stripe) {
    json(res, 503, { error: "Stripe is not connected yet. Add a test STRIPE_SECRET_KEY to .env and restart the app." }, visitor.headers);
    return;
  }

  try {
    const body = JSON.parse(await readBody(req, 20_000) || "{}");
    const requestedPlanId = String(body.planId || "").trim().toLowerCase();
    const plan = findSubscriptionPlan(requestedPlanId);
    if (!plan) {
      json(res, 400, { error: "Unknown subscription plan. Please choose Starter, Seller or Reseller." }, visitor.headers);
      return;
    }

    if (hasMutableSubscription(user) && user.subscription_plan === plan.id) {
      json(res, 200, {
        updated: true,
        unchanged: true,
        planId: plan.id,
        credits: getAccountCredits(user),
        subscription: publicSubscriptionForUser(user),
        user: publicUser(user)
      }, visitor.headers);
      return;
    }

    if (hasMutableSubscription(user) && plan.priceId && process.env.STRIPE_MOCK_CHECKOUT !== "true") {
      const updatedUser = await changeStripeSubscriptionPlan({ user, plan });
      json(res, 200, {
        updated: true,
        planId: plan.id,
        credits: getAccountCredits(updatedUser),
        subscription: publicSubscriptionForUser(updatedUser),
        user: publicUser(updatedUser)
      }, visitor.headers);
      return;
    }

    const session = await createSubscriptionCheckoutSession({ user, plan });
    json(res, 200, { url: session.url, planId: plan.id, mode: "subscription" }, visitor.headers);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: "Could not start subscription checkout." }, visitor.headers);
  }
}

async function handleCheckoutSuccess(req, res) {
  const visitor = getVisitor(req);
  const user = getUserBySession(req);

  if (!user) {
    json(res, 401, { error: "Sign in to confirm checkout." }, visitor.headers);
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const sessionId = url.searchParams.get("session_id");
  if (!sessionId) {
    json(res, 400, { error: "Missing checkout session." }, visitor.headers);
    return;
  }

  const fresh = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
  const granted = db.prepare("SELECT credits FROM payments WHERE stripe_session_id = ? AND user_id = ?").get(sessionId, user.id);
  const subscriptionGrant = db.prepare("SELECT credits FROM subscription_refills WHERE stripe_invoice_id = ? AND user_id = ?").get(`checkout:${sessionId}`, user.id);
  json(res, 200, {
    ok: true,
    pending: !granted && !subscriptionGrant,
    credits: getAccountCredits(fresh),
    subscription: publicSubscriptionForUser(fresh),
    user: publicUser(fresh)
  }, visitor.headers);
}

function grantCreditsFromPayment({ sessionId, userId, credits, source }) {
  const existing = db.prepare("SELECT stripe_session_id FROM payments WHERE stripe_session_id = ?").get(sessionId);
  if (existing) return false;
  const now = new Date().toISOString();
  db.prepare("INSERT INTO payments (stripe_session_id, user_id, credits, processed_at) VALUES (?, ?, ?, ?)")
    .run(sessionId, userId, credits, now);
  db.prepare("UPDATE users SET paid_credits = paid_credits + ?, updated_at = ? WHERE id = ?")
    .run(credits, now, userId);
  recordAudit(userId, source || "stripe:webhook", credits, `Stripe session ${sessionId}`);
  return true;
}

function stripeId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return String(value.id || "");
}

function isoFromStripeSeconds(value) {
  const seconds = Number(value || 0);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

function nextMonthIso(from = new Date()) {
  const date = new Date(from);
  date.setMonth(date.getMonth() + 1);
  return date.toISOString();
}

function subscriptionPeriodEnd(subscription) {
  return isoFromStripeSeconds(subscription?.current_period_end)
    || isoFromStripeSeconds(subscription?.items?.data?.[0]?.current_period_end)
    || null;
}

function invoicePeriodEnd(invoice) {
  const line = invoice?.lines?.data?.find((item) => item?.period?.end);
  return isoFromStripeSeconds(line?.period?.end)
    || isoFromStripeSeconds(invoice?.period_end)
    || null;
}

async function fetchStripeSubscription(subscriptionId) {
  if (!stripe || !subscriptionId || process.env.STRIPE_MOCK_CHECKOUT === "true") return null;
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    console.warn(`Could not retrieve Stripe subscription ${subscriptionId}: ${error.message}`);
    return null;
  }
}

function findUserForStripeSubscription({ userId, subscriptionId, customerId }) {
  if (userId) {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    if (user) return user;
  }
  if (subscriptionId) {
    const user = db.prepare("SELECT * FROM users WHERE stripe_subscription_id = ?").get(subscriptionId);
    if (user) return user;
  }
  if (customerId) {
    const user = db.prepare("SELECT * FROM users WHERE stripe_customer_id = ?").get(customerId);
    if (user) return user;
  }
  return null;
}

function syncSubscriptionFields({ userId, customerId, subscriptionId, plan, status = "active", nextCreditRefill }) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET subscription_plan = ?,
        subscription_status = ?,
        next_credit_refill = ?,
        stripe_customer_id = COALESCE(?, stripe_customer_id),
        stripe_subscription_id = COALESCE(?, stripe_subscription_id),
        updated_at = ?
    WHERE id = ?
  `).run(plan.id, status, nextCreditRefill || nextMonthIso(), customerId || null, subscriptionId || null, now, userId);
}

function clearSubscriptionFields(userId, status = "canceled") {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET subscription_plan = 'free',
        subscription_status = ?,
        next_credit_refill = NULL,
        stripe_subscription_id = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(status, now, userId);
}

function grantSubscriptionCreditsOnce({ grantId, userId, subscriptionId, plan, credits, nextCreditRefill, source }) {
  const existing = db.prepare("SELECT stripe_invoice_id FROM subscription_refills WHERE stripe_invoice_id = ?").get(grantId);
  if (existing) return false;
  const now = new Date().toISOString();
  const amount = Number(credits || plan.credits || 0);
  db.prepare(`
    INSERT INTO subscription_refills (stripe_invoice_id, stripe_subscription_id, user_id, plan, credits, processed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(grantId, subscriptionId || null, userId, plan.id, amount, now);
  db.prepare(`
    UPDATE users
    SET subscription_plan = ?,
        subscription_status = 'active',
        subscription_credits = subscription_credits + ?,
        next_credit_refill = ?,
        stripe_subscription_id = COALESCE(?, stripe_subscription_id),
        updated_at = ?
    WHERE id = ?
  `).run(plan.id, amount, nextCreditRefill || nextMonthIso(), subscriptionId || null, now, userId);
  recordAudit(userId, source || "stripe:subscription", amount, `Subscription credits for ${plan.name}`);
  return true;
}

async function activateSubscriptionFromCheckout(session) {
  const userId = session.metadata?.userId || session.client_reference_id;
  const plan = findSubscriptionPlan(session.metadata?.planId);
  if (!userId || !plan) return false;
  if (session.payment_status && !["paid", "no_payment_required"].includes(session.payment_status)) return false;

  const subscriptionId = stripeId(session.subscription);
  const customerId = stripeId(session.customer);
  const subscription = await fetchStripeSubscription(subscriptionId);
  const status = subscription?.status || "active";
  const nextCreditRefill = subscriptionPeriodEnd(subscription) || nextMonthIso();
  const user = findUserForStripeSubscription({ userId, subscriptionId, customerId });
  if (!user) {
    console.warn(`Webhook: subscription checkout for unknown user ${userId} (session ${session.id})`);
    return false;
  }

  syncSubscriptionFields({ userId: user.id, customerId, subscriptionId, plan, status, nextCreditRefill });
  grantSubscriptionCreditsOnce({
    grantId: `checkout:${session.id}`,
    userId: user.id,
    subscriptionId,
    plan,
    credits: plan.credits,
    nextCreditRefill,
    source: "stripe:subscription-start"
  });
  return true;
}

async function grantRenewalCreditsFromInvoice(invoice) {
  const subscriptionId = stripeId(invoice.subscription)
    || stripeId(invoice.parent?.subscription_details?.subscription)
    || stripeId(invoice.lines?.data?.[0]?.subscription);
  const customerId = stripeId(invoice.customer);
  const metadata = {
    ...(invoice.subscription_details?.metadata || {}),
    ...(invoice.metadata || {})
  };
  const user = findUserForStripeSubscription({ userId: metadata.userId, subscriptionId, customerId });
  if (!user) return false;

  const plan = findSubscriptionPlan(metadata.planId) || findSubscriptionPlan(user.subscription_plan);
  if (!plan) return false;

  const nextCreditRefill = invoicePeriodEnd(invoice) || nextMonthIso();
  syncSubscriptionFields({
    userId: user.id,
    customerId,
    subscriptionId,
    plan,
    status: "active",
    nextCreditRefill
  });

  if (invoice.billing_reason === "subscription_create") return false;
  return grantSubscriptionCreditsOnce({
    grantId: `invoice:${invoice.id}`,
    userId: user.id,
    subscriptionId,
    plan,
    credits: Number(metadata.credits || plan.credits),
    nextCreditRefill,
    source: "stripe:invoice.paid"
  });
}

function updateSubscriptionFromStripeObject(subscription, deleted = false) {
  const subscriptionId = stripeId(subscription.id);
  const customerId = stripeId(subscription.customer);
  const user = findUserForStripeSubscription({
    userId: subscription.metadata?.userId,
    subscriptionId,
    customerId
  });
  if (!user) return false;

  if (deleted) {
    clearSubscriptionFields(user.id, subscription.status || "canceled");
    recordAudit(user.id, "stripe:subscription.deleted", 0, "Subscription canceled");
    return true;
  }

  const plan = findSubscriptionPlan(subscription.metadata?.planId) || findSubscriptionPlan(user.subscription_plan);
  if (!plan) return false;
  const nextCreditRefill = subscriptionPeriodEnd(subscription) || user.next_credit_refill || nextMonthIso();
  syncSubscriptionFields({
    userId: user.id,
    customerId,
    subscriptionId,
    plan,
    status: subscription.status || "active",
    nextCreditRefill
  });
  return true;
}

function hashToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function createPasswordResetToken(userId) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + 1000 * 60 * 30);
  db.prepare(
    "INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  ).run(hashToken(token), userId, now.toISOString(), expires.toISOString());
  return token;
}

function getPasswordResetCountForUser(userId) {
  const row = db.prepare("SELECT COUNT(*) AS count FROM password_resets WHERE user_id = ?").get(userId);
  return Number(row?.count || 0);
}

function getValidPasswordReset(token) {
  const tokenHash = hashToken(token);
  if (!token || !/^[A-Za-z0-9_-]{24,}$/.test(String(token))) return null;
  return db.prepare(`
    SELECT password_resets.*, users.email
    FROM password_resets
    JOIN users ON users.id = password_resets.user_id
    WHERE token_hash = ? AND expires_at > ? AND used_at IS NULL
  `).get(tokenHash, new Date().toISOString()) || null;
}

async function sendPasswordResetEmail(user, token) {
  const link = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const subject = "Reset your ListBoost password";
  const text = [
    "Reset your ListBoost password",
    "",
    "Use this secure link within 30 minutes:",
    link,
    "",
    "If you did not request this, you can ignore this email.",
    "ListBoost is independent and is not affiliated with Vinted."
  ].join("\n");

  const html = `
    <div style="margin:0;background:#fbfffd;padding:28px;font-family:Inter,Arial,sans-serif;color:#10201e">
      <div style="max-width:520px;margin:0 auto;border:1px solid #dbe8e5;border-radius:18px;background:#ffffff;padding:28px">
        <p style="margin:0 0 12px;color:#00b3a4;font-weight:800;letter-spacing:.08em;text-transform:uppercase">ListBoost</p>
        <h1 style="margin:0 0 12px;font-size:24px;line-height:1.2">Reset your password</h1>
        <p style="margin:0 0 18px;color:#5c716e;line-height:1.6">Use the secure link below within 30 minutes to choose a new password.</p>
        <p style="margin:0 0 18px"><a href="${link}" style="display:inline-block;background:#00b3a4;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:800">Reset password</a></p>
        <p style="margin:0 0 8px;color:#5c716e">If the button does not work, copy this link:</p>
        <p style="word-break:break-all"><a href="${link}" style="color:#007f75">${link}</a></p>
        <p style="margin:18px 0 0;color:#5c716e;font-size:13px">If you did not request this, you can ignore this email. ListBoost is independent and is not affiliated with Vinted.</p>
      </div>
    </div>
  `;

  if (process.env.RESEND_MOCK_EMAIL === "true") {
    return { delivered: false, link };
  }

  if (!resendApiKey) {
    console.log("=================================================================");
    console.log(`[reset] Password reset link for ${user.email}:`);
    console.log(`        ${link}`);
    console.log("=================================================================");
    return { delivered: false, link };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${resendApiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [user.email],
      subject,
      html,
      text
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend password reset failed: ${response.status} ${body.slice(0, 200)}`);
  }

  return { delivered: true };
}

async function handleStripeWebhook(req, res) {
  if (!stripe) {
    res.writeHead(503, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Stripe is not connected." }));
    return;
  }
  if (!stripeWebhookSecret) {
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Webhook secret not configured." }));
    return;
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req, 1_500_000);
  } catch (error) {
    res.writeHead(error?.message === "Request is too large." ? 413 : 400, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Invalid webhook body." }));
    return;
  }

  const signature = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature failed:", error.message);
    res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Invalid signature." }));
    return;
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.mode === "subscription" || session.metadata?.billingType === "subscription") {
        await activateSubscriptionFromCheckout(session);
      } else {
        const userId = session.metadata?.userId || session.client_reference_id;
        const credits = Number(session.metadata?.credits || creditPackSize);
        if (session.payment_status === "paid" && userId && credits > 0) {
          const userExists = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
          if (userExists) {
            grantCreditsFromPayment({ sessionId: session.id, userId, credits, source: "stripe:webhook" });
          } else {
            console.warn(`Webhook: paid session for unknown user ${userId} (session ${session.id})`);
          }
        }
      }
    } else if (event.type === "invoice.paid") {
      await grantRenewalCreditsFromInvoice(event.data.object);
    } else if (event.type === "customer.subscription.updated") {
      updateSubscriptionFromStripeObject(event.data.object, false);
    } else if (event.type === "customer.subscription.deleted") {
      updateSubscriptionFromStripeObject(event.data.object, true);
    }
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ received: true }));
  } catch (error) {
    console.error("Stripe webhook handler error:", error);
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Webhook processing failed." }));
  }
}

function createVerificationToken(userId) {
  const token = randomBytes(24).toString("hex");
  const now = new Date();
  const expires = new Date(now.getTime() + 1000 * 60 * 60 * 24);
  db.prepare(
    "INSERT INTO email_verifications (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  ).run(token, userId, now.toISOString(), expires.toISOString());
  return token;
}

async function sendVerificationEmail(user, token) {
  const link = `${appUrl}/verify?token=${token}`;

  if (!resendApiKey) {
    if (isProduction) {
      console.warn(`[verify] RESEND_API_KEY missing. Verification link for ${user.email}: ${link}`);
    }
    console.log("=================================================================");
    console.log(`[verify] DEV verification link for ${user.email}:`);
    console.log(`         ${link}`);
    console.log("=================================================================");
    return { delivered: false, link };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${resendApiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [user.email],
      subject: "Verify your ListBoost email",
      html: `
        <div style="margin:0;background:#fbfffd;padding:28px;font-family:Inter,Arial,sans-serif;color:#10201e">
          <div style="max-width:520px;margin:0 auto;border:1px solid #dbe8e5;border-radius:18px;background:#ffffff;padding:28px">
            <p style="margin:0 0 12px;color:#00b3a4;font-weight:800;letter-spacing:.08em;text-transform:uppercase">ListBoost</p>
            <h1 style="margin:0 0 12px;font-size:24px;line-height:1.2">Verify your email</h1>
            <p style="margin:0 0 18px;color:#5c716e;line-height:1.6">Thanks for creating a ListBoost account. Verify your email to start generating Vinted listings.</p>
            <p style="margin:0 0 18px"><a href="${link}" style="display:inline-block;background:#00b3a4;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:800">Verify email</a></p>
            <p style="margin:0 0 8px;color:#5c716e">If the button does not work, copy this link:</p>
            <p style="word-break:break-all"><a href="${link}" style="color:#007f75">${link}</a></p>
            <p style="margin:18px 0 0;color:#5c716e;font-size:13px">ListBoost is independent and is not affiliated with Vinted.</p>
          </div>
        </div>
      `,
      text: `Verify your ListBoost email: ${link}`
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Resend email failed: ${response.status} ${text.slice(0, 200)}`);
  }

  return { delivered: true };
}

async function handleVerifyEmail(req, res) {
  const visitor = getVisitor(req);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("token") || "";
  if (!token) {
    res.writeHead(302, { ...visitor.headers, location: "/?verify=missing" });
    res.end();
    return;
  }

  const row = db.prepare(
    "SELECT * FROM email_verifications WHERE token = ? AND expires_at > ? AND used_at IS NULL"
  ).get(token, new Date().toISOString());
  if (!row) {
    res.writeHead(302, { ...visitor.headers, location: "/?verify=invalid" });
    res.end();
    return;
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?").run(now, row.user_id);
  db.prepare("UPDATE email_verifications SET used_at = ? WHERE token = ?").run(now, token);

  res.writeHead(302, { ...visitor.headers, location: "/?verify=success" });
  res.end();
}

async function handleResendVerification(req, res) {
  const visitor = getVisitor(req);
  const user = getUserBySession(req);
  if (!user) {
    json(res, 401, { error: "Sign in first." }, visitor.headers);
    return;
  }
  if (user.email_verified) {
    json(res, 200, { ok: true, alreadyVerified: true }, visitor.headers);
    return;
  }

  const ip = getClientIp(req);
  const limit = rateLimit(`resend:${user.id}:${ip}`, { max: 3, windowMs: 5 * 60_000 });
  if (!limit.ok) {
    tooManyRequests(res, visitor, limit.retryAfterSec, "Wait a few minutes before requesting another verification email.");
    return;
  }

  const token = createVerificationToken(user.id);
  try {
    const delivery = await sendVerificationEmail(user, token);
    json(res, 200, { ok: true, delivered: delivery.delivered }, visitor.headers);
  } catch (error) {
    console.error(error);
    json(res, 502, { error: "Could not send verification email. Try again in a moment." }, visitor.headers);
  }
}

async function handleForgotPassword(req, res) {
  const visitor = getVisitor(req);
  const ip = getClientIp(req);
  const limit = rateLimit(`forgot:${ip}`, { max: 6, windowMs: 15 * 60_000 });
  if (!limit.ok) {
    tooManyRequests(res, visitor, limit.retryAfterSec, "Too many reset requests. Try again later.");
    return;
  }

  try {
    const body = JSON.parse(await readBody(req, 20_000) || "{}");
    const email = normalizeEmail(body.email);
    if (isValidEmail(email)) {
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
      if (user) {
        const token = createPasswordResetToken(user.id);
        try {
          await sendPasswordResetEmail(user, token);
        } catch (error) {
          console.error(error);
        }
      }
    }
    json(res, 200, { ok: true, message: "If an account exists for that email, we'll send reset instructions." }, visitor.headers);
  } catch (error) {
    console.error(error);
    json(res, 200, { ok: true, message: "If an account exists for that email, we'll send reset instructions." }, visitor.headers);
  }
}

async function handleResetPasswordValidate(req, res) {
  const visitor = getVisitor(req);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get("token") || "";
  const row = getValidPasswordReset(token);
  if (!row) {
    json(res, 400, { valid: false, error: "Reset link is invalid or expired." }, visitor.headers);
    return;
  }
  json(res, 200, { valid: true, email: row.email }, visitor.headers);
}

async function handleResetPassword(req, res) {
  const visitor = getVisitor(req);
  const ip = getClientIp(req);
  const limit = rateLimit(`reset:${ip}`, { max: 10, windowMs: 15 * 60_000 });
  if (!limit.ok) {
    tooManyRequests(res, visitor, limit.retryAfterSec, "Too many reset attempts. Try again later.");
    return;
  }

  try {
    const body = JSON.parse(await readBody(req, 20_000) || "{}");
    const token = String(body.token || "");
    const password = String(body.password || "");
    const row = getValidPasswordReset(token);
    if (!row) {
      json(res, 400, { error: "Reset link is invalid or expired." }, visitor.headers);
      return;
    }
    if (password.length < 8) {
      json(res, 400, { error: "Password must be at least 8 characters." }, visitor.headers);
      return;
    }

    const now = new Date().toISOString();
    db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(hashPassword(password), now, row.user_id);
    db.prepare("UPDATE password_resets SET used_at = ? WHERE token_hash = ?").run(now, row.token_hash);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.user_id);
    recordAudit(row.user_id, "system:password-reset", 0, "Password reset completed");
    json(res, 200, { ok: true }, visitor.headers);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: "Could not reset password. Try again." }, visitor.headers);
  }
}

function isAdminAuthorized(req) {
  if (!adminEmail || !adminPassword) return false;
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;
  let decoded;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  const idx = decoded.indexOf(":");
  if (idx === -1) return false;
  const email = decoded.slice(0, idx).trim().toLowerCase();
  const password = decoded.slice(idx + 1);
  if (email !== adminEmail) return false;
  const expected = Buffer.from(adminPassword);
  const supplied = Buffer.from(password);
  if (expected.length !== supplied.length) return false;
  return timingSafeEqual(expected, supplied);
}

function requireAdmin(req, res) {
  if (isAdminAuthorized(req)) return true;
  res.writeHead(401, {
    "www-authenticate": 'Basic realm="ListBoost admin", charset="UTF-8"',
    "content-type": "text/plain; charset=utf-8"
  });
  res.end("Authentication required.");
  return false;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function handleAdminPage(req, res) {
  if (!requireAdmin(req, res)) return;

  const users = db.prepare(`
    SELECT id, email, free_credits, paid_credits, used_credits, email_verified, created_at, updated_at
    FROM users ORDER BY created_at DESC LIMIT 200
  `).all();
  const payments = db.prepare(`
    SELECT stripe_session_id, user_id, credits, processed_at
    FROM payments ORDER BY processed_at DESC LIMIT 50
  `).all();
  const generations = db.prepare(`
    SELECT id, user_id, title, score, created_at
    FROM generations ORDER BY created_at DESC LIMIT 50
  `).all();
  const audit = db.prepare(`
    SELECT id, user_id, actor, delta, reason, created_at
    FROM credit_audit ORDER BY created_at DESC LIMIT 50
  `).all();
  const summary = db.prepare(`
    SELECT
      COUNT(*) AS totalUsers,
      SUM(CASE WHEN paid_credits > 0 THEN 1 ELSE 0 END) AS paidUsers,
      SUM(free_credits + paid_credits) AS creditsGranted,
      SUM(used_credits) AS creditsUsed
    FROM users
  `).get();
  const recentPayments = db.prepare(`
    SELECT credits
    FROM payments
    WHERE processed_at >= datetime('now', '-30 days')
  `).all();
  const recentRevenuePence = recentPayments.reduce((sum, row) => sum + pricePenceForCredits(row.credits), 0);

  const userRows = users.map((u) => `
    <tr data-user-row>
      <td><code>${escapeHtml(u.id.slice(0, 8))}</code></td>
      <td>${escapeHtml(u.email)}</td>
      <td>${u.email_verified ? "yes" : "no"}</td>
      <td>${u.free_credits}</td>
      <td>${u.paid_credits}</td>
      <td>${u.used_credits}</td>
      <td>${Math.max((u.free_credits + u.paid_credits) - u.used_credits, 0)}</td>
      <td>
        <form method="post" action="/admin/credits">
          <input type="hidden" name="userId" value="${escapeHtml(u.id)}" />
          <input type="number" name="delta" required style="width:64px" placeholder="±" />
          <input type="text" name="reason" required style="width:160px" placeholder="reason" />
          <button type="submit">Adjust</button>
        </form>
      </td>
    </tr>
  `).join("");

  const paymentRows = payments.map((p) => `
    <tr><td><a href="https://dashboard.stripe.com/test/checkout/sessions/${escapeHtml(p.stripe_session_id)}" rel="noreferrer"><code>${escapeHtml(p.stripe_session_id)}</code></a></td><td><code>${escapeHtml(p.user_id.slice(0, 8))}</code></td><td>${p.credits}</td><td>${escapeHtml(p.processed_at)}</td></tr>
  `).join("");

  const genRows = generations.map((g) => `
    <tr><td>${escapeHtml(g.created_at)}</td><td><code>${escapeHtml(g.user_id.slice(0, 8))}</code></td><td>${escapeHtml(g.title || "")}</td><td>${g.score || 0}</td></tr>
  `).join("");

  const auditRows = audit.map((a) => `
    <tr><td>${escapeHtml(a.created_at)}</td><td><code>${escapeHtml(a.user_id.slice(0, 8))}</code></td><td>${escapeHtml(a.actor)}</td><td>${a.delta > 0 ? "+" : ""}${a.delta}</td><td>${escapeHtml(a.reason)}</td></tr>
  `).join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>ListBoost admin</title>
<style>
  :root { color-scheme: light; --bg:#f9fafb; --panel:#fff; --fg:#101828; --muted:#475467; --line:#d0d5dd; --accent:#00b3a4; }
  :root[data-theme="dark"] { color-scheme: dark; --bg:#071412; --panel:#0d1d1a; --fg:#f4fffc; --muted:#b8d0cb; --line:#223c38; --accent:#7ee7d8; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; margin: 24px; color: var(--fg); background: var(--bg); }
  h1 { margin: 0 0 6px; }
  h2 { margin: 28px 0 8px; font-size: 1rem; text-transform: uppercase; color: var(--muted); letter-spacing: 0.04em; }
  a { color: var(--accent); }
  .skip-link { position:absolute; left:12px; top:12px; transform:translateY(-200%); background:var(--fg); color:var(--bg); padding:8px 12px; border-radius:8px; }
  .skip-link:focus { transform:translateY(0); }
  .admin-top { display:flex; justify-content:space-between; align-items:center; gap:12px; }
  .summary { display: grid; grid-template-columns: repeat(5, minmax(140px, 1fr)); gap: 12px; margin: 20px 0; }
  .card { border: 1px solid var(--line); border-radius: 14px; padding: 16px; background: var(--panel); }
  .card span { display: block; color: var(--muted); font-size: 0.78rem; text-transform: uppercase; font-weight: 800; }
  .card strong { display: block; margin-top: 6px; font-size: 1.5rem; }
  .table-tools { display:flex; justify-content:space-between; gap:12px; align-items:center; margin: 10px 0; flex-wrap:wrap; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { border-bottom: 1px solid var(--line); padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: color-mix(in srgb, var(--panel) 88%, var(--accent) 12%); font-weight: 700; }
  code { font-size: 0.85rem; }
  form { display: inline-flex; gap: 6px; }
  input, button { font: inherit; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--fg); }
  button { background: var(--fg); color: var(--bg); cursor: pointer; }
  .toast { position: fixed; right: 18px; bottom: 18px; border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; background: var(--panel); box-shadow: 0 18px 40px rgba(0,0,0,.18); }
  @media (max-width: 900px) { .summary { grid-template-columns: 1fr 1fr; } table { display:block; overflow-x:auto; } }
</style></head>
<body><a class="skip-link" href="#main">Skip to content</a>
  <div class="admin-top"><div><h1>ListBoost admin</h1>
  <p>Logged in as <strong>${escapeHtml(adminEmail)}</strong>. Webhook secret: ${stripeWebhookSecret ? "configured" : "<strong style='color:#b42318'>missing</strong>"}.</p>
  </div><button type="button" id="themeToggle">Dark</button></div>
  <main id="main">
  <section class="summary">
    <div class="card"><span>Total users</span><strong>${summary.totalUsers || 0}</strong></div>
    <div class="card"><span>Paid users</span><strong>${summary.paidUsers || 0}</strong></div>
    <div class="card"><span>Last-30d revenue</span><strong>${formatPence(recentRevenuePence)}</strong></div>
    <div class="card"><span>Credits granted</span><strong>${summary.creditsGranted || 0}</strong></div>
    <div class="card"><span>Credits used</span><strong>${summary.creditsUsed || 0}</strong></div>
  </section>
  <h2>Users (latest 200)</h2>
  <div class="table-tools"><label>Search users <input id="userSearch" type="search" placeholder="email" /></label><div id="userPager"></div></div>
  <table id="usersTable"><thead><tr><th>id</th><th>email</th><th>verified</th><th>free</th><th>paid</th><th>used</th><th>remaining</th><th>adjust</th></tr></thead>
  <tbody>${userRows}</tbody></table>
  <h2>Payments (latest 50)</h2>
  <table><thead><tr><th>session</th><th>user</th><th>credits</th><th>at</th></tr></thead><tbody>${paymentRows}</tbody></table>
  <h2>Recent generations (50)</h2>
  <table><thead><tr><th>at</th><th>user</th><th>title</th><th>score</th></tr></thead><tbody>${genRows}</tbody></table>
  <h2>Credit audit (latest 50)</h2>
  <table><thead><tr><th>at</th><th>user</th><th>actor</th><th>delta</th><th>reason</th></tr></thead><tbody>${auditRows}</tbody></table>
  </main>
  <script>
    const root = document.documentElement;
    const saved = localStorage.getItem("lb_theme") || "system";
    if (saved !== "system") root.dataset.theme = saved;
    themeToggle.textContent = root.dataset.theme === "dark" ? "Light" : "Dark";
    themeToggle.addEventListener("click", () => {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      localStorage.setItem("lb_theme", next);
      themeToggle.textContent = next === "dark" ? "Light" : "Dark";
    });
    document.querySelectorAll('form[action="/admin/credits"]').forEach((form) => {
      form.addEventListener("submit", (event) => {
        if (!confirm("Adjust this user's credits?")) event.preventDefault();
      });
    });
    const rows = Array.from(document.querySelectorAll("[data-user-row]"));
    let page = 1;
    const pageSize = 25;
    function renderUsers() {
      const q = userSearch.value.toLowerCase().trim();
      const visible = rows.filter((row) => row.textContent.toLowerCase().includes(q));
      rows.forEach((row) => row.style.display = "none");
      visible.slice((page - 1) * pageSize, page * pageSize).forEach((row) => row.style.display = "");
      const pages = Math.max(1, Math.ceil(visible.length / pageSize));
      if (page > pages) page = pages;
      userPager.innerHTML = '<button type="button" id="prevUsers" ' + (page <= 1 ? "disabled" : "") + '>Previous</button> <span>Page ' + page + ' of ' + pages + '</span> <button type="button" id="nextUsers" ' + (page >= pages ? "disabled" : "") + '>Next</button>';
      prevUsers.onclick = () => { page -= 1; renderUsers(); };
      nextUsers.onclick = () => { page += 1; renderUsers(); };
    }
    userSearch.addEventListener("input", () => { page = 1; renderUsers(); });
    renderUsers();
    if (new URLSearchParams(location.search).get("adjusted")) {
      const toast = document.createElement("div");
      toast.className = "toast";
      toast.textContent = "Credits adjusted.";
      document.body.append(toast);
      setTimeout(() => toast.remove(), 3500);
    }
  </script>
</body></html>`;
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

async function handleAdminCreditsAdjust(req, res) {
  if (!requireAdmin(req, res)) return;

  let raw;
  try {
    raw = await readBody(req, 5_000);
  } catch {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }
  const params = new URLSearchParams(raw);
  const userId = params.get("userId") || "";
  const delta = Number.parseInt(params.get("delta") || "0", 10);
  const reason = (params.get("reason") || "").trim().slice(0, 240);

  if (!userId || !Number.isFinite(delta) || delta === 0 || !reason) {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Missing userId, non-zero delta, or reason.");
    return;
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("User not found.");
    return;
  }

  const now = new Date().toISOString();
  if (delta > 0) {
    db.prepare("UPDATE users SET paid_credits = paid_credits + ?, updated_at = ? WHERE id = ?").run(delta, now, userId);
  } else {
    const removed = Math.min(-delta, user.paid_credits);
    db.prepare("UPDATE users SET paid_credits = paid_credits - ?, updated_at = ? WHERE id = ?").run(removed, now, userId);
  }
  recordAudit(userId, `admin:${adminEmail}`, delta, reason);

  res.writeHead(303, { location: "/admin?adjusted=1" });
  res.end();
}

async function handleSignup(req, res) {
  const visitor = getVisitor(req);

  const ip = getClientIp(req);
  const ipLimit = rateLimit(`signup-ip:${ip}`, { max: 5, windowMs: 60 * 60_000 });
  if (!ipLimit.ok) {
    tooManyRequests(res, visitor, ipLimit.retryAfterSec, "Too many signup attempts. Try again later.");
    return;
  }

  try {
    const body = JSON.parse(await readBody(req) || "{}");
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (!isValidEmail(email)) {
      json(res, 400, { error: "Enter a valid email address." }, visitor.headers);
      return;
    }

    if (password.length < 8) {
      json(res, 400, { error: "Password must be at least 8 characters." }, visitor.headers);
      return;
    }

    const emailLimit = rateLimit(`signup-email:${email}`, { max: 3, windowMs: 60 * 60_000 });
    if (!emailLimit.ok) {
      tooManyRequests(res, visitor, emailLimit.retryAfterSec, "Too many signup attempts for this email. Try again later.");
      return;
    }

    const legacyUsage = await loadUsage();
    const legacyCredits = getCredits(legacyUsage, visitor.id);
    const startingCredits = Math.max(freeCredits, Number(legacyCredits.remaining || 0));
    const startingFreeCredits = Math.min(freeCredits, startingCredits);
    const startingPaidCredits = Math.max(startingCredits - startingFreeCredits, 0);

    const now = new Date().toISOString();
    const userId = randomUUID();
    db.prepare(`
      INSERT INTO users (id, email, password_hash, free_credits, paid_credits, used_credits, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, 0, ?, ?)
    `).run(userId, email, hashPassword(password), startingFreeCredits, now, now);

    if (startingPaidCredits > 0) {
      db.prepare("UPDATE users SET paid_credits = ?, updated_at = ? WHERE id = ?")
        .run(startingPaidCredits, now, userId);
    }

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    let verificationDelivery = { delivered: false };
    if (requireEmailVerification) {
      const verificationToken = createVerificationToken(userId);
      try {
        verificationDelivery = await sendVerificationEmail(user, verificationToken);
      } catch (error) {
        console.error(error);
        verificationDelivery = { delivered: false, error: "Verification email could not be sent. Use resend after signing in." };
      }
    }

    const token = createSession(userId);
    json(res, 200, {
      user: publicUser(user),
      credits: getAccountCredits(user),
      stripeReady: Boolean(stripe),
      aiProvider: getAiProvider(),
      appUrl,
      adminEnabled: Boolean(adminEmail && adminPassword),
      creditPacks: publicCreditPacks(),
      subscriptionPlans: publicSubscriptionPlans(),
      subscription: publicSubscriptionForUser(user),
      emailVerified: Boolean(user.email_verified),
      verificationRequired: requireEmailVerification,
      verificationEmailDelivered: verificationDelivery.delivered,
      verificationEmailError: verificationDelivery.error || null
    }, { ...visitor.headers, ...authHeaders(token) });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      json(res, 409, { error: "An account with this email already exists. Sign in instead." }, visitor.headers);
      return;
    }
    console.error(error);
    json(res, 500, { error: "Could not create account." }, visitor.headers);
  }
}

async function handleLogin(req, res) {
  const visitor = getVisitor(req);

  const ip = getClientIp(req);
  const ipLimit = rateLimit(`login-ip:${ip}`, { max: 10, windowMs: 15 * 60_000 });
  if (!ipLimit.ok) {
    tooManyRequests(res, visitor, ipLimit.retryAfterSec, "Too many login attempts. Try again later.");
    return;
  }

  try {
    const body = JSON.parse(await readBody(req) || "{}");
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    const emailLimit = rateLimit(`login-email:${email}`, { max: 8, windowMs: 15 * 60_000 });
    if (!emailLimit.ok) {
      tooManyRequests(res, visitor, emailLimit.retryAfterSec, "Too many attempts for this email. Try again later.");
      return;
    }

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

    if (!user || !verifyPassword(password, user.password_hash)) {
      json(res, 401, { error: "Email or password is incorrect." }, visitor.headers);
      return;
    }

    const token = createSession(user.id);
    json(res, 200, {
      user: publicUser(user),
      credits: getAccountCredits(user),
      stripeReady: Boolean(stripe),
      aiProvider: getAiProvider(),
      appUrl,
      adminEnabled: Boolean(adminEmail && adminPassword),
      creditPacks: publicCreditPacks(),
      subscriptionPlans: publicSubscriptionPlans(),
      subscription: publicSubscriptionForUser(user),
      emailVerified: Boolean(user.email_verified),
      verificationRequired: requireEmailVerification
    }, { ...visitor.headers, ...authHeaders(token) });
  } catch (error) {
    console.error(error);
    json(res, 500, { error: "Could not sign in." }, visitor.headers);
  }
}

async function handleLogout(req, res) {
  const cookies = parseCookies(req);
  if (cookies.lb_session) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(cookies.lb_session);
  }
  json(res, 200, { ok: true }, clearAuthHeaders());
}

const prettyRoutes = {
  "/": "/index.html",
  "/example": "/example.html",
  "/pricing": "/pricing.html",
  "/signup": "/auth.html",
  "/login": "/auth.html",
  "/verify-email": "/verify-email.html",
  "/forgot-password": "/forgot-password.html",
  "/reset-password": "/reset-password.html",
  "/app": "/app.html",
  "/app/notes": "/app.html",
  "/app/photo": "/app.html",
  "/app/score": "/app.html",
  "/app/replies": "/app.html",
  "/app/history": "/app.html",
  "/app/billing": "/app.html",
  "/checkout/success": "/checkout-success.html",
  "/checkout/cancel": "/checkout-cancel.html",
  "/privacy": "/privacy.html",
  "/terms": "/terms.html",
  "/robots.txt": "/robots.txt",
  "/sitemap.xml": "/sitemap.xml"
};

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestPath = prettyRoutes[url.pathname] || url.pathname;
  const safePath = normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    res.end(content);
  } catch {
    try {
      const content = await readFile(join(publicDir, "404.html"));
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      res.end(content);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
    }
  }
}

const server = createServer((req, res) => {
  const host = String(req.headers.host || "").toLowerCase();
  if (host === "listboost.uk" || host.startsWith("listboost.uk:")) {
    res.writeHead(301, { location: `https://www.listboost.uk${req.url || "/"}` });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    handleHealth(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/stripe-webhook") {
    handleStripeWebhook(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/signup") {
    handleSignup(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/login") {
    handleLogin(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/logout") {
    handleLogout(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/resend-verification") {
    handleResendVerification(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/forgot-password") {
    handleForgotPassword(req, res);
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/reset-password/validate")) {
    handleResetPasswordValidate(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/reset-password") {
    handleResetPassword(req, res);
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/verify")) {
    handleVerifyEmail(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/generate") {
    handleGenerate(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/demo-generate") {
    handleDemoGenerate(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/generate-from-photos") {
    handleGenerateFromPhotos(req, res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/me") {
    handleMe(req, res);
    return;
  }

  if (req.method === "GET" && (req.url === "/api/history" || req.url.startsWith("/api/history?"))) {
    handleHistory(req, res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/billing") {
    handleBilling(req, res);
    return;
  }

  {
    const historyMatch = req.url.match(/^\/api\/history\/([a-f0-9-]{8,})$/i);
    if (historyMatch && req.method === "GET") {
      handleHistoryGet(req, res, historyMatch[1]);
      return;
    }
    if (historyMatch && req.method === "DELETE") {
      handleHistoryDelete(req, res, historyMatch[1]);
      return;
    }

    const regenMatch = req.url.match(/^\/api\/regenerate\/([a-f0-9-]{8,})$/i);
    if (regenMatch && req.method === "POST") {
      handleRegenerate(req, res, regenMatch[1]);
      return;
    }
  }

  if (req.method === "POST" && req.url === "/api/create-checkout-session") {
    handleCheckout(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/create-subscription-checkout-session") {
    handleSubscriptionCheckout(req, res);
    return;
  }

  {
    const checkoutMatch = req.url.match(/^\/checkout\/([a-z0-9_-]+)$/i);
    if (checkoutMatch && req.method === "GET") {
      if (["success", "cancel"].includes(checkoutMatch[1])) {
        serveStatic(req, res);
        return;
      }
      if (!getUserBySession(req)) {
        res.writeHead(302, { location: `/signup?next=${encodeURIComponent(`/checkout/${checkoutMatch[1]}`)}` });
        res.end();
        return;
      }
      handleCheckout(req, res, checkoutMatch[1]);
      return;
    }
  }

  if (req.method === "GET" && req.url.startsWith("/api/checkout/success")) {
    handleCheckoutSuccess(req, res);
    return;
  }

  if (req.method === "GET" && (req.url === "/admin" || req.url.startsWith("/admin?"))) {
    handleAdminPage(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/admin/credits") {
    handleAdminCreditsAdjust(req, res);
    return;
  }

  if (req.url && req.url.startsWith("/api/")) {
    json(res, 404, { error: "Unknown API route." });
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  json(res, 405, { error: "Method not allowed." });
});

if (process.env.LISTBOOST_NO_LISTEN !== "true") {
  server.listen(port, () => {
    console.log(`Vinted Listing Booster running at http://localhost:${port}`);
    logLaunchChecks();
  });
}

export {
  cleanEnvValue,
  trimConfiguredEnv,
  resolveDataDir,
  ensureDataDir,
  normalizeAppUrl,
  findCreditPack,
  findSubscriptionPlan,
  createPasswordResetToken,
  getPasswordResetCountForUser,
  publicCreditPacks,
  publicSubscriptionPlans,
  server
};
