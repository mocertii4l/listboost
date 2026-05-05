import { eyeIcon, togglePasswordVisibility } from "./auth-utils.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const toastRegion = $("#toastRegion");
let accountState = { user: null, usage: null };
let globalCopyHandlerInstalled = false;
let appNavigationInstalled = false;
let themeToggleInstalled = false;
let copySuccessCount = 0;

function toast(message, type = "info") {
  if (!toastRegion) return;
  const item = document.createElement("div");
  item.className = `toast toast-${type}`;
  item.textContent = message;
  toastRegion.append(item);
  setTimeout(() => item.remove(), 5200);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`);
    Object.assign(error, data, { status: response.status });
    throw error;
  }
  return data;
}

function applyTheme(theme) {
  const next = theme || localStorage.getItem("lb_theme") || "system";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("lb_theme", next);
  $$(".theme-toggle").forEach((button) => {
    button.setAttribute("aria-pressed", next === "dark" ? "true" : "false");
    button.innerHTML = `${iconSvg(next === "dark" ? "sun" : "moon")}<span>${next === "dark" ? "Light" : "Dark"}</span>`;
  });
  $$("[data-theme-choice]").forEach((button) => {
    const active = button.dataset.themeChoice === next;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function installTheme() {
  applyTheme();
  if (themeToggleInstalled) return;
  themeToggleInstalled = true;
  document.addEventListener("click", (event) => {
    const themeChoice = event.target.closest("[data-theme-choice]");
    if (themeChoice) {
      applyTheme(themeChoice.dataset.themeChoice || "system");
      toast("Appearance updated.", "success");
      return;
    }
    if (!event.target.closest(".theme-toggle")) return;
    const current = document.documentElement.dataset.theme;
    applyTheme(current === "dark" ? "light" : "dark");
  });
}

function iconSvg(name) {
  const icons = {
    "arrow-right": '<path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path>',
    "badge-pound": '<path d="M6 18h12"></path><path d="M8 12h7"></path><path d="M10 18c2-3 2-9 0-12"></path><path d="M10 6h5"></path>',
    camera: '<path d="M14.5 4h-5L8 6H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3z"></path><circle cx="12" cy="13" r="3"></circle>',
    calendar: '<path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path>',
    check: '<path d="m5 12 4 4L19 6"></path>',
    "check-circle": '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><path d="m9 11 3 3L22 4"></path>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>',
    "credit-card": '<rect width="20" height="14" x="2" y="5" rx="2"></rect><path d="M2 10h20"></path>',
    "file-text": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M16 13H8"></path><path d="M16 17H8"></path><path d="M10 9H8"></path>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 3v6h6"></path><path d="M12 7v5l4 2"></path>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"></path>',
    "image-up": '<rect width="18" height="18" x="3" y="3" rx="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"></path><path d="M12 12v6"></path><path d="m9 15 3-3 3 3"></path>',
    "list-check": '<path d="m3 17 2 2 4-4"></path><path d="M13 6h8"></path><path d="M13 12h8"></path><path d="M13 18h8"></path><path d="m3 7 2 2 4-4"></path>',
    "log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5"></path><path d="M21 12H9"></path>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-10 6L2 7"></path>',
    menu: '<path d="M4 6h16"></path><path d="M4 12h16"></path><path d="M4 18h16"></path>',
    "message-circle": '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"></path>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>',
    repeat: '<path d="m17 2 4 4-4 4"></path><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><path d="m7 22-4-4 4-4"></path><path d="M21 13v2a4 4 0 0 1-4 4H3"></path>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"></path><path d="M17 21v-8H7v8"></path><path d="M7 3v5h8"></path>',
    search: '<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.7 8.9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.4a1.4 1.4 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"></path><path d="m9 12 2 2 4-4"></path>',
    sparkles: '<path d="M9.9 10.8 8 17l-1.9-6.2L0 9l6.1-1.8L8 1l1.9 6.2L16 9z"></path><path d="M19 17.5 18 21l-1-3.5-3.5-1 3.5-1 1-3.5 1 3.5 3.5 1z"></path>',
    sun: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>',
    tag: '<path d="M12.6 2H4a2 2 0 0 0-2 2v8.6a2 2 0 0 0 .6 1.4l7.4 7.4a2 2 0 0 0 2.8 0l8.6-8.6a2 2 0 0 0 0-2.8L14 2.6A2 2 0 0 0 12.6 2Z"></path><circle cx="7.5" cy="7.5" r=".5"></circle>',
    user: '<path d="M20 21a8 8 0 0 0-16 0"></path><circle cx="12" cy="7" r="4"></circle>',
    "user-cog": '<circle cx="18" cy="15" r="3"></circle><path d="m19.5 12.4.3-.7"></path><path d="m16.2 18.3.3-.7"></path><path d="m20.4 16.5.7.3"></path><path d="m14.9 13.2.7.3"></path><path d="M20 21a8 8 0 0 0-16 0"></path><circle cx="12" cy="7" r="4"></circle>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m17 8-5-5-5 5"></path><path d="M12 3v12"></path>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3v3a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5"></path><path d="M18 12h.01"></path>',
    x: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>'
  };
  return `<svg class="icon icon-${escapeHtml(name)}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.sparkles}</svg>`;
}

function htmlAttributes(attributes = {}) {
  return Object.entries(attributes)
    .filter(([, value]) => value !== false && value != null)
    .map(([key, value]) => value === true ? escapeHtml(key) : `${escapeHtml(key)}="${escapeHtml(value)}"`)
    .join(" ");
}

function buttonTemplate({
  variant = "primary",
  label,
  icon = "",
  href = "",
  type = "button",
  className = "",
  attributes = {},
  disabled = false
} = {}) {
  const content = `${icon ? iconSvg(icon) : ""}<span>${escapeHtml(label || "")}</span>`;
  const classes = `btn btn-${variant} ${className}`.trim();
  const attrs = htmlAttributes({ ...attributes, class: classes, ...(disabled ? { disabled: true } : {}) });
  if (href) return `<a href="${escapeHtml(href)}" ${attrs}>${content}</a>`;
  return `<button type="${escapeHtml(type)}" ${attrs}>${content}</button>`;
}

function cardTemplate({ eyebrow = "", title = "", body = "", icon = "", footer = "", className = "", attributes = {}, elevated = false, interactive = false } = {}) {
  const classes = ["card", elevated ? "card-elevated" : "", interactive ? "card-interactive" : "", className].filter(Boolean).join(" ");
  return `
    <article ${htmlAttributes({ ...attributes, class: classes })}>
      ${icon ? `<div class="feature-icon">${iconSvg(icon)}</div>` : ""}
      ${eyebrow ? `<span class="badge">${escapeHtml(eyebrow)}</span>` : ""}
      ${title ? `<h3>${escapeHtml(title)}</h3>` : ""}
      ${body ? `<p>${escapeHtml(body)}</p>` : ""}
      ${footer}
    </article>
  `;
}

function listingCardTemplate({ title = "Vinted-ready listing title", price = "£18", keywords = [], description = "" } = {}, options = {}) {
  const chips = (Array.isArray(keywords) ? keywords : String(keywords).split(",")).map((item) => String(item).trim()).filter(Boolean).slice(0, 5);
  const classes = ["listing-card", options.elevated ? "is-elevated" : "", options.className || ""].filter(Boolean).join(" ");
  return `
    <article class="${classes}" aria-label="Generated listing preview">
      <div class="listing-card-header">
        <div class="listing-card-title">
          <span class="badge badge-brand">${iconSvg("sparkles")} Sell-ready listing</span>
          <h3>${escapeHtml(title)}</h3>
        </div>
        <strong class="listing-price">${escapeHtml(price)}</strong>
      </div>
      <p class="listing-description">${escapeHtml(description)}</p>
      <div class="listing-keywords" aria-label="Suggested keywords">
        ${chips.map((keyword) => `<span>${escapeHtml(keyword)}</span>`).join("")}
      </div>
      ${options.actions ? `<div class="listing-card-actions">${options.actions}</div>` : ""}
    </article>
  `;
}

function listingCardDataFromOutput(data = {}) {
  const keywords = uniqueItems([...(data.tags || []), ...(data.searchTerms || [])]).slice(0, 3);
  const price = data.priceOptions?.fairPrice || data.priceOptions?.fastSale || data.priceOptions?.maxPrice || "Price guide";
  const description = linesFromText(data.description || "").join(" ").slice(0, 180) || "A clear, buyer-friendly description will appear here.";
  return {
    title: data.title || "Vinted-ready listing title",
    price,
    keywords: keywords.length ? keywords : ["vinted", "preloved", "wardrobe"],
    description
  };
}

function demoResultTemplate(data = {}, inputText = "") {
  return `
    <section class="demo-result-set">
      ${listingCardTemplate(listingCardDataFromOutput(data), { elevated: true })}
      ${outputTemplate(data, { demo: true, inputText })}
    </section>
  `;
}

function pricingCardTemplate({ id = "", name = "", monthlyLimit = null, unlimited = false, pricePence = 0, label = "", featured = false, description = "", ctaLabel = "", current = false } = {}) {
  const cardId = `subscribe-${id}`;
  const price = formatMonthlyPrice({ pricePence });
  const isUnlimited = unlimited || monthlyLimit == null;
  const limitDisplay = isUnlimited ? "Unlimited" : String(Number(monthlyLimit || 0));
  const limitSub = isUnlimited ? "listings/month" : "listings/month";
  const compare = pricingFeaturesFor(id);
  const buttonAttrs = { "data-subscription-plan": id };
  const buttonLabel = ctaLabel || (current ? "Current plan" : `Subscribe ${name}`);
  return `
    <article class="pricing-card subscription ${featured ? "is-featured featured" : ""}" id="${escapeHtml(cardId)}">
      <span class="badge ${featured ? "badge-brand" : ""}">${escapeHtml(featured ? "Best value" : label || "Monthly")}</span>
      <h3>${escapeHtml(name)}</h3>
      <p class="pricing-price"><strong>${escapeHtml(limitDisplay)}</strong><span>${escapeHtml(limitSub)}</span></p>
      <p class="pricing-meta">${escapeHtml(price)}</p>
      <p class="pricing-copy">${escapeHtml(description || "Monthly subscription with included Vinted listing tools.")}</p>
      <ul class="pricing-compare">${compare.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      ${buttonTemplate({ variant: featured ? "primary" : "secondary", label: buttonLabel, className: "pricing-buy", attributes: buttonAttrs, disabled: current })}
    </article>
  `;
}

