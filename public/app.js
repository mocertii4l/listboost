const form = document.querySelector("#listingForm");
const generateButton = document.querySelector("#generateButton");
const exampleButton = document.querySelector("#exampleButton");
const formNote = document.querySelector("#formNote");
const emptyState = document.querySelector("#emptyState");
const results = document.querySelector("#results");
const providerStatus = document.querySelector("#providerStatus");
const creditStatus = document.querySelector("#creditStatus");
const accountStatus = document.querySelector("#accountStatus");
const upgradeButton = document.querySelector("#upgradeButton");
const packStatus = document.querySelector("#packStatus");
const authForm = document.querySelector("#authForm");
const authNote = document.querySelector("#authNote");
const signupButton = document.querySelector("#signupButton");
const loginButton = document.querySelector("#loginButton");
const logoutButton = document.querySelector("#logoutButton");
const templateGrid = document.querySelector("#templateGrid");
const historyList = document.querySelector("#historyList");
const tabNotes = document.querySelector("#tabNotes");
const tabPhotos = document.querySelector("#tabPhotos");
const verifyBanner = document.querySelector("#verifyBanner");
const verifyBannerText = document.querySelector("#verifyBannerText");
const resendVerifyButton = document.querySelector("#resendVerifyButton");
const photoForm = document.querySelector("#photoForm");
const photoUploadButton = document.querySelector("#photoUploadButton");
const photoInput = document.querySelector("#photoInput");
const photoPreviews = document.querySelector("#photoPreviews");
const photoNote = document.querySelector("#photoNote");
const photoFormNote = document.querySelector("#photoFormNote");
const photoGenerateButton = document.querySelector("#photoGenerateButton");
const photoDropzone = document.querySelector("#photoDropzone");
const extractedBlock = document.querySelector("#extractedBlock");
const extractedOutput = document.querySelector("#extractedOutput");
let latestCredits = null;
let currentUser = null;
let verificationState = { required: true, verified: false };
const MAX_PHOTOS = 4;
const MAX_PHOTO_DIM = 1280;
const MAX_PHOTO_BYTES = 1_400_000;
let photos = [];

function syncVerificationBanner() {
  const blocked = currentUser && verificationState.required && !verificationState.verified;
  verifyBanner.classList.toggle("hidden", !blocked && !verifyBanner.dataset.flash);
  if (blocked) {
    verifyBannerText.textContent = `Verify ${currentUser.email} to start generating listings. Check your inbox.`;
    resendVerifyButton.classList.remove("hidden");
    verifyBanner.classList.remove("is-success");
  }
}

function flashVerifyBanner(message, success = false) {
  verifyBanner.classList.remove("hidden");
  verifyBanner.classList.toggle("is-success", success);
  verifyBannerText.textContent = message;
  resendVerifyButton.classList.toggle("hidden", success);
  verifyBanner.dataset.flash = "1";
  setTimeout(() => {
    delete verifyBanner.dataset.flash;
    syncVerificationBanner();
  }, 6000);
}

const outputs = {
  title: document.querySelector("#titleOutput"),
  description: document.querySelector("#descriptionOutput"),
  score: document.querySelector("#scoreOutput"),
  scoreSummary: document.querySelector("#scoreSummaryOutput"),
  scoreImprovements: document.querySelector("#scoreImprovementsOutput"),
  priceOptions: document.querySelector("#priceOptionsOutput"),
  buyerQuestionReply: document.querySelector("#buyerQuestionReplyOutput"),
  buyerReplyBlock: document.querySelector("#buyerReplyBlock"),
  tags: document.querySelector("#tagsOutput"),
  searchTerms: document.querySelector("#searchTermsOutput"),
  price: document.querySelector("#priceOutput"),
  photos: document.querySelector("#photoOutput"),
  replies: document.querySelector("#repliesOutput"),
  missing: document.querySelector("#missingOutput")
};

