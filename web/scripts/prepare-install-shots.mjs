// GOALS.md §40h: turns the raw phone screenshots (design/install-shots/raw/, gitignored) into the small WebP pictures the
// install guide shows (src/app/_shared/installGuide/shots/, committed). Crops are in design/install-shots/crops.json.
//   npm run shots:install
// A picture may carry a `retouch` (see crops.json): rectangles painted over with a flat colour and patches moved, applied to the
// raw capture before the crop — used only to take a message that does not belong in the guide out of a capture.
// Output: 560 px wide (twice the 280 px the guide shows them at), WebP, no metadata. Fails when a picture is over 120 KB
// or the lot is over 1.2 MB — the guide is read on a phone, often on mobile data.
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, "..", "design", "install-shots", "raw");
const OUT = join(HERE, "..", "src", "app", "_shared", "installGuide", "shots");
const WIDTH = 560;
const MAX_ONE = 120 * 1024;
const MAX_ALL = 1.2 * 1024 * 1024;

const crops = JSON.parse(readFileSync(join(HERE, "..", "design", "install-shots", "crops.json"), "utf8"));
mkdirSync(OUT, { recursive: true });

/** The raw capture as a sharp image, with the optional retouch applied: erase rectangles first, then paste the patches (cut from the untouched capture). */
async function retouched(source, retouch) {
  if (retouch === undefined) return sharp(source);
  const original = readFileSync(source);
  const [r, g, b] = retouch.fill;
  const layers = (retouch.erase ?? []).map((rect) => ({
    input: { create: { width: rect.width, height: rect.height, channels: 3, background: { r, g, b } } },
    left: rect.left,
    top: rect.top,
  }));
  for (const patch of retouch.paste ?? []) {
    layers.push({ input: await sharp(original).extract(patch.from).toBuffer(), left: patch.from.left + (patch.dx ?? 0), top: patch.from.top + (patch.dy ?? 0) });
  }
  return sharp(await sharp(original).composite(layers).png().toBuffer());
}

let total = 0;
let failed = false;
for (const [name, spec] of Object.entries(crops)) {
  if (name.startsWith("_")) continue;
  const source = join(RAW, spec.source);
  if (!existsSync(source)) {
    console.error(`MISSING  ${spec.source} (the raw capture for ${name})`);
    failed = true;
    continue;
  }
  const target = join(OUT, `${name}.webp`);
  const info = await (await retouched(source, spec.retouch)).extract(spec.crop).resize({ width: WIDTH }).webp({ quality: 80 }).toFile(target);
  const size = statSync(target).size;
  total += size;
  const tooBig = size > MAX_ONE;
  if (tooBig) failed = true;
  console.log(`${tooBig ? "FAIL" : "ok  "} ${name}.webp  ${info.width}x${info.height}  ${(size / 1024).toFixed(1)} KB`);
}
console.log(`total ${(total / 1024).toFixed(1)} KB (limit ${(MAX_ALL / 1024).toFixed(0)} KB)`);
if (total > MAX_ALL) failed = true;
process.exit(failed ? 1 : 0);