function pricingFeaturesFor(id = "") {
  const features = {
    starter: [
      "Notes-to-listing generator",
      "Titles, descriptions and keywords",
      "Up to 20 listings per month"
    ],
    seller: [
      "Everything in Starter",
      "Photo upload and buyer replies",
      "Price guidance, listing score, up to 100/month"
    ],
    reseller: [
      "Everything in Seller",
      "Unlimited monthly listings",
      "Bulk workflow, reusable templates, priority support"
    ]
  };
  return features[id] || ["Monthly subscription", "Switch plans from billing", "Cancel any time"];
}

function authShellTemplate({ heading = "", subtext = "", body = "" } = {}) {
  return `
    <main class="auth-shell" id="main">
      <a class="btn btn-ghost auth-back" href="/">${iconSvg("arrow-right")}<span>Back to home</span></a>
      <a class="lb-brand" href="/"><img src="/logo.svg" alt="" />ListBoost</a>
      <section class="card auth-card">
        ${heading ? `<h1>${escapeHtml(heading)}</h1>` : ""}
        ${subtext ? `<p class="muted">${escapeHtml(subtext)}</p>` : ""}
        ${body}
      </section>
    </main>
  `;
}

function emptyStateTemplate({ icon = "sparkles", heading = "Nothing here yet", body = "", cta = "" } = {}) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${iconSvg(icon)}</div>
      <h3>${escapeHtml(heading)}</h3>
      ${body ? `<p>${escapeHtml(body)}</p>` : ""}
      ${cta}
    </div>
  `;
}

const previewSections = [
  ["file-text", "Title", "Sell-ready Vinted title with brand, size, condition."],
  ["list-check", "Description", "Clean bullet-style description, easy to paste."],
  ["tag", "Keywords", "Plain search terms buyers type into Vinted."],
  ["badge-pound", "Price guidance", "Fast / fair / max price suggestions in GBP."],
  ["image", "Photo checklist", "The shots to take before publishing."],
  ["message-circle", "Buyer reply", "Polite reply for offers and questions."]
];

function scaffoldPreviewTemplate({ heading = "Output appears here", body = "" } = {}) {
  return `
    <div class="scaffold-preview" aria-hidden="false">
      <div class="scaffold-preview-head">
        <span class="badge badge-brand">${iconSvg("sparkles")} Preview</span>
        <h3>${escapeHtml(heading)}</h3>
        ${body ? `<p class="muted">${escapeHtml(body)}</p>` : ""}
      </div>
      <div class="scaffold-grid">
        ${previewSections.map(([icon, label, desc]) => `
          <article class="scaffold-card">
            <div class="scaffold-icon">${iconSvg(icon)}</div>
            <strong>${escapeHtml(label)}</strong>
            <span>${escapeHtml(desc)}</span>
            <div class="scaffold-bars" aria-hidden="true">
              <span></span><span></span><span></span>
            </div>
          </article>
        `).join("")}
      </div>
    </div>
  `;
}

function photoStepsTemplate() {
  const steps = [
    ["image-up", "Upload up to 4 photos", "Front, back, label, any flaws."],
    ["file-text", "Add missing details", "Brand, size, condition the camera can't see."],
    ["sparkles", "Generate listing", "Copy title, description, keywords and price."]
  ];
  return `
    <div class="photo-empty">
      <div class="photo-empty-steps">
        ${steps.map(([icon, title, copy], i) => `
          <article class="photo-empty-step">
            <span class="photo-empty-num">${i + 1}</span>
            <div class="photo-empty-icon">${iconSvg(icon)}</div>
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(copy)}</span>
          </article>
        `).join("")}
      </div>
      <div class="photo-empty-mock" aria-hidden="true">
        <div class="photo-empty-mock-img">
          <span class="photo-empty-mock-shape"></span>
        </div>
        <div class="photo-empty-mock-card">
          <span class="badge badge-brand">${iconSvg("sparkles")} Sell-ready</span>
          <strong>Zara Navy Satin Midi Dress UK 10</strong>
          <p>Lovely navy Zara midi dress, worn twice, clean and ready to post.</p>
          <div class="photo-empty-mock-tags"><span>zara dress</span><span>uk 10</span><span>navy satin</span></div>
          <div class="photo-empty-mock-price">£18 fair price</div>
        </div>
      </div>
    </div>
  `;
}

const marketingListingExamples = {
  hero: {
    title: "Zara Navy Satin Midi Dress UK 10",
    price: "£18",
    keywords: ["zara dress", "uk 10", "navy satin"],
    description: "Elegant navy satin midi dress from Zara in a UK 10. Worn twice and in lovely condition, perfect for dinners, events or smart weekend plans."
  },
  after: {
    title: "Zara Navy Midi Dress UK 10 - Worn Twice",
    price: "£18",
    keywords: ["zara dress", "navy midi", "uk 10"],
    description: "Lovely navy Zara midi dress in a UK size 10. Worn twice, clean and ready to post. Easy to style with heels, boots or a simple jacket."
  }
};

function hydrateListingCardPlaceholders(root = document) {
  $$("[data-listing-card]", root).forEach((node) => {
    const key = node.dataset.listingCard || "hero";
    const example = marketingListingExamples[key] || marketingListingExamples.hero;
    node.innerHTML = listingCardTemplate(example, { elevated: node.dataset.elevated !== "false" });
  });
}

function hydrateIconPlaceholders(root = document) {
  $$("[data-icon]", root).forEach((node) => {
    node.innerHTML = iconSvg(node.dataset.icon || "sparkles");
  });
}

function publicHeaderTemplate() {
  // Public marketing stays anonymous in layout, but the actions reflect session state.
  // Signed in: a single primary "Open app" + a quiet "Sign out".
  // Signed out: "Log in" + primary "Start free".
  return `
    <a class="lb-brand" href="/"><img src="/logo.svg" alt="" />ListBoost</a>
    <button class="nav-toggle btn btn-ghost btn-icon" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="publicNav">${iconSvg("menu")}</button>
    <nav id="publicNav" class="public-nav" aria-label="Primary">
      <a href="/#how-it-works">How it works</a>
      <a href="/example">Example</a>
      <a href="/pricing">Pricing</a>
    </nav>
    <div class="nav-actions">
      <a class="btn btn-ghost nav-login js-public-login" href="/login">Log in</a>
      <a class="btn btn-primary nav-start js-public-start" href="/signup" aria-label="Start free with 3 listings">Start free - 3 listings</a>
      <a class="btn btn-primary js-public-app hidden" href="/app">${iconSvg("user")}<span>Open app</span></a>
      <button class="btn btn-ghost js-public-logout hidden" type="button" data-logout>${iconSvg("log-out")}<span>Sign out</span></button>
    </div>
  `;
}

function installPublicShell() {
  const isPublic = [
    "/",
    "/pricing",
    "/example",
    "/support",
    "/privacy",
    "/terms",
    "/checkout/success",
    "/checkout/cancel"
  ].includes(location.pathname);
  if (!isPublic) return;
  if (!$(".skip-link")) {
    document.body.insertAdjacentHTML("afterbegin", '<a class="skip-link" href="#main">Skip to content</a>');
  }
  let header = $(".lb-header") || $(".site-nav");
  if (!header) {
    header = document.createElement("header");
    const skip = $(".skip-link");
    if (skip) skip.insertAdjacentElement("afterend", header);
    else document.body.prepend(header);
  }
  header.className = "lb-header";
  header.setAttribute("role", "banner");
  header.innerHTML = publicHeaderTemplate();
  const main = $("main");
  if (main && !main.id) main.id = "main";
  if (!$(".app-footer")) {
    document.body.insertAdjacentHTML("beforeend", `
      <footer class="app-footer public-footer">
        <div class="footer-inner">
          <div class="footer-brand-column">
            <a class="lb-brand" href="/"><img src="/logo.svg" alt="" />ListBoost</a>
            <p>Professional listing tools for UK Vinted sellers. Independent - not affiliated with Vinted.</p>
          </div>
          <nav class="footer-links" aria-label="Product links">
            <strong>Product</strong>
            <a href="/example">Example</a>
            <a href="/pricing">Pricing</a>
            <a href="/#how-it-works">How it works</a>
          </nav>
          <nav class="footer-links" aria-label="Help links">
            <strong>Help</strong>
            <a href="/support">Support centre</a>
            <a href="/support#faq">FAQ</a>
            <a href="mailto:support@listboost.uk">Email support</a>
          </nav>
          <nav class="footer-links" aria-label="Legal links">
            <strong>Legal</strong>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </nav>
        </div>
      </footer>
    `);
  }
  const toggle = $(".nav-toggle", header);
  const nav = $("#publicNav", header);
  toggle?.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", open ? "false" : "true");
    nav?.classList.toggle("is-open", !open);
  });
  $$(".public-nav a", header).forEach((link) => {
    link.addEventListener("click", () => {
      toggle?.setAttribute("aria-expanded", "false");
      nav?.classList.remove("is-open");
    });
  });
}

function formatPrice(pence) {
  return `£${(Number(pence || 0) / 100).toFixed(2).replace(/\.00$/, "")}`;
}

function formatMonthlyPrice(plan) {
  return `${formatPrice(plan.pricePence)}/month`;
}

function titleCasePlan(value) {
  const text = String(value || "free").replace(/[-_]/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function fallbackSubscriptionPlans() {
  return [
    { id: "starter", name: "Starter", monthlyLimit: 20, pricePence: 500, label: "Monthly starter" },
    { id: "seller", name: "Seller", monthlyLimit: 100, pricePence: 1200, label: "Best value", featured: true },
    { id: "reseller", name: "Reseller", monthlyLimit: null, unlimited: true, pricePence: 2500, label: "Reseller tools" }
  ];
}

function getSubscriptionPlans() {
  return Array.isArray(accountState.subscriptionPlans) && accountState.subscriptionPlans.length
    ? accountState.subscriptionPlans
    : fallbackSubscriptionPlans();
}

function formatUsageText(usage) {
  if (!usage) return "Loading usage";
  if (usage.unlimited) return `${Number(usage.usageThisMonth || 0)} listings used (unlimited)`;
  const limit = Number(usage.usageLimit || 0);
  const used = Number(usage.usageThisMonth || 0);
  return `${used} / ${limit} listings used`;
}

function updateAccountChrome(me = accountState) {
  accountState = { ...accountState, ...me };
  const usage = accountState.usage || {};
  const plan = accountState.subscription || accountState.user || {};
  const displayName = accountState.user?.name || accountState.user?.email || "Account";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "LB";
  const planLabel = usage.planName || plan.planName || titleCasePlan(usage.plan || plan.subscriptionPlan || plan.plan || "Free");
  const statusLabel = titleCasePlan(usage.subscriptionStatus || plan.subscriptionStatus || plan.status || "Inactive");
  const cycleEnd = usage.billingPeriodEnd || plan.billingPeriodEnd || null;
  $$(".js-name").forEach((node) => { node.textContent = displayName; });
  $$(".js-email").forEach((node) => { node.textContent = accountState.user?.email || "Signed out"; });
  $$(".js-avatar-initials").forEach((node) => { node.textContent = initials; });
  $$(".js-usage").forEach((node) => { node.textContent = formatUsageText(usage); });
  $$(".js-current-plan").forEach((node) => { node.textContent = planLabel; });
  $$(".js-subscription-status").forEach((node) => { node.textContent = statusLabel; });
  $$(".js-next-refill").forEach((node) => { node.textContent = cycleEnd ? formatDate(cycleEnd) : "No active subscription"; });
  const signedIn = Boolean(accountState.user);
  $$(".js-public-login, .js-public-start").forEach((node) => { node.classList.toggle("hidden", signedIn); });
  $$(".js-public-app, .js-public-logout").forEach((node) => { node.classList.toggle("hidden", !signedIn); });
  document.body.classList.toggle("signed-in", signedIn);
  document.body.classList.toggle("signed-out", !signedIn);
}

function updateUsageFromResponse(data = {}) {
  if (!data.usage && !data.user) return;
  updateAccountChrome({
    user: data.user || accountState.user,
    usage: data.usage || accountState.usage,
    subscriptionPlans: data.subscriptionPlans || accountState.subscriptionPlans,
    subscription: data.subscription || accountState.subscription
  });
}

function generationMomentumKey() {
  return `lb_generated_${new Date().toISOString().slice(0, 10)}`;
}

function recordGenerationMomentum() {
  const key = generationMomentumKey();
  const next = Math.max(0, Number(localStorage.getItem(key) || 0)) + 1;
  localStorage.setItem(key, String(next));
  return next;
}

function momentumMessage(count) {
  return count <= 1 ? "You've generated 1 listing today" : "You're on a roll - keep going";
}

function renderSubscriptionPlansGrid() {
  const grid = $("#packGrid");
  if (!grid) return;
  const subscriptionCards = getSubscriptionPlans().map((plan) => pricingCardTemplate({
    ...plan,
    label: plan.featured ? "Best value" : plan.label || "Monthly",
    ctaLabel: plan.featured ? "Subscribe monthly" : `Subscribe ${plan.name}`
  })).join("");
  grid.innerHTML = `
    <div class="pricing-mode-section recommended" data-pricing-panel="subscriptions">
      <div class="section-head compact"><p class="eyebrow">Subscribe monthly</p><h2>Pick the plan that fits your listing volume</h2></div>
      <div class="pricing-grid">${subscriptionCards}</div>
    </div>
  `;
}

async function bootstrap() {
  installPublicShell();
  hydrateListingCardPlaceholders();
  hydrateIconPlaceholders();
  renderAppRoute();
  installTheme();
  installPasswordToggles();
  installAppNavigation();
  try {
    const me = await api("/api/me");
    accountState = me;
    renderSubscriptionPlansGrid();
    updateAccountChrome(me);
    hydrateAppRoute(me);
    if (location.pathname === "/verify-email" && me.user?.emailVerified) {
      location.href = "/app?verified=1";
      return;
    }
    if (location.pathname === "/app" && new URLSearchParams(location.search).get("verified") === "1") {
      toast("Email verified - welcome", "success");
      history.replaceState({}, "", "/app");
    }
  } catch {
    toast("Could not load account state.", "error");
  }
  installForms();
  installAppTools();
  installCheckoutButtons();
  installCheckoutSuccess();
  installFaq();
  installLogout();
  installAppNav();
}

function installAuthMode() {
  const authForm = $("#authForm");
  if (!authForm) return;
  const isSignup = location.pathname === "/signup";
  const heading = $("#authHeading");
  const intro = $("#authIntro");
  const button = authForm.querySelector("button[type=submit]");
  const links = $("#authLinks");
  const nameField = $(".signup-name-field", authForm);
  const nameInput = authForm.elements.name;
  authForm.dataset.mode = isSignup ? "signup" : "login";
  if (heading) heading.textContent = isSignup ? "Create account" : "Sign in";
  if (intro) intro.textContent = isSignup ? "Try 3 free listings on us - no card needed." : "Your subscription, history and listings stay with this account.";
  if (button) button.textContent = isSignup ? "Create account" : "Sign in";
  if (nameField) nameField.classList.toggle("hidden", !isSignup);
  if (nameInput) nameInput.required = isSignup;
  if (links) {
    links.innerHTML = isSignup
      ? '<a href="/login">Already have an account? Log in</a>'
      : '<a href="/signup">Create account</a> | <a href="/forgot-password">Forgot password?</a>';
  }
}

function installAppNav() {
  $$(".app-nav a").forEach((link) => {
    const active = link.pathname === location.pathname;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function navigateApp(path, push = true) {
  if (!path.startsWith("/app")) return;
  if (push && `${location.pathname}${location.search}${location.hash}` !== path) {
    history.pushState({}, "", path);
  }
  renderAppRoute();
  installAppNav();
  installForms();
  installAppTools();
  installPasswordToggles();
  hydrateAppRoute(accountState);
  updateAccountChrome(accountState);
  applyTheme();
  $("#main")?.scrollIntoView({ block: "start" });
}

function isInsideApp() {
  return location.pathname.startsWith("/app") && Boolean(document.getElementById("appRoute"));
}

function installAppNavigation() {
  if (appNavigationInstalled) return;
  appNavigationInstalled = true;
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href^='/app']");
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href, location.origin);
    if (url.origin !== location.origin || !url.pathname.startsWith("/app")) return;
    // Only intercept for client-side route swap when we're already inside the app shell.
    // Otherwise let the browser navigate normally (full page load) so links from /, /pricing,
    // /checkout/success, /verify-email actually work.
    if (!isInsideApp()) return;
    event.preventDefault();
    navigateApp(`${url.pathname}${url.search}${url.hash}`);
  });
  window.addEventListener("popstate", () => {
    if (!isInsideApp()) return;
    navigateApp(`${location.pathname}${location.search}${location.hash}`, false);
  });
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function appRouteName() {
  if (!location.pathname.startsWith("/app")) return "";
  const name = location.pathname.replace(/^\/app\/?/, "") || "dashboard";
  return ["dashboard", "notes", "photo", "score", "replies", "history", "billing", "account"].includes(name) ? name : "dashboard";
}

const appFeatureTiles = [
  ["file-text", "Notes to listing", "Turn rough notes into a complete Vinted listing.", "/app/notes", "Open Notes"],
  ["camera", "Photo Listing", "Upload or take item photos from your phone.", "/app/photo", "Open Photo"],
  ["check-circle", "Listing Score", "Check a draft listing before it goes live.", "/app/score", "Open Score"],
  ["message-circle", "Buyer Replies", "Answer offers and questions in your seller tone.", "/app/replies", "Open Replies"]
];

function renderAppRoute() {
  const root = $("#appRoute");
  if (!root) return;
  const route = appRouteName();
  const templates = {
    dashboard: dashboardRouteTemplate,
    notes: notesRouteTemplate,
    photo: photoRouteTemplate,
    score: scoreRouteTemplate,
    replies: repliesRouteTemplate,
    history: historyRouteTemplate,
    billing: billingRouteTemplate,
    account: accountRouteTemplate
  };
  root.innerHTML = templates[route]();
  document.body.dataset.appRoute = route;
}

function routeHeader(kicker, title, copy) {
  return `<header class="route-head"><p class="badge">${kicker}</p><h1>${title}</h1><p class="muted">${copy}</p></header>`;
}

function appTrustStrip() {
  return `
    <ul class="trust-strip" aria-label="ListBoost trust points">
      <li>No Vinted login required</li>
      <li>Copy and paste manually</li>
      <li>Your data is private</li>
    </ul>
  `;
}

function dashboardRouteTemplate() {
  return `
    <section class="dashboard-route" data-route="dashboard">
      <header class="route-head dashboard-head">
        <h1>Your ListBoost workspace</h1>
        <p class="muted">Generate Vinted listings, buyer replies and pricing guidance from one clean place.</p>
      </header>
      <section class="card card-elevated welcome-card js-first-run">
        <div>
          <span class="badge badge-brand">${iconSvg("sparkles")} Welcome to ListBoost</span>
          <h2>Generate your first listing in 30 seconds</h2>
          <p class="muted">Start with notes or upload a photo from your phone. You will get title, description, keywords, pricing and copy buttons.</p>
        </div>
        ${buttonTemplate({ variant: "primary", label: "Generate a listing", icon: "arrow-right", href: "/app/notes" })}
      </section>
      ${appTrustStrip()}
      <div class="dashboard-row dashboard-top-row">
        <article class="card balance-card compact-balance">
          <span class="badge">${iconSvg("wallet")} This month's usage</span>
          <h2 class="js-usage">Loading usage</h2>
          <p class="muted js-next-refill">No active subscription</p>
          ${buttonTemplate({ variant: "secondary", label: "Manage plan", icon: "credit-card", href: "/app/billing" })}
        </article>
        <article class="card plan-card">
          <span class="badge">${iconSvg("repeat")} Current plan</span>
          <h2 class="js-current-plan">Free</h2>
          <p class="muted"><span class="js-subscription-status">Inactive</span> subscription</p>
          ${buttonTemplate({ variant: "secondary", label: "View billing", icon: "arrow-right", href: "/app/billing" })}
        </article>
        <article class="card card-elevated quick-action-card">
          <span class="badge badge-brand">${iconSvg("sparkles")} Quick action</span>
          <h2>Generate a listing</h2>
          <p class="muted">Paste notes and get a sell-ready Vinted listing package.</p>
          ${buttonTemplate({ variant: "primary", label: "Open generator", icon: "arrow-right", href: "/app/notes" })}
        </article>
      </div>
      <div class="dashboard-grid route-grid feature-tile-grid">
        ${appFeatureTiles.map(([icon, title, copy, href, cta]) => `
          <a class="card card-interactive feature-tile" href="${href}">
            <div class="feature-icon">${iconSvg(icon)}</div>
            <h3>${title}</h3>
            <p>${copy}</p>
            <span class="tile-link">${cta} ${iconSvg("arrow-right")}</span>
          </a>
        `).join("")}
      </div>
      <section class="card dashboard-activity">
        <div class="section-head compact"><p class="eyebrow">Recent activity</p><h2>Latest listing packages</h2></div>
        <div class="history-list" id="dashboardHistory">
          ${loadingTemplate("Loading recent listings...")}
        </div>
        <div class="dashboard-activity-actions">
          ${buttonTemplate({ variant: "secondary", label: "View history", icon: "history", href: "/app/history" })}
        </div>
      </section>
    </section>
  `;
}

function notesRouteTemplate() {
  return `
    <section class="notes-route" data-route="notes">
      <div class="notes-layout">
        <form class="card generator-panel sticky-form" id="notesForm">
          <div class="generator-step">
            <span class="badge badge-brand">${iconSvg("sparkles")} Generator</span>
            <h1>Generate sell-ready listing</h1>
            <p class="muted">Paste messy item notes. ListBoost turns them into a structured Vinted listing you can copy section by section.</p>
          </div>
          <input type="hidden" name="category" value="Clothing" />
          <input type="hidden" name="tone" value="clean" />
          <input type="hidden" name="sellerMode" value="clearout" />
          <input type="hidden" name="negotiationGoal" value="friendly" />
          <label class="generator-input-label" for="notesInput">
            Item notes
            <textarea id="notesInput" name="itemDetails" required placeholder="Example: Zara navy satin midi dress, UK 10, worn twice, no marks, zip fastening, flattering bias cut"></textarea>
          </label>
          <div class="example-chips" aria-label="Example item notes">
            <button class="btn btn-secondary example-chip" type="button" data-example-text="Zara navy satin midi dress, UK 10, worn twice, no marks, zip fastening, flattering bias cut">Zara dress</button>
            <button class="btn btn-secondary example-chip" type="button" data-example-text="Nike Air Force 1 trainers, UK 5, white leather, light creasing, cleaned soles, still lots of wear left">Nike trainers</button>
            <button class="btn btn-secondary example-chip" type="button" data-example-text="Kids winter bundle, age 4-5, H&M jumpers and leggings, good used condition, a couple of tiny marks shown in photos">Kids bundle</button>
          </div>
          <div class="generator-meta">
            <span id="notesCharCount">0 characters</span>
            <span class="usage-cost">${iconSvg("file-text")} <span class="js-usage">Loading usage</span></span>
          </div>
          <div class="generator-actions">
            <button class="btn btn-primary generator-cta" type="submit">Generate sell-ready listing</button>
          </div>
          ${appTrustStrip()}
        </form>
        <section class="results-panel output-stack results-stack" id="output" aria-live="polite">
          ${scaffoldPreviewTemplate({
            heading: "Your sell-ready listing will appear here",
            body: "6 sections, copy-ready, in seconds."
          })}
        </section>
      </div>
    </section>
  `;
}

function photoRouteTemplate() {
  return `
    <section class="tool-layout photo-route" data-route="photo">
      <form class="card generator-panel sticky-form" id="photoRouteForm">
        <span class="badge badge-brand">${iconSvg("camera")} Photo Listing</span>
        <h1>List from item photos</h1>
        <p class="muted">Upload photos or take a fresh picture on your phone. Add the details the camera cannot see, then generate the same premium listing package.</p>
        <label class="photo-dropzone" for="photoInput">
          <span class="feature-icon">${iconSvg("image-up")}</span>
          <strong>Upload or take photos</strong>
          <span class="muted">Up to 4 images. Mobile cameras are supported.</span>
          <input id="photoInput" name="photos" type="file" accept="image/*" capture="environment" multiple required />
        </label>
        <div class="form-grid two">
          <label>Category<select name="category"><option>Clothing</option><option>Shoes</option><option>Bags</option><option>Accessories</option></select></label>
          <label>Size<input name="size" placeholder="UK 10, M, EU 39" /></label>
        </div>
        <label>Condition<input name="condition" placeholder="Good condition, worn once" /></label>
        <label>Notes<textarea name="notes" placeholder="Optional: brand, flaws, measurements, postage details..."></textarea></label>
        <button class="btn btn-primary generator-cta" type="submit">${iconSvg("sparkles")}<span>Generate from photos</span></button>
      </form>
      <section class="output-stack results-panel" id="photoRouteOutput">
        ${photoStepsTemplate()}
      </section>
    </section>
  `;
}

function scoreRouteTemplate() {
  return `
    <section class="tool-layout" data-route="score">
      <form class="card sticky-form" id="scoreForm">
        <span class="badge">Score</span>
        <h1>Check a listing</h1>
        <label>Current title<input name="title" placeholder="Zara black midi dress UK 10" /></label>
        <label>Current description<textarea name="description" required placeholder="Paste the current listing description..."></textarea></label>
        <button class="btn btn-primary" type="submit">Score listing</button>
      </form>
      <section class="output-stack" id="scoreOutputPanel"><div class="empty-state">Score, fixes and missing details appear here.</div></section>
    </section>
  `;
}

function repliesRouteTemplate() {
  return `
    <section class="tool-layout" data-route="replies">
      <form class="card sticky-form" id="replyForm">
        <span class="badge">Replies</span>
        <h1>Buyer reply tools</h1>
        <p class="muted">Generate replies from your listings.</p>
        <label>Item context<textarea name="itemDetails" required placeholder="Item, condition, price, postage options..."></textarea></label>
        <label>Buyer message<textarea name="buyerQuestion" required placeholder="Paste the buyer's offer or question..."></textarea></label>
        <button class="btn btn-primary" type="submit">Write reply</button>
      </form>
      <section class="output-stack" id="replyOutput"><div class="empty-state">Generate replies from your listings</div></section>
    </section>
  `;
}

function historyRouteTemplate() {
  return `
    <section data-route="history">
      ${routeHeader("History", "Saved listing packages", "Search, reopen, copy or regenerate previous outputs.")}
      <div class="card history-toolbar"><label>Search history<input id="historySearch" type="search" placeholder="Search title or description" /></label></div>
      <div class="history-list" id="historyList"><div class="skeleton">Loading history...</div></div>
      <div class="pager" id="historyPager"></div>
    </section>
  `;
}

function billingRouteTemplate() {
  return `
    <section class="billing-route" data-route="billing">
      ${routeHeader("Billing", "Plan and usage", "Your monthly plan, how much of your listing allowance you've used, and what renews next.")}
      <div class="billing-hero">
        <article class="card card-elevated billing-summary-card">
          <div class="billing-summary-head">
            <span class="badge badge-brand">${iconSvg("repeat")} Current plan</span>
            <span class="status-pill js-billing-status-pill">Inactive</span>
          </div>
          <h2 class="js-current-plan billing-plan-name">Free</h2>
          <p class="muted js-billing-plan-strapline">Try 3 listings on us, then choose a monthly plan.</p>
          <div class="billing-plan-actions" id="billingPlanActions"></div>
        </article>
        <article class="card billing-usage-card">
          <span class="badge">${iconSvg("wallet")} Listings used this cycle</span>
          <div class="billing-usage-readout">
            <strong class="js-usage">Loading usage</strong>
          </div>
          <div class="billing-usage-bar" aria-hidden="true">
            <span class="js-usage-bar"></span>
          </div>
          <p class="muted small">Usage resets at the start of each billing cycle.</p>
        </article>
        <article class="card billing-cycle-card">
          <span class="badge">${iconSvg("calendar")} Cycle ends</span>
          <h3 class="js-next-refill">No active subscription</h3>
          <p class="muted small js-billing-cycle-note">Subscribe monthly to keep generating listings.</p>
        </article>
      </div>

      <section class="card billing-benefits">
        <div class="section-head compact"><p class="eyebrow">What's included</p><h2 class="js-billing-plan-title">Your plan benefits</h2></div>
        <ul class="billing-benefits-list" id="billingBenefits">${loadingTemplate("Loading plan benefits...")}</ul>
      </section>

      <section class="billing-panel" data-billing-panel="subscriptions">
        <div class="section-head compact"><p class="eyebrow">Change your plan</p><h2 id="billingChangePlan">Switch up or down anytime</h2></div>
        <div class="pricing-grid" id="billingSubscriptions">${loadingTemplate("Loading monthly plans...")}</div>
      </section>

      <section class="card billing-activity"><div class="section-head compact"><p class="eyebrow">Activity</p><h3>Recent billing activity</h3></div><div id="billingTransactions">${loadingTemplate("Loading transactions...")}</div></section>

      <section class="card billing-support">
        <div>
          <strong>Need help with your subscription?</strong>
          <p class="muted small">Email us with the address on your account and we'll sort it.</p>
        </div>
        <a class="btn btn-secondary" href="mailto:support@listboost.uk?subject=ListBoost%20billing%20support">${iconSvg("mail")}<span>Email support</span></a>
      </section>
    </section>
  `;
}

function accountRouteTemplate() {
  return `
    <section class="account-route" data-route="account">
      ${routeHeader("Account", "Profile and security", "Update the details attached to your ListBoost account.")}
      <div class="account-grid">
        <section class="card account-panel">
          <div class="section-head compact"><p class="eyebrow">Profile</p><h2>Your details</h2></div>
          <form id="accountProfileForm">
            <label>Full name<input name="name" autocomplete="name" maxlength="80" required /><p class="field-error" aria-live="polite"></p></label>
            <label>Verified email<input name="email" type="email" autocomplete="email" readonly required /><p class="field-error" aria-live="polite"></p></label>
            <p class="field-helper">Your verified email is locked for account security. Contact support if you need to change it.</p>
            ${buttonTemplate({ variant: "primary", label: "Save profile", icon: "save", type: "submit" })}
          </form>
        </section>
        <section class="card account-panel">
          <div class="section-head compact"><p class="eyebrow">Appearance</p><h2>Theme</h2></div>
          <p class="muted">Choose how ListBoost looks on this device.</p>
          <div class="theme-choice-group" role="group" aria-label="Theme preference">
            <button class="btn btn-secondary theme-choice" type="button" data-theme-choice="system" aria-pressed="false">System</button>
            <button class="btn btn-secondary theme-choice" type="button" data-theme-choice="light" aria-pressed="false">Light</button>
            <button class="btn btn-secondary theme-choice" type="button" data-theme-choice="dark" aria-pressed="false">Dark</button>
          </div>
        </section>
        <section class="card account-panel">
          <div class="section-head compact"><p class="eyebrow">Security</p><h2>Change password</h2></div>
          <form id="accountPasswordForm">
            <label>Current password<input name="currentPassword" type="password" autocomplete="current-password" required /><p class="field-error" aria-live="polite"></p></label>
            <label>New password<input name="newPassword" type="password" autocomplete="new-password" minlength="8" required /><p class="field-error" aria-live="polite"></p></label>
            ${buttonTemplate({ variant: "secondary", label: "Update password", icon: "lock", type: "submit" })}
          </form>
        </section>
        <section class="card account-panel">
          <div class="section-head compact"><p class="eyebrow">Session</p><h2>Signed in on this device</h2></div>
          <p class="muted">Use this when you are finished or need to switch to another ListBoost account.</p>
          ${buttonTemplate({ variant: "ghost", label: "Sign out", icon: "log-out", attributes: { "data-logout": true } })}
        </section>
      </div>
    </section>
  `;
}

function hydrateAppRoute(me = accountState) {
  const route = appRouteName();
  if (route === "dashboard") loadDashboardHistory(me);
  if (route === "history") loadAppHistory();
  if (route === "billing") loadBilling(me);
  if (route === "account") hydrateAccountSettings(me);
}

function hydrateAccountSettings(me = accountState) {
  const form = $("#accountProfileForm");
  if (!form || !me.user) return;
  form.elements.name.value = me.user.name || "";
  form.elements.email.value = me.user.email || "";
  form.elements.email.readOnly = true;
  form.elements.email.setAttribute("aria-readonly", "true");
}

async function loadDashboardHistory(me = accountState) {
  $$(".js-first-run").forEach((node) => {
    node.classList.toggle("hidden", Number(me.usage?.usageThisMonth || 0) > 0);
  });
  const list = $("#dashboardHistory");
  if (!list) return;
  if (!me.user) {
    list.innerHTML = emptyStateTemplate({
      icon: "lock",
      heading: "Sign in to see activity",
      body: "Your generated listings will appear here after you create an account."
    });
    return;
  }
  try {
    const data = await api("/api/history?page=1&pageSize=5");
    if (!data.history?.length) {
      list.innerHTML = emptyStateTemplate({
        icon: "file-text",
        heading: "No listings yet - generate your first one to see it here",
        body: "Your saved titles, descriptions and copy buttons will appear in recent activity.",
        cta: buttonTemplate({ variant: "primary", label: "Generate a listing", icon: "arrow-right", href: "/app/notes" })
      });
      return;
    }
    list.innerHTML = data.history.slice(0, 5).map((item) => `
      <article class="history-card compact-history-card">
        <strong>${escapeHtml(item.title || "Untitled listing")}</strong>
        <p>${escapeHtml((item.description || "No description saved.").slice(0, 120))}</p>
        <div class="history-actions">
          ${copyButton("Copy title", item.title || "")}
          <a class="btn btn-ghost" href="/app/history">${iconSvg("arrow-right")}<span>View</span></a>
        </div>
      </article>
    `).join("");
  } catch (error) {
    list.innerHTML = emptyStateTemplate({
      icon: "x",
      heading: "Activity could not load",
      body: error.message || "Try again shortly."
    });
  }
}

function installPasswordToggles() {
  $$("input[type='password']").forEach((input) => {
    if (input.closest(".password-field")) return;
    const wrapper = document.createElement("span");
    wrapper.className = "password-field";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.append(input);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "password-toggle";
    button.setAttribute("aria-label", "Show password");
    button.innerHTML = eyeIcon;
    button.addEventListener("click", () => togglePasswordVisibility(input, button));
    wrapper.append(button);
  });
}

function setFieldError(form, name, message = "") {
  const field = form?.elements?.[name];
  if (!field) return;
  let error = field.closest("label, .field")?.querySelector(".field-error");
  if (!error) {
    error = document.createElement("p");
    error.className = "field-error";
    field.closest("label, .field")?.append(error);
  }
  error.textContent = message;
}

function clearFieldErrors(form) {
  $$(".field-error", form).forEach((node) => { node.textContent = ""; });
}

function validateFullName(value) {
  const raw = String(value || "");
  const trimmed = raw.trim();
  if (!trimmed) return "Enter your full name.";
  if (raw !== trimmed) return "Remove spaces before or after your name.";
  if (trimmed.replace(/\s+/g, " ").length > 80) return "Name must be 80 characters or fewer.";
  return "";
}

function validateEmailField(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim())
    ? ""
    : "Enter a valid email address.";
}

function validatePasswordField(value, label = "Password") {
  return String(value || "").length >= 8 ? "" : `${label} must be at least 8 characters.`;
}

function installFaq() {
  $$(".faq button").forEach((button) => {
    button.addEventListener("click", () => {
      const item = button.closest(".faq-item");
      item.classList.toggle("open");
      button.setAttribute("aria-expanded", item.classList.contains("open") ? "true" : "false");
    });
  });
}

function installForms() {
  installAuthMode();
  const authForm = $("#authForm");
  if (authForm) {
    authForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const mode = authForm.dataset.mode || "login";
      const button = authForm.querySelector("button[type=submit]");
      clearFieldErrors(authForm);
      const emailError = validateEmailField(authForm.elements.email?.value);
      const passwordError = validatePasswordField(authForm.elements.password?.value);
      const nameError = mode === "signup" ? validateFullName(authForm.elements.name?.value) : "";
      if (nameError || emailError || passwordError) {
        if (nameError) setFieldError(authForm, "name", nameError);
        if (emailError) setFieldError(authForm, "email", emailError);
        if (passwordError) setFieldError(authForm, "password", passwordError);
        authForm.elements[nameError ? "name" : emailError ? "email" : "password"]?.focus();
        return;
      }
      button.disabled = true;
      button.dataset.busy = "true";
      button.textContent = mode === "signup" ? "Creating..." : "Signing in...";
      try {
        const data = await api(`/api/${mode}`, {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(new FormData(authForm)))
        });
        if (data.verificationRequired && data.user && !data.emailVerified) {
          location.href = "/verify-email";
          return;
        }
        location.href = new URLSearchParams(location.search).get("next") || "/app";
      } catch (error) {
        const target = error.field || (/password/i.test(error.message) ? "password" : /name/i.test(error.message) ? "name" : "email");
        setFieldError(authForm, target, error.message);
        authForm.elements[target]?.focus();
      } finally {
        button.disabled = false;
        button.dataset.busy = "false";
        button.textContent = mode === "signup" ? "Create account" : "Sign in";
      }
    });
  }

  const resend = $("#resendVerification");
  if (resend) {
    const cooldown = $("#resendCooldown");
    let cooldownTimer;
    const startCooldown = (seconds = 60) => {
      clearInterval(cooldownTimer);
      resend.disabled = true;
      let remaining = Number(seconds || 60);
      if (cooldown) cooldown.textContent = `You can resend again in ${remaining}s.`;
      cooldownTimer = setInterval(() => {
        remaining -= 1;
        if (cooldown) cooldown.textContent = remaining > 0 ? `You can resend again in ${remaining}s.` : "";
        if (remaining <= 0) {
          clearInterval(cooldownTimer);
          resend.disabled = false;
        }
      }, 1000);
    };
    resend.addEventListener("click", async () => {
      try {
        startCooldown(60);
        const data = await api("/api/resend-verification", { method: "POST" });
        if (data.alreadyVerified) {
          location.href = "/app?verified=1";
          return;
        }
        toast("Verification link sent. Check your inbox.", "success");
      } catch (error) {
        toast(error.message, "error");
        startCooldown(error.retryAfterSec || 60);
      }
    });
  }

  const forgot = $("#forgotPasswordForm");
  if (forgot) {
    forgot.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = forgot.querySelector("button[type=submit]");
      clearFieldErrors(forgot);
      const emailError = validateEmailField(forgot.elements.email?.value);
      if (emailError) {
        setFieldError(forgot, "email", emailError);
        forgot.elements.email?.focus();
        return;
      }
      button.disabled = true;
      button.textContent = "Sending...";
      try {
        await api("/api/forgot-password", {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(new FormData(forgot)))
        });
        forgot.classList.add("hidden");
        $("#forgotSuccess")?.classList.remove("hidden");
        toast("If an account exists for that email, reset instructions are on the way.", "success");
      } catch {
        forgot.classList.add("hidden");
        $("#forgotSuccess")?.classList.remove("hidden");
      } finally {
        button.disabled = false;
        button.textContent = "Send reset email";
      }
    });
  }

  const reset = $("#resetPasswordForm");
  if (reset) {
    const params = new URLSearchParams(location.search);
    const token = params.get("token") || "";
    const card = $("#resetCard");
    const error = $("#resetError");
    const intro = $("#resetIntro");
    reset.classList.add("hidden");
    if (!token) {
      card?.classList.add("hidden");
      error?.classList.remove("hidden");
    } else {
      reset.elements.token.value = token;
      api(`/api/reset-password/validate?token=${encodeURIComponent(token)}`)
        .then((data) => {
          if (intro) intro.textContent = `Choose a new password for ${data.email}.`;
          reset.classList.remove("hidden");
        })
        .catch(() => {
          card?.classList.add("hidden");
          error?.classList.remove("hidden");
        });
    }
    if (location.search && !token) {
      $("#resetCard")?.classList.add("hidden");
      $("#resetError")?.classList.remove("hidden");
    }
    reset.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = reset.querySelector("button[type=submit]");
      clearFieldErrors(reset);
      const passwordError = validatePasswordField(reset.elements.password?.value);
      if (passwordError) {
        setFieldError(reset, "password", passwordError);
        reset.elements.password?.focus();
        return;
      }
      button.disabled = true;
      button.textContent = "Updating...";
      try {
        await api("/api/reset-password", {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(new FormData(reset)))
        });
        toast("Password updated. You can sign in now.", "success");
        location.href = "/login";
      } catch (err) {
        setFieldError(reset, /password/i.test(err.message) ? "password" : "token", err.message);
        button.disabled = false;
        button.textContent = "Update password";
      }
    });
  }

  const profileForm = $("#accountProfileForm");
  if (profileForm) {
    profileForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearFieldErrors(profileForm);
      const nameError = validateFullName(profileForm.elements.name?.value);
      const emailError = validateEmailField(profileForm.elements.email?.value);
      if (nameError || emailError) {
        if (nameError) setFieldError(profileForm, "name", nameError);
        if (emailError) setFieldError(profileForm, "email", emailError);
        profileForm.elements[nameError ? "name" : "email"]?.focus();
        return;
      }
      const button = profileForm.querySelector("button[type=submit]");
      button.disabled = true;
      button.textContent = "Saving...";
      try {
        const data = await api("/api/account/profile", {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(new FormData(profileForm)))
        });
        updateUsageFromResponse(data);
        toast("Profile saved.", "success");
        if (data.verificationRequired) location.href = "/verify-email";
      } catch (error) {
        const target = error.field || (/name/i.test(error.message) ? "name" : "email");
        setFieldError(profileForm, target, error.message);
        profileForm.elements[target]?.focus();
      } finally {
        button.disabled = false;
        button.textContent = "Save profile";
      }
    });
  }

  const passwordForm = $("#accountPasswordForm");
  if (passwordForm) {
    passwordForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearFieldErrors(passwordForm);
      const currentError = passwordForm.elements.currentPassword?.value ? "" : "Enter your current password.";
      const newError = validatePasswordField(passwordForm.elements.newPassword?.value, "New password");
      if (currentError || newError) {
        if (currentError) setFieldError(passwordForm, "currentPassword", currentError);
        if (newError) setFieldError(passwordForm, "newPassword", newError);
        passwordForm.elements[currentError ? "currentPassword" : "newPassword"]?.focus();
        return;
      }
      const button = passwordForm.querySelector("button[type=submit]");
      button.disabled = true;
      button.textContent = "Updating...";
      try {
        await api("/api/account/password", {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(new FormData(passwordForm)))
        });
        passwordForm.reset();
        toast("Password updated.", "success");
      } catch (error) {
        const target = error.field || (/current/i.test(error.message) ? "currentPassword" : "newPassword");
        setFieldError(passwordForm, target, error.message);
        passwordForm.elements[target]?.focus();
      } finally {
        button.disabled = false;
        button.textContent = "Update password";
      }
    });
  }
}

function uniqueItems(items = []) {
  return Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean)));
}

function linesFromText(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function listHtml(items = []) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function descriptionHtml(description) {
  const lines = linesFromText(description);
  if (!lines.length) return "<p>Add description details before posting.</p>";
  const [intro, ...bullets] = lines;
  return `
    <p>${escapeHtml(intro)}</p>
    ${bullets.length ? listHtml(bullets) : ""}
  `;
}

function priceGuidanceText(data = {}) {
  const price = data.priceOptions || {};
  const lines = [
    `Fast sale: ${price.fastSale || "-"}`,
    `Fair price: ${price.fairPrice || "-"}`,
    `Max price: ${price.maxPrice || "-"}`,
    price.lowestOffer ? `Lowest offer: ${price.lowestOffer}` : "",
    price.startPrice ? `Start at: ${price.startPrice}` : "",
    data.priceGuidance || "Check similar sold Vinted items before posting."
  ].filter(Boolean);
  return lines.join("\n");
}

function buyerReplyText(data = {}) {
  return data.buyerQuestionReply
    || (Array.isArray(data.buyerReplies) ? data.buyerReplies[0] : "")
    || "Hi, thanks for your message. This is still available and ready to post. Let me know if you would like any extra photos.";
}

function listingCopyText(data = {}) {
  const keywords = uniqueItems([...(data.tags || []), ...(data.searchTerms || [])]).join(", ");
  const photoChecklist = (data.photoChecklist || []).join("\n");
  return [
    "TITLE",
    data.title || "",
    "",
    "DESCRIPTION",
    data.description || "",
    "",
    "KEYWORDS",
    keywords,
    "",
    "PRICE GUIDANCE",
    priceGuidanceText(data),
    "",
    "PHOTO CHECKLIST",
    photoChecklist,
    "",
    "BUYER REPLY",
    buyerReplyText(data)
  ].join("\n").trim();
}

function copyButton(label, text) {
  return buttonTemplate({
    variant: "secondary",
    label,
    icon: "copy",
    className: "copy-button",
    attributes: { "data-copy": text || "" }
  });
}

function outputSection(title, html, copyText, copyLabel, valueLabel = "", icon = "file-text") {
  return `
    <section class="output-card result-card">
      <div class="result-card-head">
        <div class="result-card-title">
          <div class="feature-icon">${iconSvg(icon)}</div>
          <div>
            <h3>${title}</h3>
            ${valueLabel ? `<span class="badge">${escapeHtml(valueLabel)}</span>` : ""}
          </div>
        </div>
        ${copyButton(copyLabel, copyText)}
      </div>
      <div class="result-body">${html}</div>
    </section>
  `;
}

function transformationTemplate(inputText, data = {}) {
  if (!inputText) return "";
  const generated = [data.title, ...linesFromText(data.description).slice(0, 3)].filter(Boolean).join("\n");
  return `
    <section class="output-card transformation-card">
      <h3>Your input vs generated listing</h3>
      <div class="before-after-grid">
        <div>
          <span>Input</span>
          <p>${escapeHtml(inputText)}</p>
        </div>
        <div>
          <span>Generated</span>
          <p>${escapeHtml(generated || data.title || "Generated listing")}</p>
        </div>
      </div>
    </section>
  `;
}

function outputTemplate(data = {}, options = {}) {
  const keywords = uniqueItems([...(data.tags || []), ...(data.searchTerms || [])]).join(", ");
  const price = data.priceOptions || {};
  const priceText = priceGuidanceText(data);
  const photoItems = data.photoChecklist?.length ? data.photoChecklist : ["Front photo in natural light", "Label or size close-up", "Any flaws shown clearly", "Back view"];
  const reply = buyerReplyText(data);
  const allCopy = listingCopyText({ ...data, photoChecklist: photoItems });
  const usageNote = options.usageNote ? `<p class="credit-feedback">${escapeHtml(options.usageNote)}</p>` : "";
  const demoCta = options.demo ? '<a class="btn btn-primary result-cta" href="/signup">Create free account - 3 listings on us</a>' : "";
  const inputText = options.inputText || data.input?.itemDetails || "";
  const momentumNote = options.momentumCount ? `<p class="momentum-feedback">${escapeHtml(momentumMessage(options.momentumCount))}</p>` : "";

  return `
    <section class="result-set">
      <div class="card result-toolbar result-summary">
        <div>
          <span class="badge badge-brand">${iconSvg("check-circle")} Ready</span>
          <h2>Your listing is ready</h2>
          ${usageNote}
          ${momentumNote}
        </div>
        <div class="result-summary-actions">
          ${copyButton("Copy all", allCopy)}
          <button class="btn btn-secondary" type="button" data-toast-message="Saved to history">${iconSvg("save")}<span>Save to history</span></button>
          ${demoCta}
        </div>
      </div>
      ${listingCardTemplate(listingCardDataFromOutput(data), { elevated: true, className: "result-listing-preview" })}
      ${transformationTemplate(inputText, data)}
      ${outputSection("Title", `<p class="result-title">${escapeHtml(data.title || "Vinted-ready listing title")}</p>`, data.title || "", "Copy title", "Optimised for Vinted search", "file-text")}
      ${outputSection("Description", descriptionHtml(data.description), data.description || "", "Copy description", "High-conversion description", "list-check")}
      ${outputSection("Keywords", `<p>${escapeHtml(keywords || "vinted, preloved, wardrobe clearout")}</p>`, keywords, "Copy keywords", "Search terms ready", "tag")}
      ${outputSection("Price guidance", `
        <div class="mini-cards">
          <span><strong>Fast</strong>${escapeHtml(price.fastSale || "-")}</span>
          <span><strong>Fair</strong>${escapeHtml(price.fairPrice || "-")}</span>
          <span><strong>Max</strong>${escapeHtml(price.maxPrice || "-")}</span>
        </div>
        <p>${escapeHtml(data.priceGuidance || "Check similar sold Vinted items before posting.")}</p>
      `, priceText, "Copy price", "Suggested competitive pricing", "badge-pound")}
      ${outputSection("Photo checklist", listHtml(photoItems), photoItems.join("\n"), "Copy checklist", "Listing-photo checklist", "image")}
      ${outputSection("Suggested buyer reply", `<p>${escapeHtml(reply)}</p>`, reply, "Copy reply", "Natural seller reply", "message-circle")}
    </section>
  `;
}

function loadingTemplate(message) {
  return `
    <div class="results-skeleton" aria-busy="true" aria-label="${escapeHtml(message)}">
      <div class="skeleton-toolbar">
        <span></span>
        <span></span>
      </div>
      <div class="skeleton-listing"></div>
      <div class="skeleton-grid">
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  `;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function installCopyFeedback() {
  if (globalCopyHandlerInstalled) return;
  globalCopyHandlerInstalled = true;
  document.addEventListener("click", async (event) => {
    const toastButton = event.target.closest("[data-toast-message]");
    if (toastButton) {
      toast(toastButton.dataset.toastMessage || "Done", "success");
      return;
    }
    const copy = event.target.closest("[data-copy]");
    if (!copy) return;
    await navigator.clipboard.writeText(copy.dataset.copy || "");
    const original = copy.textContent;
    copy.textContent = "Copied!";
    copy.setAttribute("aria-live", "polite");
    copySuccessCount += 1;
    toast(copySuccessCount >= 3 ? "You're ready to list this item" : "Copied to clipboard", "success");
    setTimeout(() => {
      copy.textContent = original;
      copy.removeAttribute("aria-live");
    }, 2000);
  });
}

function showPaywallModal() {
  $(".paywall-backdrop")?.remove();
  const plans = getSubscriptionPlans();
  const createdCount = Number(accountState.usage?.usageThisMonth || 0);
  const featuredPlan = plans.find((plan) => plan.featured) || plans[0];
  document.body.insertAdjacentHTML("beforeend", `
    <div class="paywall-backdrop" role="presentation">
      <section class="paywall-modal" role="dialog" aria-modal="true" aria-labelledby="paywallTitle">
        <button class="paywall-close" type="button" data-close-paywall aria-label="Close">x</button>
        <p class="badge">Subscription</p>
        <h2 id="paywallTitle">Upgrade your plan to continue generating listings</h2>
        <p class="paywall-proof">You've created ${createdCount} ${createdCount === 1 ? "listing" : "listings"} this cycle.</p>
        <p class="muted">Pick the monthly plan that matches your listing volume.</p>
        ${featuredPlan ? `
          <article class="paywall-pack is-featured is-dominant subscription-paywall">
            <span>Recommended monthly</span>
            <strong>${escapeHtml(featuredPlan.name)} - ${featuredPlan.unlimited || featuredPlan.monthlyLimit == null ? "Unlimited" : Number(featuredPlan.monthlyLimit || 0)} listings/month</strong>
            <p>${escapeHtml(formatMonthlyPrice(featuredPlan))}</p>
            <button type="button" class="pricing-buy" data-subscription-plan="${escapeHtml(featuredPlan.id)}">Subscribe monthly</button>
          </article>
        ` : ""}
        <div class="paywall-packs">
          ${plans.filter((plan) => !featuredPlan || plan.id !== featuredPlan.id).map((plan) => `
            <article class="paywall-pack">
              <span>${escapeHtml(plan.label || "Monthly")}</span>
              <strong>${plan.unlimited || plan.monthlyLimit == null ? "Unlimited" : Number(plan.monthlyLimit || 0)} listings/month</strong>
              <p>${escapeHtml(formatMonthlyPrice(plan))}</p>
              <button type="button" class="pricing-buy" data-subscription-plan="${escapeHtml(plan.id)}">Subscribe ${escapeHtml(plan.name)}</button>
            </article>
          `).join("")}
        </div>
      </section>
    </div>
  `);
  $(".paywall-modal button")?.focus();
}

function handleGenerationError(error) {
  const usage = error?.usage;
  const overLimit = error?.status === 402 || (usage && !usage.unlimited && Number(usage.remaining || 0) <= 0);
  if (overLimit) {
    updateUsageFromResponse(error);
    showPaywallModal();
  }
  toast(error.message, "error");
}

function installNotesInteractions(notesForm) {
  const textarea = notesForm?.elements?.itemDetails;
  const counter = $("#notesCharCount");
  if (!textarea) return;
  const updateTextarea = () => {
    if (counter) counter.textContent = `${textarea.value.length} characters`;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  textarea.addEventListener("input", updateTextarea);
  $$(".example-chip", notesForm).forEach((button) => {
    button.addEventListener("click", () => {
      textarea.value = button.dataset.exampleText || "";
      updateTextarea();
      textarea.focus();
    });
  });
  updateTextarea();
}

function installAppTools() {
  const notesForm = $("#notesForm");
  if (notesForm) {
    installNotesInteractions(notesForm);
    notesForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const out = $("#output");
      out.hidden = false;
      out.innerHTML = loadingTemplate("Generating your listing...");
      try {
        const formPayload = Object.fromEntries(new FormData(notesForm));
        const data = await api("/api/generate", { method: "POST", body: JSON.stringify(formPayload) });
        updateUsageFromResponse(data);
        const momentumCount = recordGenerationMomentum();
        out.innerHTML = outputTemplate(data, { usageNote: formatUsageText(data.usage), inputText: formPayload.itemDetails, momentumCount });
        toast("Listing generated.", "success");
      } catch (error) {
        out.innerHTML = emptyStateTemplate({
          icon: "x",
          heading: "Generation paused",
          body: error.message || "Something went wrong. Try again in a moment."
        });
        handleGenerationError(error);
      }
    });
  }

  const photoRouteForm = $("#photoRouteForm");
  if (photoRouteForm) {
    photoRouteForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const out = $("#photoRouteOutput");
      out.innerHTML = loadingTemplate("Reading photos...");
      try {
        const formData = new FormData(photoRouteForm);
        const files = Array.from(photoRouteForm.elements.photos.files || []).slice(0, 4);
        if (!files.length) throw new Error("Add at least one photo first.");
        const photos = await Promise.all(files.map(fileToDataUrl));
        const data = await api("/api/generate-from-photos", {
          method: "POST",
          body: JSON.stringify({
            photos,
            category: formData.get("category") || "",
            size: formData.get("size") || "",
            condition: formData.get("condition") || "",
            notes: formData.get("notes") || "",
            tone: "clean",
            sellerMode: "clearout",
            negotiationGoal: "friendly"
          })
        });
        updateUsageFromResponse(data);
        const momentumCount = recordGenerationMomentum();
        out.innerHTML = outputTemplate(data, { usageNote: formatUsageText(data.usage), inputText: formData.get("notes") || "Photo upload", momentumCount });
        toast("Generated from photos.", "success");
      } catch (error) {
        out.innerHTML = emptyStateTemplate({ icon: "x", heading: "Photo generation paused", body: error.message });
        handleGenerationError(error);
      }
    });
  }

  const scoreForm = $("#scoreForm");
  if (scoreForm) {
    scoreForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const out = $("#scoreOutputPanel");
      out.innerHTML = loadingTemplate("Scoring listing...");
      try {
        const formData = new FormData(scoreForm);
        const data = await api("/api/generate", {
          method: "POST",
          body: JSON.stringify({
            category: "Clothing",
            itemDetails: `${formData.get("title") || ""}\n${formData.get("description") || ""}`,
            tone: "clean",
            sellerMode: "clearout",
            negotiationGoal: "friendly"
          })
        });
        updateUsageFromResponse(data);
        const momentumCount = recordGenerationMomentum();
        out.innerHTML = outputTemplate(data, { usageNote: formatUsageText(data.usage), inputText: `${formData.get("title") || ""}\n${formData.get("description") || ""}`.trim(), momentumCount });
        toast("Listing scored.", "success");
      } catch (error) {
        out.innerHTML = emptyStateTemplate({ icon: "x", heading: "Score paused", body: error.message });
        handleGenerationError(error);
      }
    });
  }

  const replyForm = $("#replyForm");
  if (replyForm) {
    replyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const out = $("#replyOutput");
      out.innerHTML = loadingTemplate("Writing reply...");
      try {
        const formData = new FormData(replyForm);
        const data = await api("/api/generate", {
          method: "POST",
          body: JSON.stringify({
            category: "Clothing",
            itemDetails: formData.get("itemDetails"),
            buyerQuestion: formData.get("buyerQuestion"),
            tone: "friendly",
            sellerMode: "clearout",
            negotiationGoal: "friendly"
          })
        });
        const reply = data.buyerQuestionReply || (data.buyerReplies || [])[0] || "Reply generated.";
        updateUsageFromResponse(data);
        out.innerHTML = `<section class="output-card reply-block"><h3>Suggested reply</h3><p>${escapeHtml(reply)}</p>${copyButton("Copy reply", reply)}</section>`;
        toast("Reply generated.", "success");
      } catch (error) {
        out.innerHTML = emptyStateTemplate({ icon: "x", heading: "Reply paused", body: error.message });
        handleGenerationError(error);
      }
    });
  }

  const historySearch = $("#historySearch");
  if (historySearch) {
    let timer;
    historySearch.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => loadAppHistory(1), 250);
    });
  }

  const demo = $("#runDemo");
  if (demo) {
    demo.addEventListener("click", async () => {
      const out = $("#demoOutput");
      const input = $("#demoInput")?.value || "Zara navy satin midi dress, UK 10, worn twice";
      out.innerHTML = loadingTemplate("Generating your demo listing...");
      try {
        const data = await api("/api/demo-generate", {
          method: "POST",
          body: JSON.stringify({ itemDetails: input })
        });
        out.innerHTML = demoResultTemplate(data, input);
      } catch (error) {
        out.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
      }
    });
  }

  installCopyFeedback();
}

async function loadAppHistory(page = 1) {
  const list = $("#historyList");
  const pager = $("#historyPager");
  if (!list) return;
  if (!accountState.user) {
    list.innerHTML = '<div class="empty-state">Sign in to see saved listings.</div>';
    if (pager) pager.innerHTML = "";
    return;
  }
  const query = $("#historySearch")?.value || "";
  list.innerHTML = loadingTemplate("Loading history...");
  try {
    const data = await api(`/api/history?page=${page}&pageSize=20&q=${encodeURIComponent(query)}`);
    if (!data.history?.length) {
      list.innerHTML = emptyStateTemplate({
        icon: "file-text",
        heading: "No listings yet - generate your first one to see it here",
        body: "Once you create a listing package, you can reopen and copy it from here.",
        cta: buttonTemplate({ variant: "primary", label: "Generate a listing", icon: "arrow-right", href: "/app/notes" })
      });
    } else {
      list.innerHTML = data.history.map((item) => `
        <article class="history-card" data-history-id="${escapeHtml(item.id)}">
          <strong>${escapeHtml(item.title || "Untitled listing")}</strong>
          <span>${Number(item.score || 0)}/100</span>
          <p>${escapeHtml((item.description || "No description saved.").slice(0, 180))}</p>
          <div class="history-meta">${escapeHtml(item.source === "photos" ? "from photos" : "from notes")}</div>
          <div class="history-actions">
            ${copyButton("Copy title", item.title || "")}
            ${copyButton("Copy description", item.description || "")}
          </div>
        </article>
      `).join("");
    }
    const pagination = data.pagination || { page: 1, totalPages: 1 };
    if (pager) {
      pager.innerHTML = `
        <button class="btn btn-secondary" type="button" ${pagination.page <= 1 ? "disabled" : ""} data-history-page="${pagination.page - 1}">Previous</button>
        <span>Page ${pagination.page} of ${pagination.totalPages}</span>
        <button class="btn btn-secondary" type="button" ${pagination.page >= pagination.totalPages ? "disabled" : ""} data-history-page="${pagination.page + 1}">Next</button>
      `;
      $$("[data-history-page]", pager).forEach((button) => {
        button.addEventListener("click", () => loadAppHistory(Number(button.dataset.historyPage)));
      });
    }
  } catch (error) {
    list.innerHTML = emptyStateTemplate({ icon: "x", heading: "History could not load", body: error.message });
  }
}

function planBenefitsFor(planId) {
  const benefits = {
    free: [
      "3 listings to try ListBoost",
      "Notes-to-listing generator",
      "Title, description, keywords, price guidance, photo checklist, buyer reply",
      "Subscribe to keep going past the free trial"
    ],
    starter: [
      "Up to 20 listings per month",
      "Notes-to-listing generator",
      "Titles, descriptions and keywords",
      "Saved history"
    ],
    seller: [
      "Up to 100 listings per month",
      "Everything in Starter",
      "Photo upload and buyer replies",
      "Price guidance and listing score"
    ],
    reseller: [
      "Unlimited monthly listings",
      "Everything in Seller",
      "Bulk-friendly workflow and reusable templates",
      "Priority support"
    ]
  };
  return benefits[planId] || benefits.free;
}

function planStrapline(planId) {
  return ({
    free: "Try 3 listings on us, then choose a monthly plan.",
    starter: "Light, monthly plan for casual sellers.",
    seller: "The full toolkit weekly Vinted sellers need.",
    reseller: "Unlimited usage and priority support for daily sellers."
  })[planId] || "";
}

async function loadBilling(me = accountState) {
  const subscriptions = $("#billingSubscriptions");
  const transactions = $("#billingTransactions");
  const benefits = $("#billingBenefits");
  const planActions = $("#billingPlanActions");
  if (!subscriptions || !transactions) return;
  if (!me.user) {
    subscriptions.innerHTML = '<div class="empty-state">Sign in to subscribe monthly.</div>';
    transactions.innerHTML = '<div class="empty-state">Billing activity appears after your first subscription.</div>';
    if (benefits) benefits.innerHTML = "";
    return;
  }
  try {
    const data = await api("/api/billing");
    updateUsageFromResponse(data);
    const currentPlan = data.subscription?.plan || data.user?.plan || "free";
    const currentStatus = String(data.subscription?.status || data.user?.subscriptionStatus || "inactive").toLowerCase();
    const isPaying = ["active", "trialing", "past_due"].includes(currentStatus);
    const usage = data.usage || me.usage || {};
    const usagePct = usage.unlimited ? 100 : Math.min(100, Math.round((Number(usage.usageThisMonth || 0) / Math.max(Number(usage.usageLimit || 1), 1)) * 100));
    const bar = $(".js-usage-bar");
    if (bar) {
      bar.style.width = `${usagePct}%`;
      bar.dataset.full = usage.unlimited ? "true" : (usagePct >= 90 ? "true" : "false");
    }
    $$(".js-billing-status-pill").forEach((node) => {
      node.textContent = titleCasePlan(currentStatus || "Inactive");
      node.dataset.status = currentStatus;
    });
    $$(".js-billing-plan-strapline").forEach((node) => { node.textContent = planStrapline(currentPlan); });
    $$(".js-billing-plan-title").forEach((node) => { node.textContent = `${data.subscription?.planName || titleCasePlan(currentPlan)} plan benefits`; });
    $$(".js-billing-cycle-note").forEach((node) => {
      if (isPaying) {
        node.textContent = "Auto-renews and resets your usage at the cycle end.";
      } else {
        node.textContent = "Subscribe monthly to keep generating listings.";
      }
    });

    if (planActions) {
      const canPortal = isPaying;
      planActions.innerHTML = canPortal
        ? `<button class="btn btn-secondary" type="button" data-manage-subscription>${iconSvg("user-cog")}<span>Manage subscription</span></button>
           <a class="btn btn-ghost" href="#billingChangePlan">${iconSvg("repeat")}<span>Change plan</span></a>`
        : `<a class="btn btn-primary" href="#billingChangePlan">${iconSvg("arrow-right")}<span>Choose a plan</span></a>`;
    }

    if (benefits) {
      benefits.innerHTML = planBenefitsFor(currentPlan).map((item) => `
        <li>${iconSvg("check-circle")}<span>${escapeHtml(item)}</span></li>
      `).join("");
    }

    subscriptions.innerHTML = (data.subscriptionPlans || []).map((plan) => {
      const isCurrent = currentPlan === plan.id && isPaying;
      return pricingCardTemplate({
        ...plan,
        current: isCurrent,
        label: plan.featured ? "Best value" : plan.label || "Monthly",
        ctaLabel: isCurrent ? "Current plan" : currentPlan === "free" ? `Subscribe ${plan.name}` : `Switch to ${plan.name}`
      });
    }).join("");

    const rows = [
      ...(data.cycles || []).map((item) => ({ label: `${titleCasePlan(item.plan)} billing cycle`, amount: "Reset", date: item.createdAt })),
      ...(data.audit || []).map((item) => ({ label: item.reason, amount: item.actor, date: item.createdAt }))
    ].slice(0, 20);
    transactions.innerHTML = rows.length ? `
      <div class="transaction-list">
        ${rows.map((row) => `<div><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.amount)}</strong><time>${escapeHtml(formatDate(row.date) || row.date)}</time></div>`).join("")}
      </div>
    ` : emptyStateTemplate({ icon: "wallet", heading: "No activity yet", body: "Subscription cycles and plan changes appear here." });
  } catch (error) {
    transactions.innerHTML = emptyStateTemplate({ icon: "x", heading: "Billing could not load", body: error.message });
  }
}

function installCheckoutButtons() {
  document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-close-paywall]") || event.target.classList.contains("paywall-backdrop")) {
      $(".paywall-backdrop")?.remove();
      return;
    }
    const billingView = event.target.closest("[data-billing-view]");
    if (billingView) {
      const view = billingView.dataset.billingView;
      $$("[data-billing-view]").forEach((button) => button.classList.toggle("is-active", button === billingView));
      $$("[data-billing-panel]").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.billingPanel !== view));
      return;
    }
    const pricingView = event.target.closest("[data-pricing-view]");
    if (pricingView) {
      const view = pricingView.dataset.pricingView;
      $$("[data-pricing-view]").forEach((button) => button.classList.toggle("is-active", button === pricingView));
      $$("[data-pricing-panel]").forEach((panel) => panel.classList.toggle("is-muted-panel", panel.dataset.pricingPanel !== view));
      return;
    }
    const manageSubscription = event.target.closest("[data-manage-subscription]");
    if (manageSubscription) {
      manageSubscription.disabled = true;
      const original = manageSubscription.innerHTML;
      manageSubscription.textContent = "Opening portal...";
      try {
        const data = await api("/api/create-billing-portal-session", { method: "POST" });
        if (data.url) location.href = data.url;
      } catch (error) {
        toast(error.message, "error");
        manageSubscription.disabled = false;
        manageSubscription.innerHTML = original;
      }
      return;
    }
    const subscriptionButton = event.target.closest("[data-subscription-plan]");
    if (subscriptionButton) {
      if (!accountState.user) {
        location.href = `/signup?next=${encodeURIComponent("/app/billing")}`;
        return;
      }
      subscriptionButton.disabled = true;
      const original = subscriptionButton.textContent;
      subscriptionButton.textContent = "Opening checkout...";
      try {
        const data = await api("/api/create-subscription-checkout-session", {
          method: "POST",
          body: JSON.stringify({ planId: subscriptionButton.dataset.subscriptionPlan })
        });
        if (data.url) {
          location.href = data.url;
          return;
        }
        updateUsageFromResponse(data);
        toast(data.unchanged ? "You're already on this plan." : "Subscription plan updated.", "success");
        loadBilling(accountState);
      } catch (error) {
        toast(error.message, "error");
        if (error.authUrl) {
          location.href = error.authUrl;
          return;
        }
        subscriptionButton.disabled = false;
        subscriptionButton.textContent = original;
      }
    }
  });
}

function installLogout() {
  document.addEventListener("click", async (event) => {
    if (!event.target.closest("[data-logout]")) return;
    await api("/api/logout", { method: "POST" });
    location.href = "/";
  });
}

function installCheckoutSuccess() {
  const status = $("#checkoutStatus");
  if (!status) return;
  const sessionId = new URLSearchParams(location.search).get("session_id");
  if (!sessionId) {
    status.innerHTML = "<strong>Missing checkout session.</strong><span>Email <a href='mailto:support@listboost.uk'>support@listboost.uk</a> if you completed payment.</span>";
    $$(".js-success-headline").forEach((node) => { node.textContent = "Awaiting payment reference"; });
    return;
  }
  let attempts = 0;
  const setHeadline = (text) => {
    $$(".js-success-headline").forEach((node) => { node.textContent = text; });
  };
  const timer = setInterval(async () => {
    attempts += 1;
    try {
      const data = await api(`/api/checkout/success?session_id=${encodeURIComponent(sessionId)}`);
      updateUsageFromResponse(data);
      const planName = data.subscription?.planName || data.user?.planName || "your plan";
      if (!data.pending || attempts >= 15) {
        clearInterval(timer);
        if (!data.pending) {
          status.innerHTML = `<strong>Your subscription is active.</strong><span>You're on ${escapeHtml(planName)}. Usage resets each billing cycle.</span>`;
          setHeadline("Subscription active");
          document.body.classList.add("confetti");
        } else {
          status.innerHTML = "<strong>Subscription not active yet?</strong><span>Email <a href='mailto:support@listboost.uk'>support@listboost.uk</a> with your payment reference.</span>";
          setHeadline("Awaiting webhook");
        }
      }
    } catch {
      if (attempts >= 15) {
        clearInterval(timer);
        status.innerHTML = "Payment received. If your subscription is not active shortly, contact <a href='mailto:support@listboost.uk'>support@listboost.uk</a>.";
        setHeadline("Awaiting webhook");
      }
    }
  }, 2000);
}

bootstrap();