const example = {
  category: "Shoes",
  size: "UK 6",
  condition: "Good condition, light creasing",
  itemDetails: "Nike Air Force 1 white trainers, worn a few times, soles still good, no box, can post next day",
  buyerQuestion: "Would you take GBP 28 and can you post tomorrow?"
};

const templates = [
  ["Thanks for favouriting", "Hi lovely, thanks for favouriting. I can post quickly if you decide to buy today."],
  ["Bundle discount", "Happy to do a bundle discount if you are interested in more than one item."],
  ["Counter offer", "Thanks for the offer. I can meet you at GBP 12 as it is in lovely condition and I can post quickly."],
  ["Still available", "Yes, this is still available and ready to post."],
  ["Can post today", "Yes, I can post today if payment goes through soon."],
  ["Any flaws?", "No obvious flaws that I can see, but I have shown the condition clearly in the photos."],
  ["Reserve item", "I can reserve for a short time, but please let me know when you are ready to buy."],
  ["After purchase", "Thank you for buying. I will get this packed and posted as soon as possible."],
  ["Review request", "Thanks again for buying. If everything is okay, I would really appreciate a review."]
];

function setLoading(isLoading) {
  const noCredits = latestCredits && latestCredits.remaining <= 0;
  const verifyBlocked = currentUser && verificationState.required && !verificationState.verified;
  generateButton.disabled = isLoading || !currentUser || noCredits || verifyBlocked;
  generateButton.textContent = isLoading ? "Boosting..." : "Boost listing";
  photoGenerateButton.disabled = isLoading || !currentUser || noCredits || verifyBlocked || photos.length === 0;
  photoGenerateButton.textContent = isLoading ? "Reading photos..." : "Generate from photos";
}

function updateCredits(credits) {
  if (!credits) return;
  latestCredits = credits;
  creditStatus.textContent = `${credits.remaining} credits left`;
  if (packStatus) {
    const price = Number(credits.packPricePence || 500) / 100;
    packStatus.textContent = `GBP ${price} one-time top up`;
  }
  generateButton.disabled = !currentUser || credits.remaining <= 0;
  upgradeButton.disabled = !currentUser;
  if (!currentUser) {
    formNote.textContent = "Create an account or sign in to start boosting listings.";
  } else if (credits.remaining <= 0) {
    formNote.textContent = `No credits left. Get ${credits.packSize || 50} more credits to keep boosting listings.`;
  }
  updatePhotoFormState();
}

function updateAccount(user) {
  currentUser = user || null;
  accountStatus.textContent = currentUser ? currentUser.email : "Not signed in";
  logoutButton.classList.toggle("hidden", !currentUser);
  authForm.classList.toggle("signed-in", Boolean(currentUser));
  if (currentUser) {
    authNote.textContent = "Signed in. Your credits are saved to this account.";
  }
  setLoading(false);
}

function renderList(element, items) {
  element.innerHTML = "";
  const safeItems = Array.isArray(items) && items.length ? items : ["Nothing extra needed."];
  for (const item of safeItems) {
    const li = document.createElement("li");
    li.textContent = item;
    element.append(li);
  }
}

function renderTags(items) {
  renderPills(outputs.tags, items, "resale");
}

function renderPills(element, items, fallback) {
  element.innerHTML = "";
  const safeItems = Array.isArray(items) && items.length ? items : [fallback];
  for (const item of safeItems) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = item;
    element.append(tag);
  }
}

function renderPriceOptions(priceOptions = {}) {
  const rows = [
    ["Fast sale", priceOptions.fastSale, true],
    ["Fair price", priceOptions.fairPrice, true],
    ["Maximum", priceOptions.maxPrice, false],
    ["Lowest offer", priceOptions.lowestOffer, false],
    ["Start price", priceOptions.startPrice, false],
    ["Counter offer", priceOptions.autoCounterOffer, false],
    ["Bundle", priceOptions.bundleDiscount, false]
  ];

  outputs.priceOptions.innerHTML = "";
  for (const [label, value, highlight] of rows) {
    const row = document.createElement("div");
    row.className = "price-row" + (highlight && value ? " is-highlight" : "");
    row.innerHTML = `<span>${label}</span><strong>${value || "Add more details"}</strong>`;
    outputs.priceOptions.append(row);
  }
}

