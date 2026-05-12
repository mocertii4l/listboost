import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "images", "homepage");
const force = process.argv.includes("--force");

const manifest = [
  {
    path: "nike-trainers.jpg",
    url: "https://images.unsplash.com/photo-1557401945-20b287ff7b74?auto=format&fit=crop&w=900&q=70",
    label: "worn white Nike trainers on wet floor"
  },
  {
    path: "white-trainers-floor.jpg",
    url: "https://images.unsplash.com/photo-1640391846040-6e9e41388ad4?auto=format&fit=crop&w=900&q=70",
    label: "white Nike low-top trainers on floor"
  },
  {
    path: "zara-jacket.jpg",
    url: "https://images.unsplash.com/photo-1688126645209-1a3dfea64c08?auto=format&fit=crop&w=900&q=70",
    label: "black leather biker jacket"
  },
  {
    path: "grey-hoodie.jpg",
    url: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=70",
    label: "grey pullover hoodie"
  },
  {
    path: "blue-straight-jeans.jpg",
    url: "https://images.unsplash.com/photo-1593030761757-71fae45fa0e7?auto=format&fit=crop&w=900&q=70",
    label: "blue straight-leg jeans flat lay"
  },
  {
    path: "white-puffer.jpg",
    url: "https://images.unsplash.com/photo-1771074153183-5849e68c5da6?auto=format&fit=crop&w=900&q=70",
    label: "cream white puffer jacket on hanger"
  },
  {
    path: "tan-nike-af1.jpg",
    url: "https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=900&q=70",
    label: "tan Nike low-top trainers"
  },
  {
    path: "leather-bag.jpg",
    url: "https://images.unsplash.com/photo-1543930478-3421cd028c0a?auto=format&fit=crop&w=900&q=70",
    label: "worn brown leather crossbody bag"
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
    label: "boxed pearl strand necklace"
  },
  {
    path: "black-lace-up-boots.jpg",
    url: "https://images.unsplash.com/photo-1600429316815-43fe937fdc92?auto=format&fit=crop&w=900&q=70",
    label: "black lace-up boots"
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
