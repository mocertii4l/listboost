import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "images", "homepage");
const force = process.argv.includes("--force");

const manifest = [
  {
    path: "nike-trainers.jpg",
    url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=70",
    label: "Nike trainers"
  },
  {
    path: "white-trainers-floor.jpg",
    url: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=900&q=70",
    label: "white trainers"
  },
  {
    path: "zara-jacket.jpg",
    url: "https://images.unsplash.com/photo-1688126645209-1a3dfea64c08?auto=format&fit=crop&w=900&q=70",
    label: "black leather biker jacket"
  },
  {
    path: "carhartt-hoodie.jpg",
    url: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=70",
    label: "grey pullover hoodie"
  },
  {
    path: "levis-jeans.jpg",
    url: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=900&q=70",
    label: "jeans"
  },
  {
    path: "north-face-puffer.jpg",
    url: "https://images.unsplash.com/photo-1706765779494-2705542ebe74?auto=format&fit=crop&w=900&q=70",
    label: "white padded puffer jacket"
  },
  {
    path: "adidas-sambas.jpg",
    url: "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=900&q=70",
    label: "tan Nike low-top trainers"
  },
  {
    path: "leather-bag.jpg",
    url: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=70",
    label: "red leather top-handle bag"
  },
  {
    path: "summer-dress.jpg",
    url: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=70",
    label: "summer dress"
  },
  {
    path: "cargo-trousers.jpg",
    url: "https://images.unsplash.com/photo-1548883354-7622d03aca27?auto=format&fit=crop&w=900&q=70",
    label: "cargo trousers"
  },
  {
    path: "silver-necklace.jpg",
    url: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=900&q=70",
    label: "silver necklace"
  },
  {
    path: "doc-martens-boots.jpg",
    url: "https://images.unsplash.com/photo-1600429316815-43fe937fdc92?auto=format&fit=crop&w=900&q=70",
    label: "black boots"
  },
  {
    path: "wardrobe-rail.jpg",
    url: "https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=900&q=70",
    label: "wardrobe rail"
  }
];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function fetchImage(entry) {
  const target = join(outDir, entry.path);
  if (!force && await exists(target)) {
    console.log(`- ${entry.path} exists`);
    return "skipped";
  }

  const response = await fetch(entry.url);
  const contentType = response.headers.get("content-type") || "";
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok || !contentType.startsWith("image/") || bytes.length < 8_000) {
    throw new Error(`${entry.path} failed (${response.status}, ${contentType}, ${bytes.length} bytes)`);
  }

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  console.log(`+ ${entry.path} (${Math.round(bytes.length / 1024)} KB)`);
  return "fetched";
}

await mkdir(outDir, { recursive: true });
const results = { fetched: 0, skipped: 0 };
for (const entry of manifest) {
  const result = await fetchImage(entry);
  results[result] += 1;
}
console.log(`Done: ${results.fetched} fetched, ${results.skipped} skipped.`);
