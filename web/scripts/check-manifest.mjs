// GOALS.md §40b: after `npm run build`, checks that the site can be installed from `out/` — the base path is the classic
// way for an install to look fine locally and break on Pages, so this reads the built files the way a phone would:
// the page's <link rel="manifest"> → the manifest → every URL in it, resolved against the manifest's own address.
//   node scripts/check-manifest.mjs [out-dir]        (npm run check:manifest)
// Works for a build with a base path (the deploy's /Personal_app_android) and one without (web-ci's): the base path is
// read from the manifest link, not configured here. Fails, never skips, when there is nothing to check.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const OUT = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..", "out"));
const ORIGIN = "https://site.test"; // only to resolve URLs; nothing is fetched
const problems = [];
const fail = (message) => problems.push(message);

function readPng(buffer) {
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("not a PNG");
  const png = { idat: [], hasTrns: false };
  for (let offset = 8; offset < buffer.length; ) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") Object.assign(png, { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], colorType: data[9], interlace: data[12] });
    else if (type === "IDAT") png.idat.push(data);
    else if (type === "tRNS") png.hasTrns = true;
    offset += 12 + length;
  }
  png.idat = Buffer.concat(png.idat);
  return png;
}

/** True when no pixel of the PNG is see-through (iOS paints transparency black; an adaptive mask needs a full square). */
function isOpaque(png) {
  if (png.colorType === 0 || png.colorType === 2) return !png.hasTrns;
  if (png.colorType === 3) return !png.hasTrns;
  if (png.depth !== 8 || png.interlace !== 0) throw new Error("cannot inspect this PNG's alpha");
  const bpp = png.colorType === 6 ? 4 : 2; // 4 = grey + alpha, 6 = RGBA
  const stride = png.width * bpp;
  const raw = inflateSync(png.idat);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < png.height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const current = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? current[i - bpp] : 0;
      const up = previous[i];
      const upLeft = i >= bpp ? previous[i - bpp] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      current[i] = (line[i] + predictor) & 0xff;
    }
    for (let x = 0; x < png.width; x++) if (current[x * bpp + bpp - 1] !== 255) return false;
    previous = current;
  }
  return true;
}

const html = existsSync(join(OUT, "index.html")) ? readFileSync(join(OUT, "index.html"), "utf8") : null;
if (html === null) {
  console.error(`check:manifest — ${OUT}/index.html not found: run \`npm run build\` first.`);
  process.exit(1);
}

const attr = (tag, name) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
const links = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
const linkTo = (rel) => links.find((tag) => attr(tag, "rel") === rel);
const manifestLink = linkTo("manifest");
const iconLink = linkTo("icon");
const appleLink = linkTo("apple-touch-icon");
const themeColor = /<meta[^>]*name="theme-color"[^>]*content="([^"]*)"/.exec(html)?.[1];

if (manifestLink === undefined) {
  console.error('check:manifest — index.html has no <link rel="manifest">.');
  process.exit(1);
}

const manifestPath = new URL(attr(manifestLink, "href"), ORIGIN).pathname; // e.g. /Personal_app_android/manifest.webmanifest
const basePath = manifestPath.slice(0, manifestPath.lastIndexOf("/")); // "" or "/Personal_app_android"
const fileFor = (pathname) => {
  if (basePath !== "" && !pathname.startsWith(`${basePath}/`)) return null;
  const relative = decodeURIComponent(pathname.slice(basePath.length)).replace(/^\/+/, "");
  return join(OUT, relative.endsWith("/") || relative === "" ? `${relative}index.html` : relative);
};
const resolveFile = (url, base) => {
  const resolved = new URL(url, base);
  const file = fileFor(resolved.pathname);
  return { pathname: resolved.pathname, file: file !== null && existsSync(file) ? file : null };
};

