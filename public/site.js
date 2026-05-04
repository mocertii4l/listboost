import { eyeIcon, togglePasswordVisibility } from "./auth-utils.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const toastRegion = $("#toastRegion");
let accountState = { user: null, credits: null };
let globalCopyHandlerInstalled = false;
let appNavigationInstalled = false;
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
    button.textContent = next === "dark" ? "Light" : "Dark";
  });
}

function installTheme() {
  applyTheme();
  $$(".theme-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const current = document.documentElement.dataset.theme;
      applyTheme(current === "dark" ? "light" : "dark");
    });
  });
}

function publicHeaderTemplate() {
  return `
    <a class="lb-brand" href="/"><img src="/logo.svg" alt="" />ListBoost</a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="publicNav">Menu</button>
    <nav id="publicNav" class="public-nav" aria-label="Primary">
      <a href="/#how-it-works">How it works</a>
      <a href="/example">Example</a>
      <a href="/pricing">Pricing</a>
    </nav>
    <div class="nav-actions">
      <button class="theme-toggle" type="button" aria-pressed="false">Dark</button>
      <span class="signed-in-only nav-email js-email"></span>
      <button class="signed-in-only nav-logout" type="button" data-logout>Log out</button>
      <a class="signed-out-only nav-login" href="/login">Log in</a>
      <a class="signed-out-only button primary nav-start" href="/signup">Start free</a>
    </div>
  `;
}