function renderExtracted(extracted) {
  if (!extracted || typeof extracted !== "object") {
    extractedBlock.classList.add("hidden");
    return;
  }

  const rows = [
    ["Item type", extracted.itemType],
    ["Colour", extracted.color],
    ["Brand", extracted.brand],
    ["Size label", extracted.sizeLabel],
    ["Condition", extracted.condition],
    ["Flaws", Array.isArray(extracted.flaws) ? extracted.flaws.filter(Boolean).join(", ") : extracted.flaws],
    ["Style", Array.isArray(extracted.styleKeywords) ? extracted.styleKeywords.filter(Boolean).join(", ") : extracted.styleKeywords]
  ].filter(([, value]) => value && String(value).trim());

  if (!rows.length) {
    extractedBlock.classList.add("hidden");
    return;
  }

  extractedOutput.innerHTML = "";
  for (const [label, value] of rows) {
    const wrap = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    wrap.append(dt, dd);
    extractedOutput.append(wrap);
  }
  extractedBlock.classList.remove("hidden");
}

function showResults(data) {
  emptyState.classList.add("hidden");
  results.classList.remove("hidden");
  const score = data.listingScore || {};
  const scoreValue = Math.max(0, Math.min(100, Number(score.score || 0)));
  outputs.score.textContent = `${scoreValue}/100`;
  const meter = outputs.score.parentElement;
  if (meter && meter.classList.contains("score-meter")) {
    meter.style.setProperty("--score", String(scoreValue));
  }
  outputs.scoreSummary.textContent = score.summary || "Add more details to score this listing.";
  renderList(outputs.scoreImprovements, score.improvements);
  renderPriceOptions(data.priceOptions);
  outputs.title.textContent = data.title || "Untitled listing";
  outputs.description.textContent = data.description || "";
  outputs.buyerQuestionReply.textContent = data.buyerQuestionReply || "";
  outputs.buyerReplyBlock.classList.toggle("hidden", !data.buyerQuestionReply);
  outputs.price.textContent = data.priceGuidance || "Compare similar sold listings before choosing a price.";
  renderTags(data.tags);
  renderPills(outputs.searchTerms, data.searchTerms, "vinted search");
  renderList(outputs.photos, data.photoChecklist);
  renderList(outputs.replies, data.buyerReplies);
  renderList(outputs.missing, data.missingDetails);
  renderExtracted(data.extractedFromPhotos);

  providerStatus.textContent = data.provider === "demo"
    ? "Demo mode"
    : `${data.provider} connected`;
  updateCredits(data.credits);
  loadHistory();
}

async function generateListing(event) {
  event.preventDefault();
  if (!currentUser) {
    formNote.textContent = "Sign in or create an account first.";
    return;
  }
  setLoading(true);
  formNote.textContent = "Improving your listing...";

  const formData = new FormData(form);
  const payload = {
    category: formData.get("category"),
    tone: formData.get("tone"),
    sellerMode: formData.get("sellerMode"),
    negotiationGoal: formData.get("negotiationGoal"),
    size: formData.get("size"),
    condition: formData.get("condition"),
    itemDetails: formData.get("itemDetails"),
    buyerQuestion: formData.get("buyerQuestion")
  };

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok) {
      updateCredits(data.credits);
      throw new Error(data.error || "Something went wrong.");
    }

    showResults(data);
    formNote.textContent = "Done. You can copy each section into your marketplace listing.";
  } catch (error) {
    formNote.textContent = error.message;
  } finally {
    setLoading(false);
  }
}

