import "dotenv/config";
import { createServer } from "node:http";
import { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, normalize } from "node:path";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import Stripe from "stripe";
import Database from "better-sqlite3";

const port = Number(process.env.PORT || 3000);
const publicDir = join(process.cwd(), "public");
const dataDirEnv = String(process.env.DATA_DIR || "").trim();
const dataDir = dataDirEnv
  ? (isAbsolute(dataDirEnv) ? dataDirEnv : join(process.cwd(), dataDirEnv))
  : join(process.cwd(), "data");
const usagePath = join(dataDir, "usage.json");
const dbPath = join(dataDir, "listboost.db");
const freeCredits = Number(process.env.FREE_CREDITS || 5);
const creditPackSize = Number(process.env.CREDIT_PACK_SIZE || 50);
const creditPackPricePence = Number(process.env.CREDIT_PACK_PRICE_PENCE || 500);
const appUrl = process.env.APP_URL || `http://localhost:${port}`;
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const isProduction = process.env.NODE_ENV === "production";
const requireEmailVerification = process.env.REQUIRE_EMAIL_VERIFICATION !== "false";
const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const adminPassword = String(process.env.ADMIN_PASSWORD || "");
const resendApiKey = String(process.env.RESEND_API_KEY || "").trim();
const emailFrom = String(process.env.EMAIL_FROM || "ListBoost <onboarding@resend.dev>").trim();
const supportEmail = String(process.env.SUPPORT_EMAIL || "hello@listboost.app").trim();
await mkdir(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    free_credits INTEGER NOT NULL DEFAULT ${freeCredits},
    paid_credits INTEGER NOT NULL DEFAULT 0,
    used_credits INTEGER NOT NULL DEFAULT 0,
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

  CREATE TABLE IF NOT EXISTS credit_audit (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    actor TEXT NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

const columnAdditions = [
  ["generations", "score", "INTEGER"],
  ["generations", "result_json", "TEXT"],
  ["users", "email_verified", "INTEGER NOT NULL DEFAULT 0"]
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
  const used = Number(user.used_credits || 0);
  const total = free + paid;
  return {
    freeCredits: free,
    paidCredits: paid,
    totalCredits: total,
    used,
    remaining: Math.max(total - used, 0),
    packSize: creditPackSize,
    packPricePence: creditPackPricePence
  };
}

function publicUser(user) {
  return user ? { id: user.id, email: user.email, emailVerified: Boolean(user.email_verified) } : null;
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
    "The title should be under 80 characters and should naturally include brand, item type, size, color, or condition when provided.",
    "Write in authentic UK Vinted style. Avoid robotic phrases like 'elevate your wardrobe' unless the premium mode truly needs it.",
    "Use UK spelling, GBP pricing, and practical postage wording like 'can post tomorrow' when provided by the seller.",
    "Include Vinted-friendly search terms as plain keywords, not hashtags.",
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
  const detailLine = [category, size, condition].filter(Boolean).join(" | ");

  return {
    title: `${concise} - Vinted Ready`,
    description: [
      `Selling ${concise}.`,
      detailLine ? detailLine : "Add size, condition, and brand before posting.",
      "",
      `Rewritten in a ${tone.replace("-", " ")} tone for a clear Vinted listing.`,
      "Happy to answer questions or send extra photos if needed."
    ].join("\n"),
    tags: ["vinted", "preloved", "clean condition", "fast dispatch", "wardrobe clearout"],
    searchTerms: ["white trainers", "nike trainers", "air force 1", "casual shoes", "streetwear"],
    listingScore: {
      score: 76,
      summary: "Strong start, but it needs clearer photos and more condition detail before posting.",
      improvements: ["Add a size label photo", "Mention any marks clearly", "Add a close-up of soles or wear"]
    },
    priceOptions: {
      fastSale: "GBP 24",
      fairPrice: "GBP 30",
      maxPrice: "GBP 36",
      lowestOffer: "GBP 26",
      startPrice: "GBP 34",
      autoCounterOffer: "GBP 30",
      bundleDiscount: "10-15%"
    },
    priceGuidance: "Check 3-5 similar sold Vinted items. Price slightly below the average for a quick sale.",
    photoChecklist: [
      "Front photo in natural light",
      "Close-up of label, size, or model number",
      "Any marks or wear shown clearly",
      "Photo of packaging or accessories if included"
    ],
    buyerQuestionReply: buyerQuestion
      ? "Hi, yes it is still available. The condition is shown in the photos, and I can post quickly after payment. Let me know if you want any extra close-up photos."
      : "",
    buyerReplies: [
      "Yes, this is still available. I can post it quickly after payment.",
      "The condition is shown in the photos, but I can send another close-up if helpful.",
      "I can accept a reasonable offer if you are ready to buy today."
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

async function handleMe(req, res) {
  const visitor = getVisitor(req);
  const user = getUserBySession(req);

  if (!user) {
    json(res, 200, {
      user: null,
      credits: {
        freeCredits,
        paidCredits: 0,
        totalCredits: freeCredits,
        used: 0,
        remaining: 0,
        packSize: creditPackSize,
        packPricePence: creditPackPricePence
      },
      stripeReady: Boolean(stripe),
      emailVerified: false,
      verificationRequired: requireEmailVerification
    }, visitor.headers);
    return;
  }

  json(res, 200, {
    user: publicUser(user),
    credits: getAccountCredits(user),
    stripeReady: Boolean(stripe),
    emailVerified: Boolean(user.email_verified),
    verificationRequired: requireEmailVerification
  }, visitor.headers);
}

async function handleHealth(req, res) {
  const checks = getLaunchChecks();
  const ok = !isProduction || checks.productionReady;
  json(res, ok ? 200 : 503, {
    ok,
    status: ok ? "ready" : "configuration_required",
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

  const rows = db.prepare(`
    SELECT id, title, score, result_json, created_at
    FROM generations
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 12
  `).all(user.id);

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

  json(res, 200, { history }, visitor.headers);
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

async function handleCheckout(req, res) {
  const visitor = getVisitor(req);
  const user = getUserBySession(req);

  if (!user) {
    json(res, 401, { error: "Sign in before buying credits." }, visitor.headers);
    return;
  }

  if (!stripe) {
    json(res, 503, { error: "Stripe is not connected yet. Add STRIPE_SECRET_KEY to .env and restart the app." }, visitor.headers);
    return;
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: user.id,
      metadata: {
        userId: user.id,
        credits: String(creditPackSize)
      },
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `${creditPackSize} Vinted Listing Booster credits`
            },
            unit_amount: creditPackPricePence
          },
          quantity: 1
        }
      ],
      success_url: `${appUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/?checkout=cancelled`
    });

    json(res, 200, { url: session.url }, visitor.headers);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: "Could not start Stripe Checkout." }, visitor.headers);
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
  json(res, 200, {
    ok: true,
    pending: !granted,
    credits: getAccountCredits(fresh),
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
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#101828">
          <h1 style="font-size:22px">Verify your email</h1>
          <p>Thanks for creating a ListBoost account. Click the button below to start generating Vinted listings.</p>
          <p><a href="${link}" style="display:inline-block;background:#1570ef;color:#fff;text-decoration:none;padding:12px 16px;border-radius:8px;font-weight:700">Verify email</a></p>
          <p>If the button does not work, copy this link:</p>
          <p><a href="${link}">${link}</a></p>
          <p style="color:#667085;font-size:13px">ListBoost is independent and is not affiliated with Vinted.</p>
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

  const userRows = users.map((u) => `
    <tr>
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
    <tr><td><code>${escapeHtml(p.stripe_session_id)}</code></td><td><code>${escapeHtml(p.user_id.slice(0, 8))}</code></td><td>${p.credits}</td><td>${escapeHtml(p.processed_at)}</td></tr>
  `).join("");

  const genRows = generations.map((g) => `
    <tr><td>${escapeHtml(g.created_at)}</td><td><code>${escapeHtml(g.user_id.slice(0, 8))}</code></td><td>${escapeHtml(g.title || "")}</td><td>${g.score || 0}</td></tr>
  `).join("");

  const auditRows = audit.map((a) => `
    <tr><td>${escapeHtml(a.created_at)}</td><td><code>${escapeHtml(a.user_id.slice(0, 8))}</code></td><td>${escapeHtml(a.actor)}</td><td>${a.delta > 0 ? "+" : ""}${a.delta}</td><td>${escapeHtml(a.reason)}</td></tr>
  `).join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>ListBoost admin</title>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; margin: 24px; color: #101828; }
  h1 { margin: 0 0 6px; }
  h2 { margin: 28px 0 8px; font-size: 1rem; text-transform: uppercase; color: #475467; letter-spacing: 0.04em; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { border-bottom: 1px solid #e4e7ec; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f9fafb; font-weight: 700; }
  code { font-size: 0.85rem; }
  form { display: inline-flex; gap: 6px; }
  input, button { font: inherit; padding: 4px 6px; border: 1px solid #d0d5dd; border-radius: 4px; background: #fff; }
  button { background: #101828; color: #fff; cursor: pointer; }
</style></head>
<body>
  <h1>ListBoost admin</h1>
  <p>Logged in as <strong>${escapeHtml(adminEmail)}</strong>. Webhook secret: ${stripeWebhookSecret ? "configured" : "<strong style='color:#b42318'>missing</strong>"}.</p>
  <h2>Users (latest 200)</h2>
  <table><thead><tr><th>id</th><th>email</th><th>verified</th><th>free</th><th>paid</th><th>used</th><th>remaining</th><th>adjust</th></tr></thead>
  <tbody>${userRows}</tbody></table>
  <h2>Payments (latest 50)</h2>
  <table><thead><tr><th>session</th><th>user</th><th>credits</th><th>at</th></tr></thead><tbody>${paymentRows}</tbody></table>
  <h2>Recent generations (50)</h2>
  <table><thead><tr><th>at</th><th>user</th><th>title</th><th>score</th></tr></thead><tbody>${genRows}</tbody></table>
  <h2>Credit audit (latest 50)</h2>
  <table><thead><tr><th>at</th><th>user</th><th>actor</th><th>delta</th><th>reason</th></tr></thead><tbody>${auditRows}</tbody></table>
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

  res.writeHead(303, { location: "/admin" });
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
  "/privacy": "/privacy.html",
  "/terms": "/terms.html"
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
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

createServer((req, res) => {
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

  if (req.method === "GET" && req.url.startsWith("/verify")) {
    handleVerifyEmail(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/generate") {
    handleGenerate(req, res);
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

  if (req.method === "GET" && req.url === "/api/history") {
    handleHistory(req, res);
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

  if (req.method === "GET" && req.url.startsWith("/api/checkout/success")) {
    handleCheckoutSuccess(req, res);
    return;
  }

  if (req.method === "GET" && req.url === "/admin") {
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
}).listen(port, () => {
  console.log(`Vinted Listing Booster running at http://localhost:${port}`);
  logLaunchChecks();
});
