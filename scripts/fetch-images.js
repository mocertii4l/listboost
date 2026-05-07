import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const imageRoot = path.join(root, "public", "images");
const MIN_BYTES = 5 * 1024;

const manifest = [
  { path: "listing-gallery/zara-dress.jpg", seed: "lb-zara-dress", w: 1200, h: 900, alt: "Navy satin midi dress hanging on a wooden hanger" },
  { path: "listing-gallery/white-trainers.jpg", seed: "lb-white-trainers", w: 1200, h: 900, alt: "Pair of clean white leather trainers on soft fabric" },
  { path: "listing-gallery/kids-bundle.jpg", seed: "lb-kids-bundle", w: 1200, h: 900, alt: "Folded kids winter clothing bundle" },
  { path: "listing-gallery/mens-coat.jpg", seed: "lb-mens-coat", w: 1200, h: 900, alt: "Mens wool overcoat folded neatly" },
  { path: "listing-gallery/designer-bag.jpg", seed: "lb-designer-bag", w: 1200, h: 900, alt: "Leather handbag on a neutral background" },
  { path: "listing-gallery/vintage-jeans.jpg", seed: "lb-vintage-jeans", w: 1200, h: 900, alt: "Vintage blue denim jeans, flat lay" },
  { path: "listing-gallery/gold-jewellery.jpg", seed: "lb-gold-jewellery", w: 1200, h: 900, alt: "Gold chain necklace and earrings" },
  { path: "listing-gallery/baby-clothes.jpg", seed: "lb-baby-clothes", w: 1200, h: 900, alt: "Soft baby clothing set in neutral tones" },
  { path: "lifestyle/wardrobe-sort.jpg", seed: "lb-life-wardrobe", w: 1400, h: 900, alt: "Wardrobe being sorted on a Sunday morning" },
  { path: "lifestyle/phone-on-desk.jpg", seed: "lb-life-phone", w: 1400, h: 900, alt: "Phone on a desk with clothing in the background" },
  { path: "lifestyle/packaging-parcel.jpg", seed: "lb-life-packaging", w: 1400, h: 900, alt: "Hands wrapping a parcel for posting" },
  { path: "lifestyle/hanging-rail.jpg", seed: "lb-life-rail", w: 1400, h: 900, alt: "Clothing rail with mixed second-hand items" },
  { path: "avatars/megan.jpg", seed: "lb-avatar-megan", w: 256, h: 256, alt: "Megan T., UK Vinted seller" },
  { path: "avatars/zoe.jpg", seed: "lb-avatar-zoe", w: 256, h: 256, alt: "Zoe H., UK Vinted seller" },
  { path: "avatars/priya.jpg", seed: "lb-avatar-priya", w: 256, h: 256, alt: "Priya R., UK Vinted seller" }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function prettyKb(bytes) {
  return `${Math.round(bytes / 1024)} KB`;
}

async function readExistingSize(file) {
  if (!existsSync(file)) return 0;
  try {
    const buffer = await readFile(file);
    return buffer.byteLength;
  } catch {
    return 0;
  }
}

function placeholderSvg(entry) {
  const label = entry.path.split("/").at(-1).replace(/\.[a-z]+$/i, "").replace(/-/g, " ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${entry.w}" height="${entry.h}" viewBox="0 0 ${entry.w} ${entry.h}" role="img" aria-label="${entry.alt}">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#E6F7F5"/>
      <stop offset="0.62" stop-color="#F5F4FA"/>
      <stop offset="1" stop-color="#FFE4E4"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect x="8%" y="10%" width="84%" height="80%" rx="32" fill="rgba(255,255,255,0.45)" stroke="#D5D5E2"/>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="700" fill="#0E7C76">${label}</text>
</svg>`;
}

async function fetchWithRetry(entry) {
  const url = `https://picsum.photos/seed/${encodeURIComponent(entry.seed)}/${entry.w}/${entry.h}`;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
      const type = response.headers.get("content-type") || "";
      if (!response.ok || !type.startsWith("image/")) {
        throw new Error(`Unexpected response ${response.status} ${type}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength < MIN_BYTES) {
        throw new Error(`Image too small: ${buffer.byteLength} bytes`);
      }
      return buffer;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(1000);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

let fetched = 0;
let skipped = 0;
let placeholdered = 0;

for (const entry of manifest) {
  const target = path.join(imageRoot, entry.path);
  await mkdir(path.dirname(target), { recursive: true });

  const existingSize = await readExistingSize(target);
  if (existingSize >= MIN_BYTES) {
    skipped += 1;
    console.log(`✓ ${entry.path} (${prettyKb(existingSize)}, existing)`);
    continue;
  }

  try {
    const buffer = await fetchWithRetry(entry);
    await writeFile(target, buffer);
    fetched += 1;
    console.log(`✓ ${entry.path} (${prettyKb(buffer.byteLength)})`);
  } catch {
    const fallback = target.replace(/\.jpg$/i, ".svg");
    await writeFile(fallback, placeholderSvg(entry), "utf8");
    placeholdered += 1;
    console.log(`! ${entry.path} failed -> placeholder`);
  }
}

console.log(`Done: ${fetched} fetched, ${skipped} existing, ${placeholdered} placeholdered.`);
