const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const toastRegion = $("#toastRegion");
let accountState = { user: null, credits: null };

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
    Object.assign(error, data);
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
    document.body.prepend(header);
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

function renderPacks(packs) {
  const grid = $("#packGrid");
  if (!grid || !Array.isArray(packs)) return;
  grid.innerHTML = packs.map((pack) => `
    <article class="pricing-card ${pack.featured ? "is-featured featured" : ""}" id="${pack.id}">
      <span class="badge">${pack.label}</span>
      <h3>${pack.name}</h3>
      <p class="pricing-price"><strong>${pack.credits}</strong><span>credits</span></p>
      <p class="pricing-meta">${formatPrice(pack.pricePence)} one-time</p>
      <p class="pricing-copy">${pack.description}</p>
      <ul class="pricing-compare"><li>One credit per generated listing</li><li>Saved history and copy tools</li><li>Buyer replies and pricing guidance</li></ul>
      <button class="pricing-buy" type="button" data-checkout-pack="${pack.id}">Buy ${pack.name}</button>
    </article>
  `).join("");
}

async function bootstrap() {
  installPublicShell();
  renderAppRoute();
  installTheme();
  installPasswordToggles();
  try {
    const me = await api("/api/me");
    accountState = me;
    renderPacks(me.creditPacks || []);
    $$(".js-email").forEach((node) => { node.textContent = me.user?.email || "Signed out"; });
    $$(".js-credits").forEach((node) => { node.textContent = `${me.credits?.remaining || 0} credits`; });
    $$(".low-credit-cta").forEach((node) => node.classList.toggle("hidden", Boolean(me.user) && Number(me.credits?.remaining || 0) >= 10));
    document.body.classList.toggle("signed-in", Boolean(me.user));
    document.body.classList.toggle("signed-out", !me.user);
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
  ["photo", "Photo", "Upload item photos and generate from visible details.", "/app/photo"],
  ["score", "Score", "Check why an existing listing is not selling.", "/app/score"],
  ["replies", "Replies", "Write buyer replies for offers and questions.", "/app/replies"],
  ["history", "History", "Search and reopen saved listing packages.", "/app/history"],
  ["billing", "Billing", "View credits, packs and recent transactions.", "/app/billing"]
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

function dashboardRouteTemplate() {
  return `
    <section data-route="dashboard">
      ${routeHeader("Dashboard", "Your ListBoost workspace", "Choose the workflow you need. Your credits and history stay with your account.")}
      <div class="dashboard-grid route-grid">
        <article class="card balance-card"><span class="badge">Balance</span><h2 class="js-credits">Loading credits</h2><p class="muted js-email">Loading account</p><a class="button primary" href="/app/notes">Generate listing</a></article>
        ${appFeatureTiles.map(([, title, copy, href]) => `<a class="card feature-tile" href="${href}"><h3>${title}</h3><p>${copy}</p></a>`).join("")}
      </div>
    </section>
  `;
}

function notesRouteTemplate() {
  return `
    <section class="tool-layout" data-route="notes">
      <form class="card sticky-form" id="notesForm">
        <span class="badge">Generator</span>
        <h1>Generate from notes</h1>
        <label>Category<select name="category"><option>Clothing</option><option>Shoes</option><option>Bags</option><option>Accessories</option></select></label>
        <label>Tone<select name="tone"><option value="friendly">Friendly</option><option value="clean">Clean</option><option value="premium">Premium</option><option value="quick-sale">Quick sale</option></select></label>
        <label>Seller mode<select name="sellerMode"><option value="clearout">Quick clear-out</option><option value="profit">Profit reseller</option><option value="premium">Premium item</option></select></label>
        <label>Reply style<select name="negotiationGoal"><option value="friendly">Friendly</option><option value="polite-firm">Firm</option><option value="counter">Negotiation</option></select></label>
        <label>Size<input name="size" placeholder="UK 10, M, EU 39" /></label>
        <label>Condition<input name="condition" placeholder="Good condition, worn once" /></label>
        <label>Item notes<textarea name="itemDetails" required placeholder="Brand, item type, colour, size, condition, flaws, postage..."></textarea></label>
        <label>Buyer message<textarea name="buyerQuestion" placeholder="Optional: paste buyer question"></textarea></label>
        <button class="button primary" type="submit">Generate listing</button>
      </form>
      <section class="output-stack" id="output"><div class="empty-state">Your listing package appears here with copy buttons.</div></section>
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
        <label>Item context<textarea name="itemDetails" required placeholder="Item, condition, price, postage options..."></textarea></label>
        <label>Buyer message<textarea name="buyerQuestion" required placeholder="Paste the buyer's offer or question..."></textarea></label>
        <button class="button primary" type="submit">Write reply</button>
      </form>
      <section class="output-stack" id="replyOutput"><div class="empty-state">A clear buyer reply appears here.</div></section>
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
      ${routeHeader("Billing", "Credits and transactions", "View your balance, buy more credits and audit recent credit changes.")}
      <div class="dashboard-grid route-grid">
        <article class="card balance-card"><span class="badge">Balance</span><h2 class="js-credits">Loading credits</h2><p class="muted">Buy more when your balance drops below 10.</p></article>
        <article class="card"><h3>Credit packs</h3><div class="billing-packs" id="billingPacks"><div class="skeleton">Loading packs...</div></div></article>
        <article class="card"><h3>Recent transactions</h3><div id="billingTransactions"><div class="skeleton">Loading transactions...</div></div></article>
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
    button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
    button.addEventListener("click", () => {
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
      button.innerHTML = showing
        ? '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>'
        : '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m3 3 18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.5 5.4A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a16.4 16.4 0 0 1-3.1 4.1"/><path d="M6.6 6.6C3.6 8.5 2 12 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.8-.8"/></svg>';
    });
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

function outputTemplate(data = {}) {
  const price = data.priceOptions || {};
  return `
    <section class="output-card"><h3>Title</h3><p>${escapeHtml(data.title || "Generated title appears here.")}</p><button type="button" data-copy="${escapeHtml(data.title || "")}">Copy title</button></section>
    <section class="output-card"><h3>Description</h3><pre>${escapeHtml(data.description || "Generated description appears here.")}</pre><button type="button" data-copy="${escapeHtml(data.description || "")}">Copy description</button></section>
    <section class="output-card"><h3>Keywords</h3><p>${escapeHtml((data.tags || data.searchTerms || []).join(", ") || "Keywords appear here.")}</p></section>
    <section class="output-card"><h3>Pricing tiers</h3><div class="mini-cards"><span>Fast ${price.fastSale || "-"}</span><span>Fair ${price.fairPrice || "-"}</span><span>Max ${price.maxPrice || "-"}</span></div></section>
    <section class="output-card"><h3>Photo checklist</h3><ul>${(data.photoChecklist || ["Front", "Back", "Label", "Any flaws"]).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></section>
    <section class="output-card safety-block"><h3>Safety check</h3><ul>${(data.missingDetails || ["Review the final listing before posting."]).map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul></section>
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

function installAppTools() {
  const notesForm = $("#notesForm");
  if (notesForm) {
    notesForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const out = $("#output");
      out.innerHTML = "<div class='skeleton'>Generating listing...</div>";
      try {
        const data = await api("/api/generate", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(notesForm))) });
        out.innerHTML = outputTemplate(data);
        toast("Listing generated and saved.", "success");
      } catch (error) {
        out.innerHTML = "";
        toast(error.message, "error");
      }
    });
  }

  const photoRouteForm = $("#photoRouteForm");
  if (photoRouteForm) {
    photoRouteForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const out = $("#photoRouteOutput");
      out.innerHTML = "<div class='skeleton'>Reading photos...</div>";
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
        out.innerHTML = outputTemplate(data);
        toast("Generated from photos.", "success");
      } catch (error) {
        out.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
        toast(error.message, "error");
      }
    });
  }

  const scoreForm = $("#scoreForm");
  if (scoreForm) {
    scoreForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const out = $("#scoreOutputPanel");
      out.innerHTML = "<div class='skeleton'>Scoring listing...</div>";
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
        out.innerHTML = outputTemplate(data);
        toast("Scored listing.", "success");
      } catch (error) {
        out.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
        toast(error.message, "error");
      }
    });
  }

  const replyForm = $("#replyForm");
  if (replyForm) {
    replyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const out = $("#replyOutput");
      out.innerHTML = "<div class='skeleton'>Writing reply...</div>";
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
        out.innerHTML = `<section class="output-card reply-block"><h3>Suggested reply</h3><p>${escapeHtml(reply)}</p><button type="button" data-copy="${escapeHtml(reply)}">Copy reply</button></section>`;
        toast("Reply generated.", "success");
      } catch (error) {
        out.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
        toast(error.message, "error");
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
      out.innerHTML = "<div class='skeleton'>Running real demo...</div>";
      try {
        const data = await api("/api/demo-generate", {
          method: "POST",
          body: JSON.stringify({})
        });
        out.innerHTML = outputTemplate(data);
      } catch (error) {
        out.innerHTML = `<p class="error">${error.message}</p>`;
      }
    });
  }

  document.addEventListener("click", async (event) => {
    const copy = event.target.closest("[data-copy]");
    if (!copy) return;
    await navigator.clipboard.writeText(copy.dataset.copy || "");
    const original = copy.textContent;
    copy.textContent = "Copied!";
    copy.setAttribute("aria-live", "polite");
    toast("Copied.", "success");
    setTimeout(() => {
      copy.textContent = original;
      copy.removeAttribute("aria-live");
    }, 2000);
  });
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
      list.innerHTML = '<div class="empty-state">No saved listings yet. Generate a listing to build your history.</div>';
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
  const transactions = $("#billingTransactions");
  if (!packs || !transactions) return;
  if (!me.user) {
    packs.innerHTML = '<div class="empty-state">Sign in to buy credits.</div>';
    transactions.innerHTML = '<div class="empty-state">Transactions appear after your first credit purchase.</div>';
    return;
  }
  try {
    const data = await api("/api/billing");
    packs.innerHTML = (data.creditPacks || []).map((pack) => `
      <div class="billing-pack ${pack.featured ? "is-featured" : ""}">
        <strong>${escapeHtml(pack.name)}</strong>
        <span>${Number(pack.credits || 0)} credits · ${escapeHtml(formatPrice(pack.pricePence))}</span>
        <button type="button" class="pricing-buy" data-checkout-pack="${escapeHtml(pack.id)}">Buy ${escapeHtml(pack.name)}</button>
      </div>
    `).join("");
    const rows = [
      ...(data.payments || []).map((item) => ({ label: `Payment ${item.reference}`, amount: `+${item.credits} credits`, date: item.createdAt })),
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
  let attempts = 0;
  const timer = setInterval(async () => {
    attempts += 1;
    try {
      const me = await api("/api/me");
      $(".js-credits").textContent = `${me.credits.remaining} credits`;
      if (!accountState.credits) accountState.credits = me.credits;
      const delta = Math.max(0, Number(me.credits.remaining || 0) - Number(accountState.credits.remaining || 0));
      if (!me.pending || delta > 0 || attempts >= 15) {
        clearInterval(timer);
        if (delta > 0 || !me.pending) {
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
