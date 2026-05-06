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
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_TENANT_ID",
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
const freeCredits = Math.min(Math.max(Number(process.env.FREE_CREDITS || 3), 0), 3);
const creditPackSize = Number(process.env.CREDIT_PACK_SIZE || 50);
const creditPackPricePence = Number(process.env.CREDIT_PACK_PRICE_PENCE || 700);
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
const microsoftTenantId = String(process.env.MICROSOFT_TENANT_ID || "common").trim() || "common";
const oauthProviders = {
  google: {
    id: "google",
    label: "Google",
    clientId: String(process.env.GOOGLE_CLIENT_ID || ""),
    clientSecret: String(process.env.GOOGLE_CLIENT_SECRET || ""),
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile"
  },
  microsoft: {
    id: "microsoft",
    label: "Microsoft",
    clientId: String(process.env.MICROSOFT_CLIENT_ID || ""),
    clientSecret: String(process.env.MICROSOFT_CLIENT_SECRET || ""),
    authorizationUrl: `https://login.microsoftonline.com/${encodeURIComponent(microsoftTenantId)}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${encodeURIComponent(microsoftTenantId)}/oauth2/v2.0/token`,
    userInfoUrl: "https://graph.microsoft.com/oidc/userinfo",
    scope: "openid email profile"
  }
};
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
      pricePence: 700,
      label: "Flexible top-up",
      description: "A one-time pack for testing ListBoost or clearing out a small wardrobe batch."
    },
    {
      id: "seller",
      name: "Seller",
      credits: 150,
      pricePence: 1800,
      label: "Popular top-up",
      description: "A flexible top-up for regular Vinted sellers who are not ready to subscribe.",
      featured: true
    },
    {
      id: "reseller",
      name: "Reseller",
      credits: 400,
      pricePence: 4500,
      label: "Bulk top-up",
      description: "A larger one-time pack for bulk sessions without monthly benefits."
    }
  ];

  if (!process.env.CREDIT_PACKS_JSON) return fallback.map(enforceCreditPackEconomics);

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
    return (clean.length ? clean.slice(0, 6) : fallback).map(enforceCreditPackEconomics);
  } catch (error) {
    console.warn("[launch-check] CREDIT_PACKS_JSON is invalid. Using default credit packs.");
    return fallback.map(enforceCreditPackEconomics);
  }
}

function enforceCreditPackEconomics(pack) {
  const standard = {
    starter: {
      pricePence: 700,
      label: "Flexible top-up",
      description: "A one-time pack for testing ListBoost or clearing out a small wardrobe batch."
    },
    seller: {
      pricePence: 1800,
      label: "Popular top-up",
      description: "A flexible top-up for regular Vinted sellers who are not ready to subscribe.",
      featured: true
    },
    reseller: {
      pricePence: 4500,
      label: "Bulk top-up",
      description: "A larger one-time pack for bulk sessions without monthly benefits."
    }
  }[pack.id];
  if (!standard) return pack;
  return {
    ...pack,
    pricePence: Math.max(Number(pack.pricePence || 0), standard.pricePence),
    label: standard.label,
    description: standard.description,
    featured: Boolean(pack.featured || standard.featured)
  };
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

const FREE_PLAN = {
  id: "free",
  name: "Free",
  monthlyLimit: 3,
  pricePence: 0,
  label: "Free trial",
  description: "Generate up to 3 listings to try ListBoost. Subscribe to keep going."
};

function buildSubscriptionPlans() {
  // NOTE: backend plan ids stay stable as starter/seller/reseller (used in Stripe metadata,
  // session.metadata.planId, webhooks, and the subscription_plan column). The "reseller" id
  // is presented to users as "Elite" via publicPlanName() in public/site.js. Server-side
  // pricing here is the source of truth — frontend cannot override it.
  const fallback = [
    {
      id: "starter",
      name: "Starter",
      monthlyLimit: 20,
      pricePence: 699,
      label: "Monthly starter",
      description: "For casual sellers who need the core notes-to-listing generator.",
      priceEnv: "STRIPE_PRICE_STARTER_MONTHLY"
    },
    {
      id: "seller",
      name: "Seller",
      monthlyLimit: 75,
      pricePence: 1499,
      label: "Best value",
      description: "For regular sellers who want photos, buyer replies, price guidance and listing scores.",
      featured: true,
      priceEnv: "STRIPE_PRICE_SELLER_MONTHLY"
    },
    {
      id: "reseller",
      name: "Elite",
      monthlyLimit: 250,
      pricePence: 2999,
      label: "Elite tools",
      description: "For serious resellers running larger volumes with priority support.",
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
        monthlyLimit: plan.monthlyLimit == null ? null : Number(plan.monthlyLimit),
        pricePence: Number(plan.pricePence),
        label: String(plan.label || "").trim(),
        description: String(plan.description || "").trim(),
        featured: Boolean(plan.featured),
        priceEnv: String(plan.priceEnv || "").trim(),
        priceId: String(plan.priceId || "").trim()
      }))
      .filter((plan) => plan.id && plan.name && Number.isFinite(plan.pricePence) && plan.pricePence > 0);
    return clean.length ? clean.map(withSubscriptionPriceId) : fallback.map(withSubscriptionPriceId);
  } catch {
    console.warn("[launch-check] SUBSCRIPTION_PLANS_JSON is invalid. Using default subscription plans.");
    return fallback.map(withSubscriptionPriceId);
  }
}

function planForId(planId) {
  const id = String(planId || "free").trim().toLowerCase();
  if (id === "free") return FREE_PLAN;
  return findSubscriptionPlan(id) || FREE_PLAN;
}

function planLimitFor(planId) {
  const plan = planForId(planId);
  return plan.monthlyLimit == null ? null : Number(plan.monthlyLimit);
}

const PLAN_RANK = {
  free: 0,
  starter: 1,
  seller: 2,
  reseller: 3
};

const ACTIVE_ENTITLEMENT_STATUSES = new Set(["active", "trialing", "past_due"]);

const FEATURE_ENTITLEMENTS = {
  notes: { minimumPlan: "free", label: "Notes-to-listing generator" },
  photos: { minimumPlan: "seller", label: "Photo listings", requiredPlanName: "Seller" },
  buyerReplies: { minimumPlan: "seller", label: "Buyer reply generator", requiredPlanName: "Seller" },
  listingScore: { minimumPlan: "seller", label: "Listing score checker", requiredPlanName: "Seller" },
  history: { minimumPlan: "seller", label: "Saved listing history", requiredPlanName: "Seller" }
};

function effectiveEntitlementPlan(user) {
  const planId = String(user?.subscription_plan || "free").toLowerCase();
  if (planId === "free") return "free";
  const status = String(user?.subscription_status || "inactive").toLowerCase();
  return ACTIVE_ENTITLEMENT_STATUSES.has(status) ? planId : "free";
}

function planAllowsFeature(planId, feature) {
  const entitlement = FEATURE_ENTITLEMENTS[feature] || FEATURE_ENTITLEMENTS.notes;
  return (PLAN_RANK[planId] ?? 0) >= (PLAN_RANK[entitlement.minimumPlan] ?? 0);
}

function userCanUseFeature(user, feature) {
  return planAllowsFeature(effectiveEntitlementPlan(user), feature);
}

function featureLockedPayload(user, feature) {
  const entitlement = FEATURE_ENTITLEMENTS[feature] || FEATURE_ENTITLEMENTS.notes;
  const usage = user ? getAccountUsage(user) : null;
  return {
    error: `${entitlement.label} is included from the ${entitlement.requiredPlanName || titleCaseWords(entitlement.minimumPlan)} plan.`,
    featureLocked: true,
    feature,
    requiredPlan: entitlement.minimumPlan,
    requiredPlanName: entitlement.requiredPlanName || titleCaseWords(entitlement.minimumPlan),
    currentPlan: effectiveEntitlementPlan(user),
    upgradeUrl: "/app/billing",
    usage
  };
}

