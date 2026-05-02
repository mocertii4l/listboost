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
  const isPublic = ["/", "/pricing", "/example", "/privacy", "/terms"].includes(location.pathname);
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
}

function formatPrice(pence) {
  return `£${(Number(pence || 0) / 100).toFixed(2)}`;
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

function installAppNav() {
  $$(".app-nav a").forEach((link) => {
    link.classList.toggle("is-active", link.pathname === location.pathname || (location.pathname === "/app" && link.pathname === "/app/notes"));
  });
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
    forgot.addEventListener("submit", (event) => {
      event.preventDefault();
      const button = forgot.querySelector("button[type=submit]");
      button.disabled = true;
      button.textContent = "Sending...";
      setTimeout(() => {
        forgot.classList.add("hidden");
        $("#forgotSuccess")?.classList.remove("hidden");
      }, 350);
    });
  }

  const reset = $("#resetPasswordForm");
  if (reset) {
    const params = new URLSearchParams(location.search);
    const token = params.get("token") || "";
    if (token) reset.elements.token.value = token;
    if (location.search && !token) {
      $("#resetCard")?.classList.add("hidden");
      $("#resetError")?.classList.remove("hidden");
    }
    reset.addEventListener("submit", (event) => {
      event.preventDefault();
      const button = reset.querySelector("button[type=submit]");
      button.disabled = true;
      button.textContent = "Updating...";
      setFieldError(reset, "token", "Password reset links are not active for this preview. Request a fresh support reset.");
      button.disabled = false;
      button.textContent = "Update password";
    });
  }
}

function outputTemplate(data = {}) {
  const price = data.priceOptions || {};
  return `
    <section class="output-card"><h3>Title</h3><p>${data.title || "Generated title appears here."}</p><button data-copy="${data.title || ""}">Copy title</button></section>
    <section class="output-card"><h3>Description</h3><pre>${data.description || "Generated description appears here."}</pre><button data-copy="${data.description || ""}">Copy description</button></section>
    <section class="output-card"><h3>Keywords</h3><p>${(data.tags || data.searchTerms || []).join(", ") || "Keywords appear here."}</p></section>
    <section class="output-card"><h3>Pricing tiers</h3><div class="mini-cards"><span>Fast ${price.fastSale || "-"}</span><span>Fair ${price.fairPrice || "-"}</span><span>Max ${price.maxPrice || "-"}</span></div></section>
    <section class="output-card"><h3>Photo checklist</h3><ul>${(data.photoChecklist || ["Front", "Back", "Label", "Any flaws"]).map((x) => `<li>${x}</li>`).join("")}</ul></section>
    <section class="output-card safety-block"><h3>Safety check</h3><ul>${(data.missingDetails || ["Review the final listing before posting."]).map((x) => `<li>${x}</li>`).join("")}</ul></section>
  `;
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
    toast("Copied.", "success");
  });
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