const manifestFile = fileFor(manifestPath);
if (manifestFile === null || !existsSync(manifestFile)) {
  console.error(`check:manifest — the manifest link points to ${manifestPath}, which is not in the build.`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
const manifestUrl = ORIGIN + manifestPath;

for (const key of ["name", "short_name", "start_url", "scope", "display", "theme_color", "background_color", "icons"]) {
  if (manifest[key] === undefined) fail(`the manifest has no "${key}"`);
}
if (manifest.display !== "standalone") fail(`display is "${manifest.display}", not "standalone" (iOS before 26 opens it as a bookmark)`);

const scope = new URL(manifest.scope ?? "./", manifestUrl);
const start = new URL(manifest.start_url ?? "./", manifestUrl);
if (!start.pathname.startsWith(scope.pathname)) fail(`start_url ${start.pathname} is outside scope ${scope.pathname}`);
if (!start.pathname.startsWith(`${basePath}/`)) fail(`start_url ${start.pathname} is outside the base path "${basePath}"`);
if (resolveFile(manifest.start_url ?? "./", manifestUrl).file === null) fail(`start_url ${start.pathname} has no page in the build`);
if (manifest.id !== undefined && new URL(manifest.id, start).origin !== start.origin) fail(`id "${manifest.id}" is on another origin`);

if (themeColor === undefined) fail('index.html has no <meta name="theme-color">');
else if (manifest.theme_color?.toLowerCase() !== themeColor.toLowerCase()) fail(`theme_color ${manifest.theme_color} differs from the page's theme-color ${themeColor}`);

const seen = [];
for (const icon of manifest.icons ?? []) {
  const { pathname, file } = resolveFile(icon.src, manifestUrl);
  if (file === null) {
    fail(`icon ${icon.src} → ${pathname} is not in the build`);
    continue;
  }
  const png = readPng(readFileSync(file));
  const [w, h] = String(icon.sizes).split("x").map(Number);
  if (icon.type !== "image/png") fail(`icon ${icon.src} declares type ${icon.type}, not image/png`);
  if (png.width !== w || png.height !== h) fail(`icon ${icon.src} declares ${icon.sizes} but is ${png.width}x${png.height}`);
  const purpose = icon.purpose ?? "any";
  if (/\bmaskable\b/.test(purpose) && purpose !== "maskable") fail(`icon ${icon.src}: "${purpose}" mixes maskable with another purpose (declare a separate entry)`);
  if (purpose === "maskable" && !isOpaque(png)) fail(`maskable icon ${icon.src} has transparent pixels (it must fill the square)`);
  seen.push({ size: w, purpose });
}
for (const size of [192, 512]) if (!seen.some((s) => s.size === size && s.purpose === "any")) fail(`no ${size}x${size} icon with purpose "any"`);
if (!seen.some((s) => s.purpose === "maskable")) fail('no icon with purpose "maskable" on its own entry');

if (iconLink === undefined) fail('index.html has no <link rel="icon">');
else if (resolveFile(attr(iconLink, "href"), ORIGIN + "/").file === null) fail(`favicon ${attr(iconLink, "href")} is not in the build`);
if (appleLink === undefined) fail('index.html has no <link rel="apple-touch-icon">');
else {
  const { pathname, file } = resolveFile(attr(appleLink, "href"), ORIGIN + "/");
  if (file === null) fail(`apple-touch-icon ${pathname} is not in the build`);
  else {
    const png = readPng(readFileSync(file));
    if (png.width !== 180 || png.height !== 180) fail(`apple-touch-icon is ${png.width}x${png.height}, not 180x180`);
    if (!isOpaque(png)) fail("apple-touch-icon has transparent pixels (iOS paints them black)");
  }
}

if (problems.length > 0) {
  console.error(`check:manifest — ${problems.length} problem(s) in ${OUT}:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`check:manifest — ok (base path "${basePath || "/"}", ${manifest.icons.length} manifest icons, start_url ${start.pathname}).`);