function installPublicShell() {
  const isPublic = [
    "/",
    "/pricing",
    "/example",
    "/privacy",
    "/terms",
    "/signup",
    "/login",
    "/verify-email",
    "/forgot-password",
    "/reset-password",
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
          <a class="lb-brand" href="/"><img src="/logo.svg" alt="" />ListBoost</a>
          <nav class="footer-links" aria-label="Footer">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="mailto:support@listboost.uk">Support</a>
          </nav>
          <p class="footer-disclaimer">Independent - not affiliated with Vinted.</p>
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
  return `GBP ${(Number(pence || 0) / 100).toFixed(2).replace(/\.00$/, "")}`;
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

function fallbackCreditPacks() {
  return [
    { id: "starter", name: "Starter", credits: 50, pricePence: 500, label: "One-time" },
    { id: "seller", name: "Seller", credits: 150, pricePence: 1200, label: "Best value", featured: true },
    { id: "reseller", name: "Reseller", credits: 400, pricePence: 2500, label: "Bulk pack" }
  ];
}

function fallbackSubscriptionPlans() {
  return [
    { id: "starter", name: "Starter", credits: 50, pricePence: 500, label: "Monthly starter" },
    { id: "seller", name: "Seller", credits: 150, pricePence: 1200, label: "Best value", featured: true },
    { id: "reseller", name: "Reseller", credits: 400, pricePence: 2500, label: "Bulk seller" }
  ];
}

function getCreditPacks() {
  return Array.isArray(accountState.creditPacks) && accountState.creditPacks.length
    ? accountState.creditPacks
    : fallbackCreditPacks();
}

function getSubscriptionPlans() {
  return Array.isArray(accountState.subscriptionPlans) && accountState.subscriptionPlans.length
    ? accountState.subscriptionPlans
    : fallbackSubscriptionPlans();
}

function updateAccountChrome(me = accountState) {
  accountState = { ...accountState, ...me };
  const remaining = Number(accountState.credits?.remaining || 0);
  const plan = accountState.subscription || accountState.user || {};
  $$(".js-email").forEach((node) => { node.textContent = accountState.user?.email || "Signed out"; });
  $$(".js-credits").forEach((node) => { node.textContent = `${remaining} credits remaining`; });
  $$(".js-current-plan").forEach((node) => { node.textContent = plan.planName || titleCasePlan(plan.subscriptionPlan || plan.plan || "Free"); });
  $$(".js-next-refill").forEach((node) => { node.textContent = plan.nextCreditRefill ? formatDate(plan.nextCreditRefill) : "No refill scheduled"; });
  $$(".low-credit-cta").forEach((node) => {
    const show = Boolean(accountState.user) && remaining < 10;
    node.classList.toggle("hidden", !show);
    node.textContent = remaining <= 0 ? "Subscribe or buy credits" : `Only ${remaining} credits left - top up`;
    node.href = "/app/billing";
  });
  document.body.classList.toggle("signed-in", Boolean(accountState.user));
  document.body.classList.toggle("signed-out", !accountState.user);
}

function updateCreditsFromResponse(data = {}) {
  if (!data.credits && !data.user) return;
  updateAccountChrome({
    user: data.user || accountState.user,
    credits: data.credits || accountState.credits,
    creditPacks: data.creditPacks || accountState.creditPacks,
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

function renderPacks(packs) {
  const grid = $("#packGrid");
  if (!grid || !Array.isArray(packs)) return;
  const creditCards = packs.map((pack) => `
    <article class="pricing-card ${pack.featured ? "is-featured featured" : ""}" id="${escapeHtml(pack.id)}">
      <span class="badge">${escapeHtml(pack.label || "One-time")}</span>
      <h3>${escapeHtml(pack.name)}</h3>
      <p class="pricing-price"><strong>${Number(pack.credits || 0)}</strong><span>credits</span></p>
      <p class="pricing-meta">${escapeHtml(formatPrice(pack.pricePence))} one-time</p>
      <p class="pricing-copy">${escapeHtml(pack.description || "Credits for listings, price guidance and buyer replies.")}</p>
      <ul class="pricing-compare"><li>One credit per generated listing</li><li>Saved history and copy tools</li><li>Buyer replies and price guidance</li></ul>
      <button class="pricing-buy" type="button" data-checkout-pack="${escapeHtml(pack.id)}" data-pack-id="${escapeHtml(pack.id)}">Buy ${escapeHtml(pack.name)}</button>
    </article>
  `).join("");
  const subscriptionCards = getSubscriptionPlans().map((plan) => `
    <article class="pricing-card subscription-card ${plan.featured ? "is-featured featured" : ""}" id="subscribe-${escapeHtml(plan.id)}">
      <span class="badge">${escapeHtml(plan.featured ? "Recommended" : plan.label || "Monthly")}</span>
      <h3>${escapeHtml(plan.name)}</h3>
      <p class="pricing-price"><strong>${Number(plan.credits || 0)}</strong><span>credits/month</span></p>
      <p class="pricing-meta">${escapeHtml(formatMonthlyPrice(plan))}</p>
      <p class="pricing-copy">${escapeHtml(plan.description || "Fresh credits every month for consistent Vinted listing.")}</p>
      <ul class="pricing-compare"><li>Monthly credit refill</li><li>Good for regular listing sessions</li><li>Cancel or switch plans from billing</li></ul>
      <button class="pricing-buy" type="button" data-subscription-plan="${escapeHtml(plan.id)}">${plan.featured ? "Subscribe monthly" : `Subscribe ${escapeHtml(plan.name)}`}</button>
    </article>
  `).join("");
  grid.innerHTML = `
    <div class="pricing-mode-section">
      <div class="section-head compact"><p class="eyebrow">Buy credits</p><h2>One-time packs</h2></div>
      <div class="pricing-grid">${creditCards}</div>
    </div>
    <div class="pricing-mode-section recommended">
      <div class="section-head compact"><p class="eyebrow">Subscribe monthly</p><h2>Recommended for active sellers</h2></div>
      <div class="pricing-grid">${subscriptionCards}</div>
    </div>
  `;
}

async function bootstrap() {
  installPublicShell();
  renderAppRoute();
  installTheme();
  installPasswordToggles();
  installAppNavigation();
  try {
    const me = await api("/api/me");
    accountState = me;
    renderPacks(me.creditPacks || []);
    updateAccountChrome(me);
    hydrateAppRoute(me);
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
  const button = authForm.querySelector("button[type=submit]");
  const links = $("#authLinks");
  authForm.dataset.mode = isSignup ? "signup" : "login";
  if (heading) heading.textContent = isSignup ? "Create account" : "Sign in";
  if (button) button.textContent = isSignup ? "Create account" : "Sign in";
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
  installAppTools();
  hydrateAppRoute(accountState);
  updateAccountChrome(accountState);
  $("#main")?.scrollIntoView({ block: "start" });
}

function installAppNavigation() {
  if (appNavigationInstalled) return;
  appNavigationInstalled = true;
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href^='/app']");
    if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href, location.origin);
    if (url.origin !== location.origin || !url.pathname.startsWith("/app")) return;
    event.preventDefault();
    navigateApp(`${url.pathname}${url.search}${url.hash}`);
  });
  window.addEventListener("popstate", () => navigateApp(`${location.pathname}${location.search}${location.hash}`, false));
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
  return ["dashboard", "notes", "photo", "score", "replies", "history", "billing"].includes(name) ? name : "dashboard";
}

const appFeatureTiles = [
  ["notes", "Notes", "Turn rough item notes into a complete listing.", "/app/notes"],
  ["replies", "Replies", "Write buyer replies for offers and questions.", "/app/replies"],
  ["history", "History", "Search and reopen saved listing packages.", "/app/history"],
  ["billing", "Billing", "Manage credits, subscriptions and recent transactions.", "/app/billing"]
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
    billing: billingRouteTemplate
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
    <section data-route="dashboard">
      ${routeHeader("Dashboard", "Your ListBoost workspace", "Choose the workflow you need. Your credits and history stay with your account.")}
      ${appTrustStrip()}
      <div class="dashboard-grid route-grid">
        <article class="card balance-card"><span class="badge">Balance</span><h2 class="js-credits">Loading credits</h2><p class="muted js-email">Loading account</p><a class="button primary" href="/app/notes">Generate listing</a></article>
        ${appFeatureTiles.map(([, title, copy, href]) => `<a class="card feature-tile" href="${href}"><h3>${title}</h3><p>${copy}</p></a>`).join("")}
      </div>
    </section>
  `;
}

function notesRouteTemplate() {
  return `
    <section class="generator-route" data-route="notes">
      <form class="card generator-card" id="notesForm">
        <div class="generator-step">
          <span class="badge">Step 1</span>
          <h1>Paste your item details</h1>
          <p class="muted">Add the rough facts you already have. ListBoost turns them into a polished Vinted listing.</p>
        </div>
        <input type="hidden" name="category" value="Clothing" />
        <input type="hidden" name="tone" value="clean" />
        <input type="hidden" name="sellerMode" value="clearout" />
        <input type="hidden" name="negotiationGoal" value="friendly" />
        <label class="generator-input-label">
          Paste your item details
          <textarea name="itemDetails" required placeholder="Black Zara dress, size 10, worn twice, good condition"></textarea>
        </label>
        <div class="generator-actions">
          <span class="badge">Step 2</span>
          <button class="button primary generator-cta" type="submit">Generate listing</button>
        </div>
        ${appTrustStrip()}
      </form>
      <section class="output-stack results-stack" id="output" aria-live="polite" hidden></section>
    </section>
  `;
}

function photoRouteTemplate() {
  return `
    <section class="tool-layout" data-route="photo">
      <form class="card sticky-form" id="photoRouteForm">
        <span class="badge">Photo</span>
        <h1>Generate from photos</h1>
        <label>Photos<input name="photos" type="file" accept="image/*" multiple /></label>
        <label>Category<select name="category"><option>Clothing</option><option>Shoes</option><option>Bags</option><option>Accessories</option></select></label>
        <label>Size<input name="size" placeholder="UK 10, M, EU 39" /></label>
        <label>Condition<input name="condition" placeholder="Good condition, worn once" /></label>
        <label>Notes<textarea name="notes" placeholder="Optional: brand, flaws, postage details..."></textarea></label>
        <button class="button primary" type="submit">Generate from photos</button>
      </form>
      <section class="output-stack" id="photoRouteOutput"><div class="empty-state">Upload up to four photos to generate a listing.</div></section>
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
        <button class="button primary" type="submit">Score listing</button>
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
        <button class="button primary" type="submit">Write reply</button>
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
    <section data-route="billing">
      ${routeHeader("Billing", "Plan and credits", "Manage monthly credits, one-time packs and recent credit activity.")}
      <div class="billing-overview">
        <article class="card balance-card"><span class="badge">Current plan</span><h2 class="js-current-plan">Free</h2><p class="muted">Status and plan changes update after Stripe confirms them.</p></article>
        <article class="card balance-card"><span class="badge">Credits remaining</span><h2 class="js-credits">Loading credits</h2><p class="muted">One credit creates one listing package or buyer reply.</p></article>
        <article class="card balance-card"><span class="badge">Next refill</span><h2 class="js-next-refill">No refill scheduled</h2><p class="muted">Monthly plans refill on renewal.</p></article>
      </div>
      <div class="billing-toggle" role="tablist" aria-label="Billing options">
        <button class="is-active" type="button" data-billing-view="credits">Buy credits</button>
        <button type="button" data-billing-view="subscriptions">Subscribe monthly</button>
      </div>
      <div class="dashboard-grid route-grid billing-grid">
        <article class="card billing-panel" data-billing-panel="credits"><h3>One-time packs</h3><div class="billing-packs" id="billingPacks"><div class="skeleton">Loading packs...</div></div></article>
        <article class="card billing-panel hidden" data-billing-panel="subscriptions"><h3>Monthly plans</h3><div class="billing-packs" id="billingSubscriptions"><div class="skeleton">Loading plans...</div></div></article>
        <article class="card"><h3>Recent credit activity</h3><div id="billingTransactions"><div class="skeleton">Loading transactions...</div></div></article>
      </div>
    </section>
  `;
}

function hydrateAppRoute(me = accountState) {
  const route = appRouteName();
  if (route === "history") loadAppHistory();
  if (route === "billing") loadBilling(me);
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
      button.disabled = true;
      button.dataset.busy = "true";
      button.textContent = mode === "signup" ? "Creating..." : "Signing in...";
      try {
        await api(`/api/${mode}`, {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(new FormData(authForm)))
        });
        location.href = new URLSearchParams(location.search).get("next") || "/app";
      } catch (error) {
        const target = /password/i.test(error.message) ? "password" : "email";
        setFieldError(authForm, target, error.message);
      } finally {
        button.disabled = false;
        button.dataset.busy = "false";
        button.textContent = mode === "signup" ? "Create account" : "Sign in";
      }
    });
  }

  const resend = $("#resendVerification");
  if (resend) {
    resend.addEventListener("click", async () => {
      resend.disabled = true;
      let remaining = 60;
      const cooldown = $("#resendCooldown");
      const tick = setInterval(() => {
        remaining -= 1;
        if (cooldown) cooldown.textContent = remaining > 0 ? `You can resend again in ${remaining}s.` : "";
        if (remaining <= 0) {
          clearInterval(tick);
          resend.disabled = false;
        }
      }, 1000);
      try {
        await api("/api/resend-verification", { method: "POST" });
        toast("Verification link sent. Check your inbox.", "success");
      } catch (error) {
        toast(error.message, "error");
        clearInterval(tick);
        resend.disabled = false;
      }
    });
  }

  const forgot = $("#forgotPasswordForm");
  if (forgot) {
    forgot.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = forgot.querySelector("button[type=submit]");
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
      button.disabled = true;
      button.textContent = "Updating...";
      clearFieldErrors(reset);
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
  return `<button type="button" class="copy-button" data-copy="${escapeHtml(text || "")}">${label}</button>`;
}

function outputSection(title, html, copyText, copyLabel, valueLabel = "") {
  return `
    <section class="output-card result-card">
      <div class="result-card-head">
        <div>
          <h3>${title}</h3>
          ${valueLabel ? `<p class="value-label">${escapeHtml(valueLabel)}</p>` : ""}
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
  const creditNote = options.creditUsed ? `<p class="credit-feedback">${options.creditUsed} credit used</p>` : "";
  const demoCta = options.demo ? '<a class="button primary result-cta" href="/signup">Create free account and get 5 free credits</a>' : "";
  const inputText = options.inputText || data.input?.itemDetails || "";
  const momentumNote = options.momentumCount ? `<p class="momentum-feedback">${escapeHtml(momentumMessage(options.momentumCount))}</p>` : "";

  return `
    <section class="result-set">
      <div class="card result-summary">
        <div>
          <span class="badge">Step 3</span>
          <h2>Your listing is ready</h2>
          ${creditNote}
          ${momentumNote}
        </div>
        <div class="result-summary-actions">
          ${copyButton("Copy all", allCopy)}
          ${demoCta}
        </div>
      </div>
      ${transformationTemplate(inputText, data)}
      ${outputSection("Title", `<p class="result-title">${escapeHtml(data.title || "Vinted-ready listing title")}</p>`, data.title || "", "Copy title", "Optimised for Vinted search")}
      ${outputSection("Description", descriptionHtml(data.description), data.description || "", "Copy description", "High-conversion description")}
      ${outputSection("Keywords", `<p>${escapeHtml(keywords || "vinted, preloved, wardrobe clearout")}</p>`, keywords, "Copy keywords", "Search terms ready")}
      ${outputSection("Price guidance", `
        <div class="mini-cards">
          <span><strong>Fast</strong>${escapeHtml(price.fastSale || "-")}</span>
          <span><strong>Fair</strong>${escapeHtml(price.fairPrice || "-")}</span>
          <span><strong>Max</strong>${escapeHtml(price.maxPrice || "-")}</span>
        </div>
        <p>${escapeHtml(data.priceGuidance || "Check similar sold Vinted items before posting.")}</p>
      `, priceText, "Copy price", "Suggested competitive pricing")}
      ${outputSection("Photo checklist", listHtml(photoItems), photoItems.join("\n"), "Copy checklist", "Listing-photo checklist")}
      ${outputSection("Buyer reply", `<p>${escapeHtml(reply)}</p>`, reply, "Copy reply", "Natural seller reply")}
    </section>
  `;
}

function loadingTemplate(message) {
  return `
    <div class="loading-card">
      <div class="spinner" aria-hidden="true"></div>
      <strong>${escapeHtml(message)}</strong>
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
    const copy = event.target.closest("[data-copy]");
    if (!copy) return;
    await navigator.clipboard.writeText(copy.dataset.copy || "");
    const original = copy.textContent;
    copy.textContent = "Copied!";
    copy.setAttribute("aria-live", "polite");
    copySuccessCount += 1;
    toast(copySuccessCount >= 3 ? "You're ready to list this item" : "Copied — paste this into Vinted", "success");
    setTimeout(() => {
      copy.textContent = original;
      copy.removeAttribute("aria-live");
    }, 2000);
  });
}

function showPaywallModal() {
  $(".paywall-backdrop")?.remove();
  const packs = getCreditPacks();
  const plans = getSubscriptionPlans();
  const createdCount = Number(accountState.credits?.used || 0);
  const featuredPlan = plans.find((plan) => plan.featured) || plans[0];
  document.body.insertAdjacentHTML("beforeend", `
    <div class="paywall-backdrop" role="presentation">
      <section class="paywall-modal" role="dialog" aria-modal="true" aria-labelledby="paywallTitle">
        <button class="paywall-close" type="button" data-close-paywall aria-label="Close">x</button>
        <p class="badge">Credits</p>
        <h2 id="paywallTitle">You're out of credits</h2>
        <p class="paywall-proof">You've created ${createdCount} ${createdCount === 1 ? "listing" : "listings"} already.</p>
        <p class="muted">Most sellers subscribe to keep listing faster</p>
        ${featuredPlan ? `
          <article class="paywall-pack is-featured is-dominant subscription-paywall">
            <span>Recommended monthly</span>
            <strong>${escapeHtml(featuredPlan.name)} - ${Number(featuredPlan.credits || 0)} credits/month</strong>
            <p>${escapeHtml(formatMonthlyPrice(featuredPlan))}</p>
            <button type="button" class="pricing-buy" data-subscription-plan="${escapeHtml(featuredPlan.id)}">Subscribe monthly</button>
          </article>
        ` : ""}
        <div class="paywall-packs">
          ${packs.map((pack) => `
            <article class="paywall-pack ${pack.featured || Number(pack.credits) === 150 ? "is-featured" : ""}">
              <span>${escapeHtml(Number(pack.credits) === 150 ? "Best one-time pack" : pack.label || "")}</span>
              <strong>${Number(pack.credits || 0)} credits</strong>
              <p>${escapeHtml(formatPrice(pack.pricePence))}</p>
              <button type="button" class="pricing-buy" data-checkout-pack="${escapeHtml(pack.id)}">Buy credits</button>
            </article>
          `).join("")}
        </div>
      </section>
    </div>
  `);
  $(".paywall-modal button")?.focus();
}

function handleGenerationError(error) {
  if (error?.status === 402 || Number(error?.credits?.remaining) <= 0) {
    updateCreditsFromResponse(error);
    showPaywallModal();
  }
  toast(error.message, "error");
}

function installAppTools() {
  const notesForm = $("#notesForm");
  if (notesForm) {
    notesForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const out = $("#output");
      out.hidden = false;
      out.innerHTML = loadingTemplate("Generating your listing...");
      try {
        const formPayload = Object.fromEntries(new FormData(notesForm));
        const data = await api("/api/generate", { method: "POST", body: JSON.stringify(formPayload) });
        updateCreditsFromResponse(data);
        const momentumCount = recordGenerationMomentum();
        out.innerHTML = outputTemplate(data, { creditUsed: 1, inputText: formPayload.itemDetails, momentumCount });
        toast("Generated. 1 credit used.", "success");
      } catch (error) {
        out.hidden = true;
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
        updateCreditsFromResponse(data);
        const momentumCount = recordGenerationMomentum();
        out.innerHTML = outputTemplate(data, { creditUsed: 1, inputText: formData.get("notes") || "Photo upload", momentumCount });
        toast("Generated from photos. 1 credit used.", "success");
      } catch (error) {
        out.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
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
        updateCreditsFromResponse(data);
        const momentumCount = recordGenerationMomentum();
        out.innerHTML = outputTemplate(data, { creditUsed: 1, inputText: `${formData.get("title") || ""}\n${formData.get("description") || ""}`.trim(), momentumCount });
        toast("Scored listing. 1 credit used.", "success");
      } catch (error) {
        out.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
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
        updateCreditsFromResponse(data);
        out.innerHTML = `<section class="output-card reply-block"><h3>Suggested reply</h3><p>${escapeHtml(reply)}</p><button type="button" data-copy="${escapeHtml(reply)}">Copy reply</button></section>`;
        toast("Reply generated. 1 credit used.", "success");
      } catch (error) {
        out.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
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
      const input = $("#demoInput")?.value || "Black Zara dress size 10 worn twice good condition";
      out.innerHTML = loadingTemplate("Generating your demo listing...");
      try {
        const data = await api("/api/demo-generate", {
          method: "POST",
          body: JSON.stringify({ itemDetails: input })
        });
        out.innerHTML = outputTemplate(data, { demo: true, inputText: input });
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
  list.innerHTML = "<div class='skeleton'>Loading history...</div>";
  try {
    const data = await api(`/api/history?page=${page}&pageSize=20&q=${encodeURIComponent(query)}`);
    if (!data.history?.length) {
      list.innerHTML = '<div class="empty-state">Your generated listings will appear here</div>';
    } else {
      list.innerHTML = data.history.map((item) => `
        <article class="history-card" data-history-id="${escapeHtml(item.id)}">
          <strong>${escapeHtml(item.title || "Untitled listing")}</strong>
          <span>${Number(item.score || 0)}/100</span>
          <p>${escapeHtml((item.description || "No description saved.").slice(0, 180))}</p>
          <div class="history-meta">${escapeHtml(item.source === "photos" ? "from photos" : "from notes")}</div>
          <div class="history-actions">
            <button type="button" class="history-button" data-copy="${escapeHtml(item.title || "")}">Copy title</button>
            <button type="button" class="history-button" data-copy="${escapeHtml(item.description || "")}">Copy description</button>
          </div>
        </article>
      `).join("");
    }
    const pagination = data.pagination || { page: 1, totalPages: 1 };
    if (pager) {
      pager.innerHTML = `
        <button type="button" ${pagination.page <= 1 ? "disabled" : ""} data-history-page="${pagination.page - 1}">Previous</button>
        <span>Page ${pagination.page} of ${pagination.totalPages}</span>
        <button type="button" ${pagination.page >= pagination.totalPages ? "disabled" : ""} data-history-page="${pagination.page + 1}">Next</button>
      `;
      $$("[data-history-page]", pager).forEach((button) => {
        button.addEventListener("click", () => loadAppHistory(Number(button.dataset.historyPage)));
      });
    }
  } catch (error) {
    list.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

async function loadBilling(me = accountState) {
  const packs = $("#billingPacks");
  const subscriptions = $("#billingSubscriptions");
  const transactions = $("#billingTransactions");
  if (!packs || !subscriptions || !transactions) return;
  if (!me.user) {
    packs.innerHTML = '<div class="empty-state">Sign in to buy credits.</div>';
    subscriptions.innerHTML = '<div class="empty-state">Sign in to subscribe monthly.</div>';
    transactions.innerHTML = '<div class="empty-state">Transactions appear after your first credit purchase.</div>';
    return;
  }
  try {
    const data = await api("/api/billing");
    updateCreditsFromResponse(data);
    packs.innerHTML = (data.creditPacks || []).map((pack) => `
      <div class="billing-pack ${pack.featured ? "is-featured" : ""}">
        <strong>${escapeHtml(pack.name)}</strong>
        <span>${Number(pack.credits || 0)} credits - ${escapeHtml(formatPrice(pack.pricePence))}</span>
        <button type="button" class="pricing-buy" data-checkout-pack="${escapeHtml(pack.id)}">Buy ${escapeHtml(pack.name)}</button>
      </div>
    `).join("");
    const currentPlan = data.subscription?.plan || data.user?.subscriptionPlan || "free";
    const currentStatus = data.subscription?.status || data.user?.subscriptionStatus || "inactive";
    subscriptions.innerHTML = (data.subscriptionPlans || []).map((plan) => {
      const isCurrent = currentPlan === plan.id && ["active", "trialing", "past_due"].includes(String(currentStatus).toLowerCase());
      return `
        <div class="billing-pack subscription-pack ${plan.featured ? "is-featured" : ""}">
          <strong>${escapeHtml(plan.name)} ${plan.featured ? '<span class="mini-badge">Best value</span>' : ""}</strong>
          <span>${Number(plan.credits || 0)} credits/month - ${escapeHtml(formatMonthlyPrice(plan))}</span>
          <button type="button" class="pricing-buy" data-subscription-plan="${escapeHtml(plan.id)}" ${isCurrent ? "disabled" : ""}>${isCurrent ? "Current plan" : currentPlan === "free" ? "Subscribe" : "Switch plan"}</button>
        </div>
      `;
    }).join("");
    const rows = [
      ...(data.payments || []).map((item) => ({ label: `Payment ${item.reference}`, amount: `+${item.credits} credits`, date: item.createdAt })),
      ...(data.refills || []).map((item) => ({ label: `Subscription ${titleCasePlan(item.plan)} refill`, amount: `+${item.credits} credits`, date: item.createdAt })),
      ...(data.audit || []).map((item) => ({ label: item.reason, amount: `${item.delta > 0 ? "+" : ""}${item.delta}`, date: item.createdAt }))
    ].slice(0, 20);
    transactions.innerHTML = rows.length ? `
      <div class="transaction-list">
        ${rows.map((row) => `<div><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.amount)}</strong><time>${escapeHtml(row.date)}</time></div>`).join("")}
      </div>
    ` : '<div class="empty-state">No transactions yet. Credit purchases and adjustments appear here.</div>';
  } catch (error) {
    transactions.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
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
        updateCreditsFromResponse(data);
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
      return;
    }
    const button = event.target.closest("[data-checkout-pack]");
    if (!button) return;
    if (!accountState.user) {
      const packId = button.dataset.checkoutPack || "";
      location.href = `/signup?next=${encodeURIComponent(`/pricing#${packId}`)}`;
      return;
    }
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "Opening checkout...";
    try {
      const data = await api("/api/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ packId: button.dataset.checkoutPack })
      });
      location.href = data.url;
    } catch (error) {
      toast(error.message, "error");
      if (error.authUrl) {
        location.href = error.authUrl;
        return;
      }
      button.disabled = false;
      button.textContent = original;
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
    status.innerHTML = "<strong>Missing checkout session.</strong><span>Email support@listboost.uk if you completed payment.</span>";
    return;
  }
  let attempts = 0;
  const startingCredits = Number(accountState.credits?.remaining || 0);
  const timer = setInterval(async () => {
    attempts += 1;
    try {
      const data = await api(`/api/checkout/success?session_id=${encodeURIComponent(sessionId)}`);
      updateCreditsFromResponse(data);
      const delta = Math.max(0, Number(data.credits.remaining || 0) - startingCredits);
      if (!data.pending || delta > 0 || attempts >= 15) {
        clearInterval(timer);
        if (delta > 0 || !data.pending) {
          status.innerHTML = `<strong>Credits added.</strong><span>+${delta || 50} credits. Your balance is updated.</span>`;
          document.body.classList.add("confetti");
        } else {
          status.innerHTML = "<strong>Credits not appearing yet?</strong><span>Email support@listboost.uk with your purchase reference.</span>";
        }
      }
    } catch {
      if (attempts >= 15) {
        clearInterval(timer);
        status.innerHTML = "Payment received. If credits do not appear shortly, contact support@listboost.uk.";
      }
    }
  }, 2000);
}

bootstrap();