function sendFeatureLocked(res, visitor, user, feature) {
  json(res, 402, featureLockedPayload(user, feature), visitor.headers);
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
    monthlyLimit: plan.monthlyLimit,
    unlimited: plan.monthlyLimit == null,
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
  const plan = planForId(planId);
  const usage = user ? getAccountUsage(user) : null;
  return {
    plan: planId,
    planName: plan.name,
    status: user?.subscription_status || "inactive",
    monthlyLimit: usage?.usageLimit ?? plan.monthlyLimit,
    unlimited: usage?.unlimited ?? (plan.monthlyLimit == null),
    usageThisMonth: usage?.usageThisMonth ?? Number(user?.usage_this_month || 0),
    billingPeriodEnd: user?.billing_period_end || user?.next_credit_refill || null,
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
        description: plan.description || "Monthly ListBoost subscription for Vinted sellers."
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

  const limitLabel = plan.monthlyLimit == null ? "unlimited" : String(plan.monthlyLimit);
  return stripe.checkout.sessions.create({
    mode: "subscription",
    client_reference_id: user.id,
    customer: user.stripe_customer_id || undefined,
    customer_email: user.stripe_customer_id ? undefined : user.email,
    metadata: {
      userId: user.id,
      planId: plan.id,
      monthlyLimit: limitLabel,
      billingType: "subscription"
    },
    subscription_data: {
      metadata: {
        userId: user.id,
        planId: plan.id,
        monthlyLimit: limitLabel
      }
    },
    line_items: [subscriptionLineItem(plan)],
    success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/checkout/cancel`
  });
}

async function createBillingPortalSession({ user }) {
  if (process.env.STRIPE_MOCK_CHECKOUT === "true") {
    return { url: "https://billing.stripe.test/portal" };
  }

  return stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: `${appUrl}/app/billing`
  });
}
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
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

  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    next_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
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
  ["users", "name", "TEXT NOT NULL DEFAULT ''"],
  ["users", "email_verified", "INTEGER NOT NULL DEFAULT 0"],
  ["users", "subscription_plan", "TEXT NOT NULL DEFAULT 'free'"],
  ["users", "subscription_status", "TEXT NOT NULL DEFAULT 'inactive'"],
  ["users", "subscription_credits", "INTEGER NOT NULL DEFAULT 0"],
  ["users", "next_credit_refill", "TEXT"],
  ["users", "stripe_customer_id", "TEXT"],
  ["users", "stripe_subscription_id", "TEXT"],
  ["users", "usage_this_month", "INTEGER NOT NULL DEFAULT 0"],
  ["users", "usage_limit", "INTEGER NOT NULL DEFAULT 3"],
  ["users", "billing_period_end", "TEXT"]
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
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif"
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
  json(res, 429, { error: message || "Too many requests. Try again shortly.", retryAfterSec }, {
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

function validateName(name) {
  const raw = String(name == null ? "" : name);
  const trimmed = raw.trim();
  if (!trimmed) return { error: "Enter your full name." };
  if (raw !== trimmed) return { error: "Remove spaces before or after your name." };
  const normalised = trimmed.replace(/\s+/g, " ");
  if (normalised.length > 80) return { error: "Name must be 80 characters or fewer." };
  return { name: normalised };
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

function clearOAuthStateHeaders() {
  return { "set-cookie": createCookie("lb_oauth_state", "", { clear: true, maxAge: 0 }) };
}

// Spread-friendly merge for headers that may both contain set-cookie. Node's
// http supports an array value for set-cookie, so when both sides set a cookie
// we surface both rather than letting Object.assign drop one.
function mergeHeaders(...sources) {
  const out = {};
  const cookies = [];
  for (const src of sources) {
    if (!src) continue;
    for (const [key, value] of Object.entries(src)) {
      if (key.toLowerCase() === "set-cookie") {
        if (Array.isArray(value)) cookies.push(...value);
        else if (value != null) cookies.push(value);
      } else {
        out[key] = value;
      }
    }
  }
  if (cookies.length === 1) out["set-cookie"] = cookies[0];
  else if (cookies.length > 1) out["set-cookie"] = cookies;
  return out;
}

function deleteExpiredSessionsForUser(userId) {
  // Clear stale sessions periodically as a safety net (does not affect the active session).
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?")
    .run(userId, new Date().toISOString());
}

function oauthProviderConfig(providerId) {
  return oauthProviders[String(providerId || "").toLowerCase()] || null;
}

function oauthRedirectUri(providerId) {
  return `${appUrl}/auth/${providerId}/callback`;
}

function oauthProviderReady(providerId) {
  const provider = oauthProviderConfig(providerId);
  return Boolean(provider?.clientId && provider?.clientSecret);
}

function safeNextPath(value, fallback = "/app") {
  const raw = String(value || "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return fallback;
  return raw.slice(0, 400);
}

function redirect(res, location, headers = {}) {
  res.writeHead(302, { ...headers, location });
  res.end();
}

function oauthErrorLocation(providerId, code = "failed") {
  const provider = oauthProviderConfig(providerId);
  const params = new URLSearchParams({
    auth_error: code,
    provider: provider?.label || "Provider"
  });
  return `/login?${params.toString()}`;
}

function createOAuthState({ providerId, nextPath }) {
  const state = randomUUID() + randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + 10 * 60_000);
  db.prepare("DELETE FROM oauth_states WHERE expires_at <= ?").run(now.toISOString());
  db.prepare("INSERT INTO oauth_states (state, provider, next_path, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run(state, providerId, nextPath, now.toISOString(), expires.toISOString());
  return state;
}

function consumeOAuthState({ state, providerId }) {
  const row = db.prepare(
    "SELECT * FROM oauth_states WHERE state = ? AND provider = ? AND expires_at > ?"
  ).get(state, providerId, new Date().toISOString());
  db.prepare("DELETE FROM oauth_states WHERE state = ?").run(state);
  return row || null;
}

async function fetchJsonOrThrow(url, options = {}, label = "OAuth request") {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      ...(options.headers || {})
    },
    ...options
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text }; }
  if (!response.ok) {
    const message = String(body.error_description || body.error || text || "").slice(0, 240);
    throw new Error(`${label} failed: ${response.status}${message ? ` ${message}` : ""}`);
  }
  return body;
}

async function exchangeOAuthCode(provider, code) {
  return fetchJsonOrThrow(provider.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: oauthRedirectUri(provider.id)
    }).toString()
  }, `${provider.label} token exchange`);
}

async function fetchOAuthProfile(provider, accessToken) {
  return fetchJsonOrThrow(provider.userInfoUrl, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  }, `${provider.label} profile lookup`);
}

function nameFromOAuthProfile(profile, email) {
  const candidate = profile.name || profile.displayName || profile.given_name || String(email || "").split("@")[0];
  const cleaned = String(candidate || "ListBoost Seller")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const result = validateName(cleaned);
  return result.name || "ListBoost Seller";
}

function findOrCreateOAuthUser({ providerId, profile }) {
  const email = normalizeEmail(profile.email || profile.mail || profile.userPrincipalName || profile.upn || "");
  if (!isValidEmail(email)) {
    throw new Error("OAuth profile did not include a verified email address.");
  }
  if (providerId === "google" && profile.email_verified === false) {
    throw new Error("Google did not mark this email address as verified.");
  }

  const name = nameFromOAuthProfile(profile, email);
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (existing) {
    db.prepare(`
      UPDATE users
      SET name = CASE WHEN name = '' THEN ? ELSE name END,
          email_verified = 1,
          updated_at = ?
      WHERE id = ?
    `).run(name, now, existing.id);
    recordAudit(existing.id, `oauth:${providerId}`, 0, "Signed in with OAuth provider");
    return db.prepare("SELECT * FROM users WHERE id = ?").get(existing.id);
  }

  const userId = randomUUID();
  const randomPassword = `${providerId}:${randomUUID()}:${randomBytes(16).toString("hex")}`;
  db.prepare(`
    INSERT INTO users (id, email, name, password_hash, email_verified, usage_this_month, usage_limit, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, 0, ?, ?, ?)
  `).run(userId, email, name, hashPassword(randomPassword), FREE_PLAN.monthlyLimit, now, now);
  recordAudit(userId, `oauth:${providerId}`, 0, "Account created with OAuth provider");
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
}

async function handleOAuthStart(req, res, providerId) {
  const visitor = getVisitor(req);
  const provider = oauthProviderConfig(providerId);
  if (!provider) {
    redirect(res, "/login?auth_error=unknown-provider", visitor.headers);
    return;
  }
  if (!oauthProviderReady(providerId)) {
    redirect(res, oauthErrorLocation(providerId, "not-configured"), visitor.headers);
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const nextPath = safeNextPath(url.searchParams.get("next"), "/app");
  const state = createOAuthState({ providerId, nextPath });
  const authUrl = new URL(provider.authorizationUrl);
  authUrl.searchParams.set("client_id", provider.clientId);
  authUrl.searchParams.set("redirect_uri", oauthRedirectUri(provider.id));
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", provider.scope);
  authUrl.searchParams.set("state", state);
  if (provider.id === "microsoft") authUrl.searchParams.set("response_mode", "query");

  redirect(res, authUrl.toString(), mergeHeaders(
    visitor.headers,
    { "set-cookie": createCookie("lb_oauth_state", `${providerId}:${state}`, { maxAge: 10 * 60 }) }
  ));
}

async function handleOAuthCallback(req, res, providerId) {
  const visitor = getVisitor(req);
  const provider = oauthProviderConfig(providerId);
  const headers = mergeHeaders(visitor.headers, clearOAuthStateHeaders());
  if (!provider) {
    redirect(res, "/login?auth_error=unknown-provider", headers);
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const providerError = url.searchParams.get("error");
  if (providerError) {
    redirect(res, oauthErrorLocation(providerId, "cancelled"), headers);
    return;
  }

  const code = String(url.searchParams.get("code") || "");
  const state = String(url.searchParams.get("state") || "");
  const cookieState = parseCookies(req).lb_oauth_state || "";
  if (!code || !state || cookieState !== `${providerId}:${state}`) {
    redirect(res, oauthErrorLocation(providerId, "state-mismatch"), headers);
    return;
  }

  const stateRow = consumeOAuthState({ state, providerId });
  if (!stateRow) {
    redirect(res, oauthErrorLocation(providerId, "expired"), headers);
    return;
  }

  try {
    const token = await exchangeOAuthCode(provider, code);
    if (!token.access_token) throw new Error(`${provider.label} did not return an access token.`);
    const profile = await fetchOAuthProfile(provider, token.access_token);
    const user = findOrCreateOAuthUser({ providerId, profile });
    deleteExpiredSessionsForUser(user.id);
    const sessionToken = createSession(user.id);
    redirect(res, safeNextPath(stateRow.next_path, "/app"), mergeHeaders(headers, authHeaders(sessionToken)));
  } catch (error) {
    console.error(`[oauth] ${providerId} sign-in failed:`, error);
    redirect(res, oauthErrorLocation(providerId, "failed"), headers);
  }
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

function generationCountForUser(userId) {
  if (!userId) return 0;
  const row = db.prepare("SELECT COUNT(*) AS count FROM generations WHERE user_id = ?").get(userId);
  return Number(row?.count || 0);
}

function repairInvertedUsageIfNeeded(user) {
  if (!user?.id || user.usage_limit == null) return user;
  const usedRaw = Number(user.usage_this_month || 0);
  const limitRaw = Number(user.usage_limit);
  if (!Number.isFinite(usedRaw) || !Number.isFinite(limitRaw) || limitRaw <= 0 || usedRaw <= limitRaw) {
    return user;
  }
  const current = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
  const currentUsed = Number(current?.usage_this_month || 0);
  const currentLimit = current?.usage_limit == null ? null : Number(current.usage_limit);
  if (current && (currentUsed !== usedRaw || currentLimit !== limitRaw)) {
    return repairInvertedUsageIfNeeded(current);
  }

  // Older admin tooling adjusted "used" instead of "allowance", which could create
  // impossible states like 20 / 3 listings used. Treat the larger number as the
  // intended allowance and keep real usage capped to the prior allowance.
  const generationCount = generationCountForUser(user.id);
  const repairedLimit = Math.max(0, Math.round(usedRaw));
  const repairedUsed = Math.min(Math.max(0, generationCount), Math.max(0, Math.round(limitRaw)), repairedLimit);
  const now = new Date().toISOString();
  db.prepare("UPDATE users SET usage_this_month = ?, usage_limit = ?, updated_at = ? WHERE id = ?")
    .run(repairedUsed, repairedLimit, now, user.id);
  recordAudit(user.id, "system:usage-repair", repairedLimit - limitRaw, "Repaired inverted usage/allowance values");
  return {
    ...user,
    usage_this_month: repairedUsed,
    usage_limit: repairedLimit,
    updated_at: now
  };
}

function getAccountUsage(user) {
  user = repairInvertedUsageIfNeeded(user);
  const planId = user.subscription_plan || "free";
  const plan = planForId(planId);
  const usedRaw = Number(user.usage_this_month || 0);
  const limitFromUser = user.usage_limit;
  const planLimit = plan.monthlyLimit;
  const limit = (limitFromUser == null) ? planLimit : Number(limitFromUser);
  const unlimited = limit == null;
  const used = Math.max(0, usedRaw);
  const remaining = unlimited ? null : Math.max(Number(limit) - used, 0);
  return {
    plan: planId,
    planName: plan.name,
    subscriptionStatus: user.subscription_status || "inactive",
    usageThisMonth: used,
    usageLimit: unlimited ? null : Number(limit),
    unlimited,
    remaining,
    billingPeriodEnd: user.billing_period_end || user.next_credit_refill || null
  };
}

function publicUser(user) {
  if (!user) return null;
  const usage = getAccountUsage(user);
  return {
    id: user.id,
    name: user.name || "",
    email: user.email,
    emailVerified: Boolean(user.email_verified),
    plan: usage.plan,
    planName: usage.planName,
    subscriptionPlan: usage.plan,
    subscriptionStatus: usage.subscriptionStatus,
    usageThisMonth: usage.usageThisMonth,
    usageLimit: usage.usageLimit,
    unlimited: usage.unlimited,
    billingPeriodEnd: usage.billingPeriodEnd
  };
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
    emailMockMode: process.env.RESEND_MOCK_EMAIL === "true",
    emailFromConfigured: Boolean(emailFrom),
    emailFromDomain: emailDomainOf(emailFrom) || null,
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
  if (stripe && !stripeWebhookSecret) warnings.push("STRIPE_WEBHOOK_SECRET is missing. Subscriptions will remain pending until the webhook is configured.");
  if (requireEmailVerification && !resendApiKey) warnings.push("RESEND_API_KEY is missing. Verification links will only be logged, not emailed.");
  if (!adminEmail || !adminPassword) warnings.push("ADMIN_EMAIL / ADMIN_PASSWORD not set. /admin will return 401.");
  for (const warning of warnings) console.warn(`[launch-check] ${warning}`);
}

function buildPrompt({ tone, itemDetails, category, size, condition, buyerQuestion, sellerMode, negotiationGoal }) {
  return [
    "You are Vinted Listing Booster, a conversion-focused resale listing assistant for Vinted sellers.",
    "Rewrite rough seller notes into a listing that is accurate, searchable, buyer-friendly, safe, and easy to trust.",
    "The seller is paying to save thinking time, so DO NOT merely repeat the input with commas. Transform terse notes into a polished, useful listing package while staying honest about what is known.",
    "TITLE: write a natural Vinted-style title under 65 characters. It should feel human, not like a keyword dump. Use brand, colour, item type, material, size, and condition only when provided.",
    "DESCRIPTION: write 5-7 short, copy-paste-ready lines. Lead with a buyer-friendly sentence, then structure facts into useful lines for size, condition, colour/material, wear/flaws, styling/use case, and postage/questions. No markdown tables and no emojis.",
    "DESCRIPTION QUALITY: add value by explaining condition and buyer use clearly, but never invent brand, authenticity, measurements, fit, or postage speed. If the notes say 'light creasing' or 'cleaned soles', make that sound honest and reassuring rather than repetitive.",
    "PRICE: use realistic UK resale pricing in GBP for Vinted. Include a short reason in priceGuidance that mentions condition, demand, and negotiation room.",
    "KEYWORDS: include 8-10 Vinted search phrases buyers would actually type. Avoid generic filler such as 'vinted', 'for sale', 'wardrobe clearout', and avoid repeating the exact title. Include useful variants: item type, material, colour, size, style, condition, and buyer synonyms.",
    "BUYER REPLY: write in a natural UK seller tone. Friendly, honest, concise, and useful.",
    "Use UK spelling and practical postage wording only when provided by the seller.",
    "If rough notes are short or contain obvious typos, infer cautiously from the words provided. For example, 'back' before a fashion item may mean 'black', but do not invent unrelated brands, sizes, conditions, or examples.",
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

function cleanSearchPhrase(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/#/g, "")
    .replace(/[^\p{L}\p{N}\s./-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resultList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(/[,;\n]/);
  return [];
}

function modelSearchTerms(result = {}) {
  return [...resultList(result.searchTerms), ...resultList(result.tags), ...resultList(result.keywords)];
}

function usefulSearchTerms(result = {}, facts = {}) {
  const filler = new Set(["vinted", "vinted uk", "for sale", "preloved", "second hand", "uk seller", "wardrobe clearout"]);
  const fromModel = modelSearchTerms(result)
    .map(cleanSearchPhrase)
    .filter((term) => term.length >= 3 && !filler.has(term));
  const fallback = keywordPhrasesFor(facts).map(cleanSearchPhrase);
  return uniqueSampleItems([...fromModel, ...fallback])
    .filter(Boolean)
    .slice(0, 10);
}

function descriptionNeedsFallback(description = "", itemDetails = "") {
  const cleanDescription = String(description || "").trim();
  const cleanInput = String(itemDetails || "").trim();
  if (cleanDescription.split(/\n+/).filter(Boolean).length >= 4) return false;
  if (cleanDescription.length < 90) return true;
  if (cleanInput.length >= 20 && cleanDescription.toLowerCase().includes(cleanInput.toLowerCase().slice(0, 80))) return true;
  return false;
}

function polishListingResult(result, input = {}) {
  if (!looksLikeListing(result)) return result;
  const facts = detectItemFacts(input.itemDetails || input.notes || "", input.size || "");
  const fallback = sampleResult({ ...input, itemDetails: input.itemDetails || input.notes || "" });
  const searchTerms = usefulSearchTerms(result, facts);
  const polished = {
    ...fallback,
    ...result,
    title: String(result.title || fallback.title).trim(),
    description: descriptionNeedsFallback(result.description, input.itemDetails || input.notes)
      ? fallback.description
      : String(result.description).trim(),
    tags: searchTerms.length >= 5 ? searchTerms : fallback.tags,
    searchTerms: searchTerms.length >= 5 ? searchTerms : fallback.searchTerms,
    priceOptions: result.priceOptions && typeof result.priceOptions === "object" ? result.priceOptions : fallback.priceOptions,
    priceGuidance: String(result.priceGuidance || "").trim().length >= 50 ? result.priceGuidance : fallback.priceGuidance,
    photoChecklist: resultList(result.photoChecklist).length >= 3 ? resultList(result.photoChecklist) : fallback.photoChecklist,
    buyerReplies: resultList(result.buyerReplies).length ? resultList(result.buyerReplies) : fallback.buyerReplies,
    missingDetails: resultList(result.missingDetails).length ? resultList(result.missingDetails) : fallback.missingDetails,
    listingScore: result.listingScore && typeof result.listingScore === "object" ? result.listingScore : fallback.listingScore
  };
  return polished;
}

function generationFeatureFromBody(body = {}) {
  const requested = String(body.feature || "notes").trim().toLowerCase();
  if (requested === "photos" || requested === "photo") return "photos";
  if (requested === "score" || requested === "listing-score" || requested === "listingscore") return "listingScore";
  if (requested === "reply" || requested === "replies" || requested === "buyer-replies" || requested === "buyerreplies") return "buyerReplies";
  if (String(body.buyerQuestion || "").trim()) return "buyerReplies";
  return "notes";
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

function detectItemFacts(itemDetails, explicitSize = "") {
  const raw = String(itemDetails || "");
  const normalised = raw
    .toLowerCase()
    .replace(/\bback(?=\s+(?:lv|louis vuitton|belt|bag|dress|coat|jacket|trainers|shoes))\b/g, "black");
  const brandPatterns = [
    ["louis vuitton", "Louis Vuitton"],
    ["lv", "LV"],
    ["zara", "Zara"],
    ["nike", "Nike"],
    ["adidas", "Adidas"],
    ["gucci", "Gucci"],
    ["prada", "Prada"],
    ["h&m", "H&M"],
    ["hm", "H&M"],
    ["mango", "Mango"],
    ["asos", "ASOS"],
    ["river island", "River Island"],
    ["primark", "Primark"]
  ];
  const itemTypes = [
    "belt",
    "dress",
    "trainers",
    "shoes",
    "boots",
    "bag",
    "coat",
    "jacket",
    "jeans",
    "trousers",
    "jumper",
    "hoodie",
    "top",
    "skirt",
    "bundle"
  ];
  const colours = ["black", "navy", "white", "cream", "beige", "brown", "grey", "gray", "blue", "red", "green", "pink", "purple", "orange"];
  const brand = brandPatterns.find(([needle]) => normalised.includes(needle))?.[1] || "";
  const itemType = itemTypes.find((type) => normalised.includes(type)) || "item";
  const colourRaw = colours.find((colour) => normalised.includes(colour)) || "";
  const colour = colourRaw === "gray" ? "grey" : colourRaw;
  const sizeMatch = normalised.match(/\b(?:uk\s*)?\d{1,2}(?:\.\d)?\b|\b(?:xs|s|m|l|xl|xxl)\b|\bage\s*\d{1,2}(?:-\d{1,2})?\b/i);
  const detectedSize = explicitSize || (sizeMatch ? sizeMatch[0].replace(/\buk\s*/i, "UK ").toUpperCase() : "");
  const material = /leather/.test(normalised) ? "leather"
    : /satin/.test(normalised) ? "satin"
      : /denim/.test(normalised) ? "denim"
        : /cotton/.test(normalised) ? "cotton"
          : "";
  const wear = uniqueSampleItems([
    /light creas/.test(normalised) && "light creasing",
    /cleaned sole/.test(normalised) && "cleaned soles",
    /worn twice/.test(normalised) && "worn twice",
    /no marks?/.test(normalised) && "no marks stated",
    /zip/.test(normalised) && "zip fastening"
  ]);
  return { brand, itemType, colour, detectedSize, material, wear };
}

function uniqueSampleItems(items = []) {
  return Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean)));
}

function samplePriceFor(itemType = "") {
  if (/belt|bag|jewellery|accessor/i.test(itemType)) {
    return { fastSale: "GBP 10", fairPrice: "GBP 16", maxPrice: "GBP 22", lowestOffer: "GBP 12", startPrice: "GBP 19" };
  }
  if (/trainers|shoes|boots/i.test(itemType)) {
    return { fastSale: "GBP 18", fairPrice: "GBP 26", maxPrice: "GBP 34", lowestOffer: "GBP 22", startPrice: "GBP 30" };
  }
  return { fastSale: "GBP 8", fairPrice: "GBP 12", maxPrice: "GBP 15", lowestOffer: "GBP 9", startPrice: "GBP 14" };
}

function titleCaseWords(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.length <= 2 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

function sizePhrase(size = "") {
  const cleaned = String(size || "").trim();
  if (!cleaned) return "";
  return /^UK\s/i.test(cleaned) ? cleaned.toUpperCase() : cleaned.toUpperCase();
}

function itemDisplayName(facts = {}) {
  return [
    facts.colour && titleCaseWords(facts.colour),
    facts.material && titleCaseWords(facts.material),
    titleCaseWords(facts.itemType)
  ].filter(Boolean).join(" ").trim() || "Preloved Item";
}

function conditionLine(facts = {}, condition = "") {
  const wear = facts.wear || [];
  if (condition && wear.length) return `${condition}; ${wear.join(", ")}.`;
  if (condition) return condition;
  if (wear.length) return `Preloved with ${wear.join(", ")}.`;
  return "Preloved condition - please check photos before buying.";
}

function styleUseLine(facts = {}) {
  if (/trainers|shoes|boots/i.test(facts.itemType)) {
    return "Easy everyday pair for jeans, cargos, leggings or casual dresses.";
  }
  if (/dress|skirt|top|jacket|coat|jumper|hoodie|trousers|jeans/i.test(facts.itemType)) {
    return "Easy to style for casual outfits, workwear or weekend plans.";
  }
  if (/belt|bag|jewellery|accessor/i.test(facts.itemType)) {
    return "Simple accessory for finishing everyday or going-out outfits.";
  }
  return "Useful wardrobe piece for everyday styling.";
}

function keywordPhrasesFor(facts = {}) {
  const item = facts.itemType || "item";
  const size = facts.detectedSize ? sizePhrase(facts.detectedSize).toLowerCase() : "";
  const colour = facts.colour || "";
  const material = facts.material || "";
  const brand = facts.brand || "";
  const base = [];
  if (brand) base.push(`${brand.toLowerCase()} ${item}`);
  if (colour && material) base.push(`${colour} ${material} ${item}`);
  if (size) base.push(`${item} ${size}`);
  if (/trainers|shoes|boots/i.test(item)) {
    base.push(
      `${colour || "preloved"} ${item}`.trim(),
      material ? `${material} ${item}` : "",
      size ? `${size} ${item}` : `everyday ${item}`,
      "casual everyday trainers",
      colour === "white" ? "preloved white shoes" : `preloved ${item}`,
      (facts.wear || []).includes("cleaned soles") ? "clean sole trainers" : ""
    );
  } else if (/dress/i.test(item)) {
    base.push(
      `${colour || "preloved"} dress`.trim(),
      size ? `dress ${size}` : "",
      material ? `${material} midi dress` : "midi dress",
      "occasion dress",
      "evening dress",
      "smart casual dress"
    );
  } else if (/belt/i.test(item)) {
    base.push(
      `${colour || "preloved"} belt`.trim(),
      brand ? `${brand.toLowerCase()} belt as stated` : "statement belt",
      "waist belt",
      "designer style belt",
      "preloved accessory",
      "smart casual belt"
    );
  } else {
    base.push(`${colour} ${item}`.trim(), size ? `${item} ${size}` : "", "preloved style", "everyday outfit");
  }
  return uniqueSampleItems(base).filter(Boolean).slice(0, 10);
}

function sampleResult({ tone, itemDetails, category, size, condition, buyerQuestion }) {
  const facts = detectItemFacts(itemDetails, size);
  const itemName = itemDisplayName(facts);
  const titleParts = [facts.brand, itemName, facts.detectedSize]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const titleCore = titleParts || itemName || "Preloved Vinted Item";
  const price = samplePriceFor(facts.itemType);
  const brandLine = facts.brand ? `Brand: ${facts.brand}${/^(LV|Louis Vuitton|Gucci|Prada)$/i.test(facts.brand) ? " (as stated by seller - add proof photos if relevant)" : ""}` : "Brand: please confirm before posting";
  const colourMaterial = [facts.colour && titleCaseWords(facts.colour), facts.material && titleCaseWords(facts.material)].filter(Boolean).join(" ");
  const keywordBase = keywordPhrasesFor(facts);

  return {
    title: titleCore,
    description: [
      `${titleCore} in a wearable, buyer-friendly condition.`,
      brandLine,
      `Size: ${facts.detectedSize || "please confirm before posting"}`,
      `Condition: ${conditionLine(facts, condition)}`,
      `Colour/material: ${colourMaterial || "please confirm before posting"}`,
      `Wear/flaws: ${facts.wear?.length ? facts.wear.join(", ") : "add close-up photos of any marks before posting"}`,
      `Style/use: ${styleUseLine(facts)}`,
      "Happy to answer questions or send close-ups before purchase."
    ].join("\n"),
    tags: keywordBase,
    searchTerms: keywordBase,
    listingScore: {
      score: 82,
      summary: "Clear enough to list, but it will be stronger after confirming the missing details.",
      improvements: ["Add a clear brand or label photo", "Confirm size or dimensions", "Show any wear in natural light"]
    },
    priceOptions: {
      ...price,
      autoCounterOffer: price.lowestOffer,
      bundleDiscount: "10%"
    },
    priceGuidance: `List at ${price.startPrice} to leave room for offers. Expect serious buyers around ${price.fairPrice}; use ${price.fastSale} if you want a quicker sale. The suggested range assumes the wear shown is clear in photos.`,
    photoChecklist: [
      "Full front photo in natural light",
      `Close-up of the ${facts.itemType} details and any hardware or texture`,
      "Brand, label, size or proof photo if relevant",
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
    missingDetails: ["Exact size or dimensions", facts.brand ? "Proof or label photo if brand matters" : "Brand/model", "Condition details", "Shipping or collection options"],
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
      max_output_tokens: 900,
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
    "Do not simply caption the photo. Turn visible facts into a useful Vinted listing with buyer-friendly condition wording, styling/use context, and clear missing-detail prompts.",
    "Include 8-10 Vinted-friendly search phrases as plain keywords, not hashtags. Avoid generic filler such as 'vinted', 'for sale', and 'wardrobe clearout'.",
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
      max_output_tokens: 1000,
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
  db.prepare("UPDATE users SET usage_this_month = usage_this_month + 1, updated_at = ? WHERE id = ?").run(now, user.id);
  const persisted = savedInput ? { ...result, _input: savedInput } : result;
  db.prepare("INSERT INTO generations (id, user_id, title, score, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    randomUUID(),
    user.id,
    result.title || null,
    Number(result.listingScore?.score || 0),
    JSON.stringify(persisted),
    now
  );
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

    if (!userCanUseFeature(user, "photos")) {
      sendFeatureLocked(res, visitor, user, "photos");
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

    const usage = getAccountUsage(user);
    if (!usage.unlimited && usage.remaining <= 0) {
      json(res, 402, { error: "Upgrade your plan to continue generating listings", usage }, visitor.headers);
      return;
    }

    const input = { tone, notes, category, size, condition, sellerMode, negotiationGoal };
    let result;
    let provider = "demo";

    const startedAt = Date.now();
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
      json(res, 502, { error: "The model returned an unexpected response. No listing was counted. Try again." }, visitor.headers);
      return;
    }
    result = polishListingResult(result, { itemDetails: [input.notes, input.category, input.size, input.condition].filter(Boolean).join(" "), ...input });

    const updatedUser = recordGeneration(user, result, { source: "photos", ...input });
    console.log(`[generation] completed route=/api/generate-from-photos user=${user.id.slice(0, 8)} durationMs=${Date.now() - startedAt} plan=${user.subscription_plan || "free"} provider=${provider} photos=${photos.length}`);
    json(res, 200, { ...result, provider, source: "photos", usage: getAccountUsage(updatedUser), user: publicUser(updatedUser) }, visitor.headers);
  } catch (error) {
    console.error(error);
    if (error && error.message === "Request is too large.") {
      json(res, 413, { error: "Photos are too large. Try fewer or smaller photos." }, visitor.headers);
      return;
    }
    json(res, 502, { error: "Could not build a listing from these photos. No listing was counted. Try again or add a clearer photo." }, visitor.headers);
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
    const requestedFeature = generationFeatureFromBody(body);
    if (!userCanUseFeature(user, requestedFeature)) {
      sendFeatureLocked(res, visitor, user, requestedFeature);
      return;
    }
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

    const usage = getAccountUsage(user);
    if (!usage.unlimited && usage.remaining <= 0) {
      json(res, 402, { error: "Upgrade your plan to continue generating listings", usage }, visitor.headers);
      return;
    }

    const input = { feature: requestedFeature, tone, itemDetails, category, size, condition, buyerQuestion, sellerMode, negotiationGoal };
    let result;
    let provider = "demo";

    const startedAt = Date.now();
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
      json(res, 502, { error: "The model returned an unexpected response. No listing was counted. Try again." }, visitor.headers);
      return;
    }
    result = polishListingResult(result, input);

    const updatedUser = recordGeneration(user, result, { source: "notes", ...input });
    console.log(`[generation] completed route=/api/generate user=${user.id.slice(0, 8)} durationMs=${Date.now() - startedAt} plan=${user.subscription_plan || "free"} provider=${provider}`);
    json(res, 200, { ...result, provider, usage: getAccountUsage(updatedUser), user: publicUser(updatedUser) }, visitor.headers);
  } catch (error) {
    console.error(error);
    json(res, 502, { error: "Could not improve this listing. No listing was counted. Check your API key or try again." }, visitor.headers);
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
      category: String(body.category || "").trim().slice(0, 80),
      tone: "friendly",
      sellerMode: "clearout",
      negotiationGoal: "friendly",
      size: String(body.size || "").trim().slice(0, 80),
      condition: String(body.condition || "").trim().slice(0, 80),
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
    result = polishListingResult(result, input);

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
      usage: {
        plan: "free",
        planName: "Free",
        subscriptionStatus: "inactive",
        usageThisMonth: 0,
        usageLimit: FREE_PLAN.monthlyLimit,
        unlimited: false,
        remaining: FREE_PLAN.monthlyLimit,
        billingPeriodEnd: null
      },
      stripeReady: Boolean(stripe),
      aiProvider: getAiProvider(),
      appUrl,
      adminEnabled: Boolean(adminEmail && adminPassword),
      subscriptionPlans: publicSubscriptionPlans(),
      emailVerified: false,
      verificationRequired: requireEmailVerification
    }, visitor.headers);
    return;
  }

  json(res, 200, {
    user: publicUser(user),
    usage: getAccountUsage(user),
    stripeReady: Boolean(stripe),
    aiProvider: getAiProvider(),
    appUrl,
    adminEnabled: Boolean(adminEmail && adminPassword),
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
  if (!userCanUseFeature(user, "history")) {
    sendFeatureLocked(res, visitor, user, "history");
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

  const audit = db.prepare(`
    SELECT actor, delta, reason, created_at
    FROM credit_audit
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(user.id).map((row) => ({
    type: "audit",
    actor: row.actor,
    delta: row.delta,
    reason: row.reason,
    createdAt: row.created_at
  }));
  const cycles = db.prepare(`
    SELECT stripe_invoice_id, stripe_subscription_id, plan, processed_at
    FROM subscription_refills
    WHERE user_id = ?
    ORDER BY processed_at DESC
    LIMIT 20
  `).all(user.id).map((row) => ({
    type: "billing-cycle",
    reference: row.stripe_invoice_id,
    subscriptionId: row.stripe_subscription_id,
    plan: row.plan,
    createdAt: row.processed_at
  }));

  json(res, 200, {
    user: publicUser(user),
    usage: getAccountUsage(user),
    subscription: publicSubscriptionForUser(user),
    subscriptionPlans: publicSubscriptionPlans(),
    cycles,
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
  if (!userCanUseFeature(user, "history")) {
    sendFeatureLocked(res, visitor, user, "history");
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
    if (!userCanUseFeature(user, "history")) {
      sendFeatureLocked(res, visitor, user, "history");
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

    const usage = getAccountUsage(user);
    if (!usage.unlimited && usage.remaining <= 0) {
      json(res, 402, { error: "Upgrade your plan to continue generating listings", usage }, visitor.headers);
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
    const startedAt = Date.now();
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
      json(res, 502, { error: "The model returned an unexpected response. No listing was counted. Try again." }, visitor.headers);
      return;
    }
    result = polishListingResult(result, input);

    const updatedUser = recordGeneration(user, result, { source: "notes", regenerated_from: row.id, ...input });
    console.log(`[generation] completed route=/api/regenerate user=${user.id.slice(0, 8)} durationMs=${Date.now() - startedAt} plan=${user.subscription_plan || "free"} provider=${provider}`);
    json(res, 200, { ...result, provider, regenerated: true, usage: getAccountUsage(updatedUser), user: publicUser(updatedUser) }, visitor.headers);
  } catch (error) {
    console.error(error);
    json(res, 502, { error: "Could not regenerate this listing. No listing was counted. Try again." }, visitor.headers);
  }
}

async function handleLegacyCreditPack(req, res, forcedPackId = "") {
  const visitor = getVisitor(req);
  const isRouteCheckout = Boolean(forcedPackId);
  if (isRouteCheckout) {
    res.writeHead(303, { location: "/pricing", ...visitor.headers });
    res.end();
    return;
  }
  json(res, 410, {
    error: "ListBoost no longer sells one-time credit packs. Choose a monthly plan from /pricing.",
    pricingUrl: "/pricing"
  }, visitor.headers);
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
      monthlyLimit: plan.monthlyLimit == null ? "unlimited" : String(plan.monthlyLimit)
    }
  });
  syncSubscriptionFields({
    userId: user.id,
    customerId: stripeId(updated.customer),
    subscriptionId: stripeId(updated.id),
    plan,
    status: updated.status || "active",
    billingPeriodEnd: subscriptionPeriodEnd(updated) || user.billing_period_end || user.next_credit_refill || nextMonthIso()
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
        usage: getAccountUsage(user),
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
        usage: getAccountUsage(updatedUser),
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

async function handleBillingPortal(req, res) {
  const visitor = getVisitor(req);
  const user = getUserBySession(req);
  if (!user) {
    json(res, 401, { error: "Sign in to manage billing.", authUrl: `/signup?next=${encodeURIComponent("/app/billing")}` }, visitor.headers);
    return;
  }
  if (!stripe) {
    json(res, 503, { error: "Stripe is not connected yet." }, visitor.headers);
    return;
  }
  if (!user.stripe_customer_id && process.env.STRIPE_MOCK_CHECKOUT !== "true") {
    json(res, 400, { error: "Start a subscription before opening the billing portal." }, visitor.headers);
    return;
  }

  try {
    const session = await createBillingPortalSession({ user });
    json(res, 200, { url: session.url }, visitor.headers);
  } catch (error) {
    console.error("[stripe] billing portal session failed:", error);
    json(res, 500, { error: "Could not open billing portal." }, visitor.headers);
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
  const subscriptionGrant = db.prepare("SELECT processed_at FROM subscription_refills WHERE stripe_invoice_id = ? AND user_id = ?").get(`checkout:${sessionId}`, user.id);
  json(res, 200, {
    ok: true,
    pending: !subscriptionGrant,
    usage: getAccountUsage(fresh),
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

function syncSubscriptionFields({ userId, customerId, subscriptionId, plan, status = "active", billingPeriodEnd }) {
  const now = new Date().toISOString();
  const periodEnd = billingPeriodEnd || nextMonthIso();
  db.prepare(`
    UPDATE users
    SET subscription_plan = ?,
        subscription_status = ?,
        usage_limit = ?,
        billing_period_end = ?,
        next_credit_refill = ?,
        stripe_customer_id = COALESCE(?, stripe_customer_id),
        stripe_subscription_id = COALESCE(?, stripe_subscription_id),
        updated_at = ?
    WHERE id = ?
  `).run(
    plan.id,
    status,
    plan.monthlyLimit == null ? null : Number(plan.monthlyLimit),
    periodEnd,
    periodEnd,
    customerId || null,
    subscriptionId || null,
    now,
    userId
  );
}

function clearSubscriptionFields(userId, status = "canceled") {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET subscription_plan = 'free',
        subscription_status = ?,
        usage_limit = ?,
        billing_period_end = NULL,
        next_credit_refill = NULL,
        stripe_subscription_id = NULL,
        updated_at = ?
    WHERE id = ?
  `).run(status, FREE_PLAN.monthlyLimit, now, userId);
}

function startBillingCycleOnce({ grantId, userId, subscriptionId, plan, billingPeriodEnd, source }) {
  const existing = db.prepare("SELECT stripe_invoice_id FROM subscription_refills WHERE stripe_invoice_id = ?").get(grantId);
  if (existing) return false;
  const now = new Date().toISOString();
  const periodEnd = billingPeriodEnd || nextMonthIso();
  const limit = plan.monthlyLimit == null ? null : Number(plan.monthlyLimit);
  db.prepare(`
    INSERT INTO subscription_refills (stripe_invoice_id, stripe_subscription_id, user_id, plan, credits, processed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(grantId, subscriptionId || null, userId, plan.id, limit == null ? 0 : limit, now);
  db.prepare(`
    UPDATE users
    SET subscription_plan = ?,
        subscription_status = 'active',
        usage_this_month = 0,
        usage_limit = ?,
        billing_period_end = ?,
        next_credit_refill = ?,
        stripe_subscription_id = COALESCE(?, stripe_subscription_id),
        updated_at = ?
    WHERE id = ?
  `).run(plan.id, limit, periodEnd, periodEnd, subscriptionId || null, now, userId);
  recordAudit(userId, source || "stripe:subscription", 0, `Billing cycle started on ${plan.name}`);
  console.log(`[billing-cycle] started user=${userId.slice(0, 8)} plan=${plan.id} limit=${limit == null ? "unlimited" : limit} periodEnd=${periodEnd} source=${source || "stripe:subscription"}`);

  // Fire-and-forget: send a subscription confirmation email if this looks like a fresh activation.
  // Renewals are silent (they would just re-confirm the existing plan).
  const isFreshActivation = String(source || "").includes("subscription-start");
  if (isFreshActivation) {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    if (user) {
      // sendSubscriptionConfirmationEmail catches all errors internally and never throws.
      sendSubscriptionConfirmationEmail(user, plan, periodEnd).then((result) => {
        if (!result.delivered) {
          console.warn(`[billing-cycle] confirmation email NOT delivered user=${userId.slice(0, 8)} reason=${result.reason || "unknown"}${result.status ? ` status=${result.status}` : ""}`);
        }
      });
    }
  } else {
    console.log(`[billing-cycle] skipping confirmation email user=${userId.slice(0, 8)} source=${source || "stripe:subscription"} (not a fresh activation)`);
  }
  return true;
}

function emailDomainOf(address) {
  const match = String(address || "").trim().match(/@([^>\s]+?)>?$/);
  return match ? match[1].toLowerCase() : "";
}

async function sendSubscriptionConfirmationEmail(user, plan, periodEnd) {
  const safeUser = user?.id ? `${user.id.slice(0, 8)}@${emailDomainOf(user.email) || "unknown"}` : "unknown";
  if (!user?.email) {
    console.warn(`[subscription-email] skipped: missing email for user ${safeUser}`);
    return { delivered: false, reason: "missing-email" };
  }
  const limitLine = plan.monthlyLimit == null ? "Unlimited listings per month" : `${plan.monthlyLimit} listings per month`;
  const cycleLine = periodEnd ? `Your first cycle ends ${new Date(periodEnd).toUTCString()}.` : "";
  const link = `${appUrl}/app/notes`;
  const subject = `Your ListBoost ${plan.name} subscription is active`;
  const text = [
    `Hi ${user.name || "there"},`,
    "",
    `Your ListBoost ${plan.name} plan is active.`,
    `${limitLine}.`,
    cycleLine,
    "",
    `Start generating: ${link}`,
    "",
    "Need help? Reply to this email or contact support@listboost.uk.",
    "ListBoost is independent and is not affiliated with Vinted."
  ].filter(Boolean).join("\n");
  const html = `
    <div style="margin:0;background:#fbfffd;padding:28px;font-family:Inter,Arial,sans-serif;color:#10201e">
      <div style="max-width:520px;margin:0 auto;border:1px solid #dbe8e5;border-radius:18px;background:#ffffff;padding:28px">
        <p style="margin:0 0 12px;color:#00b3a4;font-weight:800;letter-spacing:.08em;text-transform:uppercase">ListBoost</p>
        <h1 style="margin:0 0 12px;font-size:24px;line-height:1.2">Your ${escapeHtmlSafe(plan.name)} plan is active</h1>
        <p style="margin:0 0 12px;color:#5c716e;line-height:1.6">${escapeHtmlSafe(limitLine)}.</p>
        ${cycleLine ? `<p style="margin:0 0 18px;color:#5c716e;line-height:1.6">${escapeHtmlSafe(cycleLine)}</p>` : ""}
        <p style="margin:0 0 18px"><a href="${link}" style="display:inline-block;background:#00b3a4;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:800">Start generating</a></p>
        <p style="margin:18px 0 0;color:#5c716e;font-size:13px">Need help? Reply to this email or contact <a href="mailto:support@listboost.uk" style="color:#007f75">support@listboost.uk</a>. ListBoost is independent and is not affiliated with Vinted.</p>
      </div>
    </div>
  `;

  if (process.env.RESEND_MOCK_EMAIL === "true") {
    console.log(`[subscription-email] mock mode (RESEND_MOCK_EMAIL=true) for ${safeUser} on plan=${plan.id} - skipped real send`);
    return { delivered: false, reason: "mock-mode" };
  }
  if (!resendApiKey) {
    console.warn(`[subscription-email] RESEND_API_KEY missing - cannot deliver to ${safeUser} on plan=${plan.id}; preview link: ${link}`);
    return { delivered: false, reason: "missing-api-key" };
  }

  try {
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
    const rawBody = await response.text().catch(() => "");
    let parsed = null;
    try { parsed = rawBody ? JSON.parse(rawBody) : null; } catch { parsed = null; }
    if (!response.ok) {
      const safeMessage = String(parsed?.message || parsed?.error || rawBody || "").slice(0, 200);
      console.error(`[subscription-email] Subscription confirmation email failed status=${response.status} user=${safeUser} plan=${plan.id} from=${emailDomainOf(emailFrom)} to=${emailDomainOf(user.email)} message="${safeMessage}"`);
      return { delivered: false, reason: "http-error", status: response.status, message: safeMessage };
    }
    const messageId = parsed?.id || parsed?.message_id || null;
    console.log(`[subscription-email] Subscription confirmation email queued for ${safeUser} plan=${plan.id} from=${emailDomainOf(emailFrom)} to=${emailDomainOf(user.email)} messageId=${messageId || "n/a"}`);
    return { delivered: true, messageId };
  } catch (error) {
    console.error(`[subscription-email] Subscription confirmation email failed network user=${safeUser} plan=${plan.id} message="${String(error?.message || error).slice(0, 200)}"`);
    return { delivered: false, reason: "network", message: String(error?.message || error).slice(0, 200) };
  }
}

function escapeHtmlSafe(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  const billingPeriodEnd = subscriptionPeriodEnd(subscription) || nextMonthIso();
  const user = findUserForStripeSubscription({ userId, subscriptionId, customerId });
  if (!user) {
    console.warn(`Webhook: subscription checkout for unknown user ${userId} (session ${session.id})`);
    return false;
  }

  syncSubscriptionFields({ userId: user.id, customerId, subscriptionId, plan, status, billingPeriodEnd });
  startBillingCycleOnce({
    grantId: `checkout:${session.id}`,
    userId: user.id,
    subscriptionId,
    plan,
    billingPeriodEnd,
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

  const billingPeriodEnd = invoicePeriodEnd(invoice) || nextMonthIso();
  syncSubscriptionFields({
    userId: user.id,
    customerId,
    subscriptionId,
    plan,
    status: "active",
    billingPeriodEnd
  });

  if (invoice.billing_reason === "subscription_create") return false;
  return startBillingCycleOnce({
    grantId: `invoice:${invoice.id}`,
    userId: user.id,
    subscriptionId,
    plan,
    billingPeriodEnd,
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
  const billingPeriodEnd = subscriptionPeriodEnd(subscription) || user.billing_period_end || user.next_credit_refill || nextMonthIso();
  syncSubscriptionFields({
    userId: user.id,
    customerId,
    subscriptionId,
    plan,
    status: subscription.status || "active",
    billingPeriodEnd
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
        console.warn(`Webhook: ignoring non-subscription session ${session.id} (one-time packs are no longer sold).`);
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
  db.prepare("UPDATE email_verifications SET used_at = ? WHERE user_id = ? AND used_at IS NULL")
    .run(now.toISOString(), userId);
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
    res.writeHead(302, { ...visitor.headers, location: "/verify-email?status=missing" });
    res.end();
    return;
  }

  const row = db.prepare(
    "SELECT * FROM email_verifications WHERE token = ? AND expires_at > ? AND used_at IS NULL"
  ).get(token, new Date().toISOString());
  if (!row) {
    res.writeHead(302, { ...visitor.headers, location: "/verify-email?status=invalid" });
    res.end();
    return;
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?").run(now, row.user_id);
  db.prepare("UPDATE email_verifications SET used_at = ? WHERE token = ?").run(now, token);

  res.writeHead(302, { ...visitor.headers, location: "/app?verified=1" });
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

  const sessionToken = parseCookies(req).lb_session || user.id;
  const limit = rateLimit(`resend-verification:${sessionToken}`, { max: 1, windowMs: 60_000 });
  if (!limit.ok) {
    tooManyRequests(res, visitor, limit.retryAfterSec, "Wait 60 seconds before requesting another verification email.");
    return;
  }

  const token = createVerificationToken(user.id);
  try {
    const delivery = await sendVerificationEmail(user, token);
    json(res, 200, { ok: true, delivered: delivery.delivered }, visitor.headers);
  } catch (error) {
    console.error("[email] verification send failed:", error);
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
          console.error("[email] password reset send failed:", error);
        }
      }
    }
    json(res, 200, { ok: true, message: "If an account exists for that email, we'll send reset instructions." }, visitor.headers);
  } catch (error) {
    console.error("[email] password reset request failed:", error);
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

async function handleUpdateProfile(req, res) {
  const visitor = getVisitor(req);
  const user = getUserBySession(req);
  if (!user) {
    json(res, 401, { error: "Sign in to update your account." }, visitor.headers);
    return;
  }

  try {
    const body = JSON.parse(await readBody(req, 30_000) || "{}");
    const nameResult = validateName(body.name);
    const email = normalizeEmail(body.email || user.email);
    if (nameResult.error) {
      json(res, 400, { error: nameResult.error, field: "name" }, visitor.headers);
      return;
    }
    if (!isValidEmail(email)) {
      json(res, 400, { error: "Enter a valid email address.", field: "email" }, visitor.headers);
      return;
    }

    const emailChanged = email !== user.email;
    if (emailChanged && Number(user.email_verified || 0) === 1) {
      json(res, 400, {
        error: "Verified email cannot be changed. Contact support if you need to update it.",
        field: "email"
      }, visitor.headers);
      return;
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE users
      SET name = ?, email = ?, email_verified = ?, updated_at = ?
      WHERE id = ?
    `).run(nameResult.name, email, emailChanged ? 0 : Number(user.email_verified || 0), now, user.id);

    const nextUser = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    let verificationDelivery = null;
    if (emailChanged && requireEmailVerification) {
      const token = createVerificationToken(user.id);
      try {
        verificationDelivery = await sendVerificationEmail(nextUser, token);
      } catch (error) {
        console.error("[email] verification send failed after email change:", error);
        verificationDelivery = { delivered: false, error: "Could not send verification email. Use resend from the verification page." };
      }
    }

    recordAudit(user.id, "user:profile", 0, emailChanged ? "Account email updated" : "Account profile updated");
    json(res, 200, {
      ok: true,
      user: publicUser(nextUser),
      usage: getAccountUsage(nextUser),
      verificationRequired: requireEmailVerification && emailChanged,
      verificationEmailDelivered: verificationDelivery?.delivered ?? null,
      verificationEmailError: verificationDelivery?.error || null
    }, visitor.headers);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      json(res, 409, { error: "An account with this email already exists.", field: "email" }, visitor.headers);
      return;
    }
    console.error("[account] profile update failed:", error);
    json(res, 500, { error: "Could not update your account." }, visitor.headers);
  }
}

async function handleUpdatePassword(req, res) {
  const visitor = getVisitor(req);
  const user = getUserBySession(req);
  if (!user) {
    json(res, 401, { error: "Sign in to update your password." }, visitor.headers);
    return;
  }

  try {
    const body = JSON.parse(await readBody(req, 30_000) || "{}");
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");

    if (!verifyPassword(currentPassword, user.password_hash)) {
      json(res, 400, { error: "Current password is incorrect.", field: "currentPassword" }, visitor.headers);
      return;
    }
    if (newPassword.length < 8) {
      json(res, 400, { error: "New password must be at least 8 characters.", field: "newPassword" }, visitor.headers);
      return;
    }

    const now = new Date().toISOString();
    db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(hashPassword(newPassword), now, user.id);
    recordAudit(user.id, "user:password", 0, "Password changed from account settings");
    json(res, 200, { ok: true }, visitor.headers);
  } catch (error) {
    console.error("[account] password update failed:", error);
    json(res, 500, { error: "Could not update your password." }, visitor.headers);
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
    SELECT id, email, subscription_plan, subscription_status, usage_this_month, usage_limit, billing_period_end, email_verified, created_at, updated_at
    FROM users ORDER BY created_at DESC LIMIT 200
  `).all();
  const displayUsers = users.map(repairInvertedUsageIfNeeded);
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
      SUM(CASE WHEN subscription_status = 'active' THEN 1 ELSE 0 END) AS activeSubscribers,
      SUM(usage_this_month) AS listingsThisCycle
    FROM users
  `).get();
  const planCounts = db.prepare(`
    SELECT subscription_plan AS plan, COUNT(*) AS count FROM users GROUP BY subscription_plan
  `).all();
  const planSummary = planCounts.map((row) => `${escapeHtml(row.plan)}: ${row.count}`).join(", ");

  const userRows = displayUsers.map((u) => {
    const usage = getAccountUsage(u);
    const limitDisplay = usage.unlimited ? "&infin;" : String(usage.usageLimit);
    return `
    <tr data-user-row>
      <td><code>${escapeHtml(u.id.slice(0, 8))}</code></td>
      <td>${escapeHtml(u.email)}</td>
      <td>${u.email_verified ? "yes" : "no"}</td>
      <td>${escapeHtml(u.subscription_plan || "free")}</td>
      <td>${escapeHtml(u.subscription_status || "inactive")}</td>
      <td>${usage.usageThisMonth || 0} / ${limitDisplay}</td>
      <td>${escapeHtml(u.billing_period_end || "-")}</td>
      <td>
        <form method="post" action="/admin/credits">
          <input type="hidden" name="userId" value="${escapeHtml(u.id)}" />
          <input type="number" name="limit" min="0" required style="width:84px" value="${usage.unlimited ? "" : usage.usageLimit}" placeholder="allowance" />
          <input type="text" name="reason" required style="width:180px" placeholder="reason" />
          <button type="submit">Set allowance</button>
        </form>
      </td>
    </tr>
  `;
  }).join("");

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
    <div class="card"><span>Active subscribers</span><strong>${summary.activeSubscribers || 0}</strong></div>
    <div class="card"><span>Listings this cycle</span><strong>${summary.listingsThisCycle || 0}</strong></div>
    <div class="card" style="grid-column: span 2"><span>Plan distribution</span><strong>${planSummary || "free: 0"}</strong></div>
  </section>
  <h2>Users (latest 200)</h2>
  <div class="table-tools"><label>Search users <input id="userSearch" type="search" placeholder="email" /></label><div id="userPager"></div></div>
  <table id="usersTable"><thead><tr><th>id</th><th>email</th><th>verified</th><th>plan</th><th>status</th><th>usage</th><th>cycle ends</th><th>monthly allowance</th></tr></thead>
  <tbody>${userRows}</tbody></table>
  <h2>Recent generations (50)</h2>
  <table><thead><tr><th>at</th><th>user</th><th>title</th><th>score</th></tr></thead><tbody>${genRows}</tbody></table>
  <h2>Audit (latest 50)</h2>
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
        if (!confirm("Set this user's monthly listing allowance? Used listings stay separate.")) event.preventDefault();
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
      toast.textContent = "Allowance updated.";
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
  const limitParam = String(params.get("limit") || "").trim();
  const legacyDeltaParam = String(params.get("delta") || "").trim();
  const reason = (params.get("reason") || "").trim().slice(0, 240);

  if (!userId || !reason || (!limitParam && !legacyDeltaParam)) {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Missing userId, allowance, or reason.");
    return;
  }

  const user = repairInvertedUsageIfNeeded(db.prepare("SELECT * FROM users WHERE id = ?").get(userId));
  if (!user) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("User not found.");
    return;
  }

  const usage = getAccountUsage(user);
  const currentLimit = usage.unlimited ? Number(planLimitFor(user.subscription_plan) || 0) : Number(usage.usageLimit || 0);
  let nextLimit;
  if (limitParam) {
    nextLimit = Number.parseInt(limitParam, 10);
  } else {
    const legacyDelta = Number.parseInt(legacyDeltaParam, 10);
    nextLimit = currentLimit + legacyDelta;
  }
  if (!Number.isFinite(nextLimit) || nextLimit < 0) {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Allowance must be a whole number greater than or equal to 0.");
    return;
  }

  const now = new Date().toISOString();
  nextLimit = Math.round(nextLimit);
  const nextUsed = Math.min(Number(usage.usageThisMonth || 0), nextLimit);
  db.prepare("UPDATE users SET usage_this_month = ?, usage_limit = ?, updated_at = ? WHERE id = ?").run(nextUsed, nextLimit, now, userId);
  recordAudit(userId, `admin:${adminEmail}`, nextLimit - currentLimit, reason);

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
    const nameResult = validateName(body.name);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (nameResult.error) {
      json(res, 400, { error: nameResult.error, field: "name" }, visitor.headers);
      return;
    }

    if (!isValidEmail(email)) {
      json(res, 400, { error: "Enter a valid email address.", field: "email" }, visitor.headers);
      return;
    }

    if (password.length < 8) {
      json(res, 400, { error: "Password must be at least 8 characters.", field: "password" }, visitor.headers);
      return;
    }

    const emailLimit = rateLimit(`signup-email:${email}`, { max: 3, windowMs: 60 * 60_000 });
    if (!emailLimit.ok) {
      tooManyRequests(res, visitor, emailLimit.retryAfterSec, "Too many signup attempts for this email. Try again later.");
      return;
    }

    const now = new Date().toISOString();
    const userId = randomUUID();
    db.prepare(`
      INSERT INTO users (id, email, name, password_hash, usage_this_month, usage_limit, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?)
    `).run(userId, email, nameResult.name, hashPassword(password), FREE_PLAN.monthlyLimit, now, now);

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    let verificationDelivery = { delivered: false };
    if (requireEmailVerification) {
      const verificationToken = createVerificationToken(userId);
      try {
        verificationDelivery = await sendVerificationEmail(user, verificationToken);
      } catch (error) {
        console.error("[email] verification send failed during signup:", error);
        verificationDelivery = { delivered: false, error: "Verification email could not be sent. Use resend after signing in." };
      }
    }

    const token = createSession(userId);
    json(res, 200, {
      user: publicUser(user),
      usage: getAccountUsage(user),
      stripeReady: Boolean(stripe),
      aiProvider: getAiProvider(),
      appUrl,
      adminEnabled: Boolean(adminEmail && adminPassword),
      subscriptionPlans: publicSubscriptionPlans(),
      subscription: publicSubscriptionForUser(user),
      emailVerified: Boolean(user.email_verified),
      verificationRequired: requireEmailVerification,
      verificationEmailDelivered: verificationDelivery.delivered,
      verificationEmailError: verificationDelivery.error || null
    }, mergeHeaders(visitor.headers, authHeaders(token)));
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

    deleteExpiredSessionsForUser(user.id);
    const token = createSession(user.id);
    json(res, 200, {
      user: publicUser(user),
      usage: getAccountUsage(user),
      stripeReady: Boolean(stripe),
      aiProvider: getAiProvider(),
      appUrl,
      adminEnabled: Boolean(adminEmail && adminPassword),
      subscriptionPlans: publicSubscriptionPlans(),
      subscription: publicSubscriptionForUser(user),
      emailVerified: Boolean(user.email_verified),
      verificationRequired: requireEmailVerification
    }, mergeHeaders(visitor.headers, authHeaders(token)));
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
  "/support": "/support.html",
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
  "/app/account": "/app.html",
  "/checkout/success": "/checkout-success.html",
  "/checkout/cancel": "/checkout-cancel.html",
  "/privacy": "/privacy.html",
  "/terms": "/terms.html",
  "/robots.txt": "/robots.txt",
  "/sitemap.xml": "/sitemap.xml"
};

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/app" || url.pathname.startsWith("/app/")) {
    const visitor = getVisitor(req);
    const user = getUserBySession(req);
    if (!user) {
      res.writeHead(302, { ...visitor.headers, location: `/login?next=${encodeURIComponent(`${url.pathname}${url.search}`)}` });
      res.end();
      return;
    }
    if (!ensureVerified(user)) {
      res.writeHead(302, { ...visitor.headers, location: `/verify-email?next=${encodeURIComponent(`${url.pathname}${url.search}`)}` });
      res.end();
      return;
    }
    const routeFeature = {
      "/app/photo": "photos",
      "/app/score": "listingScore",
      "/app/replies": "buyerReplies",
      "/app/history": "history"
    }[url.pathname];
    if (routeFeature && !userCanUseFeature(user, routeFeature)) {
      res.writeHead(302, { ...visitor.headers, location: `/app/billing?locked=${encodeURIComponent(routeFeature)}` });
      res.end();
      return;
    }
  }
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

  {
    const oauthStartMatch = req.url.match(/^\/auth\/(google|microsoft)(?:\?.*)?$/i);
    if (oauthStartMatch && req.method === "GET") {
      handleOAuthStart(req, res, oauthStartMatch[1].toLowerCase());
      return;
    }
    const oauthCallbackMatch = req.url.match(/^\/auth\/(google|microsoft)\/callback(?:\?.*)?$/i);
    if (oauthCallbackMatch && req.method === "GET") {
      handleOAuthCallback(req, res, oauthCallbackMatch[1].toLowerCase());
      return;
    }
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

  if (req.method === "POST" && req.url === "/api/account/profile") {
    handleUpdateProfile(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/account/password") {
    handleUpdatePassword(req, res);
    return;
  }

  if (req.method === "GET" && (req.url === "/verify" || req.url.startsWith("/verify?"))) {
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
    handleLegacyCreditPack(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/create-subscription-checkout-session") {
    handleSubscriptionCheckout(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/create-billing-portal-session") {
    handleBillingPortal(req, res);
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
      handleLegacyCreditPack(req, res, checkoutMatch[1]);
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
    // Distinguish 405 (known route, wrong method) from 404 (unknown route).
    const pathOnly = req.url.split("?")[0];
    const apiMethodMap = {
      "/api/signup": ["POST"],
      "/api/login": ["POST"],
      "/api/logout": ["POST"],
      "/api/me": ["GET"],
      "/api/resend-verification": ["POST"],
      "/api/forgot-password": ["POST"],
      "/api/reset-password": ["POST"],
      "/api/reset-password/validate": ["GET"],
      "/api/account/profile": ["POST"],
      "/api/account/password": ["POST"],
      "/api/generate": ["POST"],
      "/api/demo-generate": ["POST"],
      "/api/generate-from-photos": ["POST"],
      "/api/history": ["GET"],
      "/api/billing": ["GET"],
      "/api/stripe-webhook": ["POST"],
      "/api/create-checkout-session": ["POST"],
      "/api/create-subscription-checkout-session": ["POST"],
      "/api/create-billing-portal-session": ["POST"]
    };
    const allowed = apiMethodMap[pathOnly];
    if (allowed) {
      json(res, 405, { error: "Method not allowed." }, { allow: allowed.join(", ") });
      return;
    }
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
  createVerificationToken,
  getPasswordResetCountForUser,
  publicCreditPacks,
  publicSubscriptionPlans,
  server
};