function loadExample() {
  document.querySelector("#category").value = example.category;
  document.querySelector("#size").value = example.size;
  document.querySelector("#condition").value = example.condition;
  document.querySelector("#itemDetails").value = example.itemDetails;
  document.querySelector("#buyerQuestion").value = example.buyerQuestion;
}

async function loadAccount() {
  try {
    const response = await fetch("/api/me");
    const data = await response.json();
    verificationState = {
      required: data.verificationRequired !== false,
      verified: Boolean(data.emailVerified)
    };
    updateAccount(data.user);
    updateCredits(data.credits);
    syncVerificationBanner();
    loadHistory();
  } catch {
    creditStatus.textContent = "Credits unavailable";
  }
}

async function safeJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || `Request failed (${response.status})` };
  }
}

async function resendVerification() {
  resendVerifyButton.disabled = true;
  try {
    const response = await fetch("/api/resend-verification", {
      method: "POST",
      headers: { "content-type": "application/json", "accept": "application/json" }
    });
    const data = await safeJson(response);
    if (!response.ok) throw new Error(data.error || "Could not resend the verification email.");
    if (data.alreadyVerified) {
      verificationState.verified = true;
      flashVerifyBanner("Email already verified.", true);
      setLoading(false);
    } else {
      flashVerifyBanner("Verification link resent. Check your email or dev console.", true);
    }
  } catch (error) {
    flashVerifyBanner(error.message);
  } finally {
    resendVerifyButton.disabled = false;
  }
}

async function loadHistory() {
  if (!currentUser) {
    historyList.innerHTML = '<p class="form-note">Sign in and generate a listing to see history.</p>';
    return;
  }

  try {
    const response = await fetch("/api/history");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load history.");
    renderHistory(data.history || []);
  } catch (error) {
    historyList.innerHTML = `<p class="form-note">${error.message}</p>`;
  }
}

function escapeHistoryText(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function copyToClipboard(text, button) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    if (button) {
      const original = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => {
        button.textContent = original;
      }, 900);
    }
  } catch {
    formNote.textContent = "Could not copy to clipboard.";
  }
}

