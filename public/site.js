const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const toastRegion = $("#toastRegion");

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

function formatPrice(pence) {
  return `£${(Number(pence || 0) / 100).toFixed(2)}`;
}

function renderPacks(packs) {
  const grid = $("#packGrid");
  if (!grid || !Array.isArray(packs)) return;
  grid.innerHTML = packs.map((pack) => `
    <article class="card price-card ${pack.featured ? "featured" : ""}">
      <span class="badge">${pack.label}</span>
      <h3>${pack.name}</h3>
      <p class="price"><strong>${pack.credits}</strong><span>credits</span></p>
      <p class="muted">${formatPrice(pack.pricePence)} one-time</p>
      <p>${pack.description}</p>
      <button class="button ${pack.featured ? "primary" : "secondary"}" type="button" data-checkout-pack="${pack.id}">Buy ${pack.name}</button>
    </article>
  `).join("");
}

async function bootstrap() {
  installTheme();
  try {
    const me = await api("/api/me");
    renderPacks(me.creditPacks || []);
    $$(".js-email").forEach((node) => { node.textContent = me.user?.email || "Signed out"; });
    $$(".js-credits").forEach((node) => { node.textContent = `${me.credits?.remaining || 0} credits`; });
    document.body.classList.toggle("signed-in", Boolean(me.user));
  } catch {
    toast("Could not load account state.", "error");
  }
  installForms();
  installAppTools();
  installCheckoutButtons();
  installCheckoutSuccess();
  installFaq();
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
      button.disabled = true;
      button.textContent = mode === "signup" ? "Creating..." : "Signing in...";
      try {
        await api(`/api/${mode}`, {
          method: "POST",
          body: JSON.stringify(Object.fromEntries(new FormData(authForm)))
        });
        location.href = new URLSearchParams(location.search).get("next") || "/app";
      } catch (error) {
        toast(error.message, "error");
      } finally {
        button.disabled = false;
        button.textContent = mode === "signup" ? "Create account" : "Sign in";
      }
    });
  }

  const resend = $("#resendVerification");
  if (resend) {
    resend.addEventListener("click", async () => {
      resend.disabled = true;
      try {
        await api("/api/resend-verification", { method: "POST" });
        toast("Verification link sent. Check your inbox.", "success");
      } catch (error) {
        toast(error.message, "error");
      } finally {
        resend.disabled = false;
      }
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
        const data = await api("/api/generate", {
          method: "POST",
          body: JSON.stringify({
            category: "Clothing",
            tone: "friendly",
            sellerMode: "clearout",
            negotiationGoal: "friendly",
            size: "UK 10",
            condition: "Good condition",
            itemDetails: "Black Zara midi dress, UK 10, worn once, no obvious flaws, good for work or evening",
            buyerQuestion: ""
          })
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

function installCheckoutSuccess() {
  const status = $("#checkoutStatus");
  if (!status) return;
  let attempts = 0;
  const timer = setInterval(async () => {
    attempts += 1;
    try {
      const me = await api("/api/me");
      $(".js-credits").textContent = `${me.credits.remaining} credits`;
      if (attempts >= 2) {
        clearInterval(timer);
        status.innerHTML = "<strong>Credits added.</strong><span>Your balance is updated.</span>";
        document.body.classList.add("confetti");
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