async function openHistoryItem(id, button) {
  if (button) button.disabled = true;
  formNote.textContent = "Loading saved listing...";
  try {
    const response = await fetch(`/api/history/${encodeURIComponent(id)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load saved listing.");
    showResults({ ...data.result, provider: "saved" });
    formNote.textContent = "Loaded saved listing — no credit used.";
  } catch (error) {
    formNote.textContent = error.message;
  } finally {
    if (button) button.disabled = false;
  }
}

async function regenerateHistoryItem(id, button) {
  if (!currentUser) {
    formNote.textContent = "Sign in first.";
    return;
  }
  if (verificationState.required && !verificationState.verified) {
    formNote.textContent = "Verify your email before regenerating.";
    return;
  }
  if (!confirm("Regenerate this listing? This uses 1 credit.")) return;

  if (button) button.disabled = true;
  formNote.textContent = "Regenerating with 1 credit...";
  try {
    const response = await fetch(`/api/regenerate/${encodeURIComponent(id)}`, { method: "POST" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not regenerate.");
    showResults(data);
    formNote.textContent = "Regenerated. New version saved to your history.";
  } catch (error) {
    formNote.textContent = error.message;
    loadAccount();
  } finally {
    if (button) button.disabled = false;
  }
}

async function deleteHistoryItem(id, card, button) {
  if (!confirm("Delete this saved listing? This cannot be undone.")) return;
  if (button) button.disabled = true;
  try {
    const response = await fetch(`/api/history/${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not delete.");
    if (card) card.remove();
    if (!historyList.querySelector(".history-card")) {
      historyList.innerHTML = '<p class="form-note">No saved listings yet.</p>';
    }
    formNote.textContent = "Saved listing deleted.";
  } catch (error) {
    formNote.textContent = error.message;
    if (button) button.disabled = false;
  }
}

async function copyHistoryField(id, field, button) {
  if (button) button.disabled = true;
  try {
    const response = await fetch(`/api/history/${encodeURIComponent(id)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load saved listing.");
    const text = field === "title" ? (data.result.title || "") : (data.result.description || "");
    if (!text) {
      formNote.textContent = `No ${field} saved on this item.`;
      return;
    }
    await copyToClipboard(text, button);
  } catch (error) {
    formNote.textContent = error.message;
  } finally {
    if (button) button.disabled = false;
  }
}

function renderHistory(history) {
  historyList.innerHTML = "";
  if (!history.length) {
    historyList.innerHTML = '<p class="form-note">No saved listings yet.</p>';
    return;
  }

  for (const item of history) {
    const card = document.createElement("article");
    card.className = "history-card";
    card.dataset.historyId = item.id;
    const titleSafe = escapeHistoryText(item.title || "Untitled listing");
    const descSafe = escapeHistoryText(item.description ? item.description.slice(0, 140) : "No description saved.");
    const sourceLabel = item.source === "photos" ? "from photos" : "from notes";
    card.innerHTML = `
      <strong>${titleSafe}</strong>
      <span>${item.score || 0}/100</span>
      <p>${descSafe}</p>
      <div class="history-meta">${sourceLabel}</div>
      <div class="history-actions">
        <button type="button" class="history-button" data-action="open">Open</button>
        <button type="button" class="history-button" data-action="copy-title">Copy title</button>
        <button type="button" class="history-button" data-action="copy-desc">Copy description</button>
        <button type="button" class="history-button history-regen" data-action="regen" ${item.canRegenerate ? "" : "disabled"} title="${item.canRegenerate ? "Use 1 credit to regenerate" : "This older listing cannot be regenerated"}">Regenerate</button>
        <button type="button" class="history-button history-delete" data-action="delete">Delete</button>
      </div>
    `;
    card.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const action = button.dataset.action;
      if (action === "open") openHistoryItem(item.id, button);
      else if (action === "copy-title") copyHistoryField(item.id, "title", button);
      else if (action === "copy-desc") copyHistoryField(item.id, "description", button);
      else if (action === "regen") {
        if (!item.canRegenerate) {
          formNote.textContent = "This older listing cannot be regenerated.";
          return;
        }
        regenerateHistoryItem(item.id, button);
      } else if (action === "delete") deleteHistoryItem(item.id, card, button);
    });
    historyList.append(card);
  }
}

function renderTemplates() {
  templateGrid.innerHTML = "";
  for (const [title, body] of templates) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "template-card";
    button.innerHTML = `<strong>${title}</strong><span>${body}</span>`;
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(body);
      authNote.textContent = `Copied: ${title}`;
    });
    templateGrid.append(button);
  }
}

async function buyCredits() {
  if (!currentUser) {
    formNote.textContent = "Sign in before buying credits.";
    return;
  }
  upgradeButton.disabled = true;
  formNote.textContent = "Opening checkout...";

  try {
    const response = await fetch("/api/create-checkout-session", { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not open checkout.");
    }
    window.location.href = data.url;
  } catch (error) {
    formNote.textContent = error.message;
    upgradeButton.disabled = false;
  }
}

async function submitAuth(mode) {
  const formData = new FormData(authForm);
  const payload = {
    email: formData.get("email"),
    password: formData.get("password")
  };

  authNote.textContent = mode === "signup" ? "Creating account..." : "Signing in...";
  loginButton.disabled = true;
  signupButton.disabled = true;

  try {
    const response = await fetch(`/api/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not authenticate.");
    }
    if ("emailVerified" in data || "verificationRequired" in data) {
      verificationState = {
        required: data.verificationRequired !== false,
        verified: Boolean(data.emailVerified)
      };
    }
    updateAccount(data.user);
    updateCredits(data.credits);
    syncVerificationBanner();
    authNote.textContent = mode === "signup"
      ? (verificationState.required && !verificationState.verified
        ? "Account created. Verify your email to start generating."
        : "Account created. Your free credits are ready.")
      : "Signed in. Your credits are loaded.";
  } catch (error) {
    authNote.textContent = error.message;
  } finally {
    loginButton.disabled = false;
    signupButton.disabled = false;
  }
}

async function logout() {
  await fetch("/api/logout", { method: "POST" });
  currentUser = null;
  latestCredits = null;
  updateAccount(null);
  await loadAccount();
  authNote.textContent = "Logged out.";
}

async function confirmCheckout() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");
  const status = params.get("checkout");
  const verify = params.get("verify");

  if (verify === "success") {
    verificationState.verified = true;
    flashVerifyBanner("Email verified. You can start generating listings.", true);
    setLoading(false);
  } else if (verify === "invalid") {
    flashVerifyBanner("Verification link is invalid or expired. Resend a new one.");
  } else if (verify === "missing") {
    flashVerifyBanner("Verification link was missing a token.");
  }

  if (status === "cancelled") {
    formNote.textContent = "Checkout cancelled. Your credits were not changed.";
    window.history.replaceState({}, "", "/");
    return;
  }

  if (status === "success" && sessionId) {
    formNote.textContent = "Confirming payment with Stripe...";
    let pending = true;
    let attempts = 0;
    while (pending && attempts < 6) {
      attempts += 1;
      try {
        const response = await fetch(`/api/checkout/success?session_id=${encodeURIComponent(sessionId)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not confirm payment.");
        updateCredits(data.credits);
        if (data.pending) {
          formNote.textContent = "Payment received. Waiting for Stripe to confirm credits...";
          await new Promise((r) => setTimeout(r, 1500));
        } else {
          pending = false;
          formNote.textContent = "Payment confirmed. Credits added.";
        }
      } catch (error) {
        formNote.textContent = error.message;
        break;
      }
    }
    if (pending) {
      formNote.textContent = "Payment is processing. Refresh in a minute if credits do not appear.";
    }
  }

  if (status || verify) {
    window.history.replaceState({}, "", "/");
  }
}

function activateTab(name) {
  const isPhotos = name === "photos";
  tabPhotos.classList.toggle("is-active", isPhotos);
  tabNotes.classList.toggle("is-active", !isPhotos);
  tabPhotos.setAttribute("aria-selected", String(isPhotos));
  tabNotes.setAttribute("aria-selected", String(!isPhotos));
  photoForm.classList.toggle("hidden", !isPhotos);
  form.classList.toggle("hidden", isPhotos);
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

async function compressImage(file) {
  const img = await loadImageFromFile(file);
  const scale = Math.min(MAX_PHOTO_DIM / Math.max(img.width, img.height), 1);
  const w = Math.max(Math.round(img.width * scale), 1);
  const h = Math.max(Math.round(img.height * scale), 1);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);

  let quality = 0.82;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > MAX_PHOTO_BYTES && quality > 0.5) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return dataUrl;
}

function renderPhotos() {
  photoPreviews.innerHTML = "";
  for (let i = 0; i < photos.length; i += 1) {
    const wrap = document.createElement("div");
    wrap.className = "photo-thumb";
    const img = document.createElement("img");
    img.src = photos[i];
    img.alt = `Photo ${i + 1}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove photo ${i + 1}`);
    remove.addEventListener("click", () => {
      photos.splice(i, 1);
      renderPhotos();
      updatePhotoFormState();
    });
    wrap.append(img, remove);
    photoPreviews.append(wrap);
  }
}

function updatePhotoFormState() {
  const noCredits = latestCredits && latestCredits.remaining <= 0;
  photoGenerateButton.disabled = !currentUser || noCredits || photos.length === 0;
  if (!currentUser) {
    photoFormNote.textContent = "Sign in to generate from photos.";
  } else if (noCredits) {
    photoFormNote.textContent = "No credits left. Top up to keep generating.";
  } else if (photos.length === 0) {
    photoFormNote.textContent = "Add at least one photo to start.";
  } else {
    photoFormNote.textContent = `${photos.length} photo${photos.length > 1 ? "s" : ""} ready. Generate when you're ready.`;
  }
  photoNote.textContent = photos.length
    ? `${photos.length}/${MAX_PHOTOS} photos added. Photos are sent for analysis only and are not stored.`
    : "No photos yet. JPEG, PNG or WebP. Photos are sent for analysis only and are not stored.";
}

async function addPhotoFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => f && f.type && f.type.startsWith("image/"));
  if (!files.length) return;

  photoFormNote.textContent = "Processing photos...";
  for (const file of files) {
    if (photos.length >= MAX_PHOTOS) {
      photoFormNote.textContent = `Up to ${MAX_PHOTOS} photos. Remove one to add more.`;
      break;
    }
    try {
      const dataUrl = await compressImage(file);
      photos.push(dataUrl);
    } catch {
      photoFormNote.textContent = "One of the photos couldn't be read. Try a different image.";
    }
  }
  renderPhotos();
  updatePhotoFormState();
}

async function generateFromPhotos(event) {
  event.preventDefault();
  if (!currentUser) {
    photoFormNote.textContent = "Sign in or create an account first.";
    return;
  }
  if (photos.length === 0) {
    photoFormNote.textContent = "Add at least one photo first.";
    return;
  }

  setLoading(true);
  photoFormNote.textContent = "Reading photos and drafting your listing...";

  const formData = new FormData(photoForm);
  const payload = {
    photos,
    category: formData.get("category") || "",
    tone: formData.get("tone") || "clean",
    sellerMode: form.querySelector("#sellerMode").value,
    negotiationGoal: form.querySelector("#negotiationGoal").value,
    size: formData.get("size") || "",
    condition: formData.get("condition") || "",
    notes: formData.get("notes") || ""
  };

  try {
    const response = await fetch("/api/generate-from-photos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      updateCredits(data.credits);
      throw new Error(data.error || "Could not generate from these photos.");
    }
    showResults(data);
    photoFormNote.textContent = "Done. Review the listing and copy each section to Vinted.";
  } catch (error) {
    photoFormNote.textContent = error.message;
  } finally {
    setLoading(false);
  }
}

async function copyOutput(event) {
  const targetId = event.target.dataset.copyTarget;
  if (!targetId) return;

  const target = document.querySelector(`#${targetId}`);
  await navigator.clipboard.writeText(target.textContent);
  const previous = event.target.textContent;
  event.target.textContent = "Copied";
  setTimeout(() => {
    event.target.textContent = previous;
  }, 900);
}

form.addEventListener("submit", generateListing);
photoForm.addEventListener("submit", generateFromPhotos);
authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitAuth("login");
});
signupButton.addEventListener("click", () => submitAuth("signup"));
logoutButton.addEventListener("click", logout);
exampleButton.addEventListener("click", loadExample);
upgradeButton.addEventListener("click", buyCredits);
tabNotes.addEventListener("click", () => activateTab("notes"));
tabPhotos.addEventListener("click", () => activateTab("photos"));
resendVerifyButton.addEventListener("click", resendVerification);
photoUploadButton.addEventListener("click", () => photoInput.click());
photoInput.addEventListener("change", () => {
  addPhotoFiles(photoInput.files);
  photoInput.value = "";
});
photoDropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  photoDropzone.classList.add("is-dragging");
});
photoDropzone.addEventListener("dragleave", () => photoDropzone.classList.remove("is-dragging"));
photoDropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  photoDropzone.classList.remove("is-dragging");
  addPhotoFiles(event.dataTransfer && event.dataTransfer.files);
});
document.addEventListener("click", copyOutput);
loadAccount();
confirmCheckout();
renderTemplates();
updatePhotoFormState();
