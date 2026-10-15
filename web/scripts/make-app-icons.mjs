// GOALS.md §40b: writes the PNG app icons from design/app-icon.html, in headless Chrome — the same CDP client the e2e
// scripts use, so no new dependency. The manifest's three icons go to public/icons/; the favicon and the iOS icon go to
// src/app/icon.png and src/app/apple-icon.png, where Next's file convention links them (with the base path) by itself.
// The PNGs are committed; run this only when the mark changes:
//   node scripts/make-app-icons.mjs [barbell-a|dumbbell]     (Chrome's path: CHROME_PATH, default in e2e/lib.mjs)
// It checks what it wrote: exact pixel size, and the corners — opaque where the system rounds or masks the icon
// itself (iOS and the maskable one), transparent on the rounded "any" icons.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { browser, sleep } from "../e2e/lib.mjs";

const PUBLIC_ICONS = fileURLToPath(new URL("../public/icons/", import.meta.url));
const APP_DIR = fileURLToPath(new URL("../src/app/", import.meta.url));
const PAGE = pathToFileURL(fileURLToPath(new URL("../design/app-icon.html", import.meta.url))).href;

const MARK = process.argv[2] ?? "barbell-a";

const ICONS = [
  { dir: PUBLIC_ICONS, file: "icon-192.png", size: 192, kind: "any" },
  { dir: PUBLIC_ICONS, file: "icon-512.png", size: 512, kind: "any" },
  { dir: PUBLIC_ICONS, file: "icon-maskable-512.png", size: 512, kind: "maskable" },
  { dir: APP_DIR, file: "apple-icon.png", size: 180, kind: "full" },
  { dir: APP_DIR, file: "icon.png", size: 32, kind: "any" },
];

mkdirSync(PUBLIC_ICONS, { recursive: true });
const b = await browser("icons");
let failed = false;
try {
  for (const { dir, file, size, kind } of ICONS) {
    await b.cdp("Emulation.setDeviceMetricsOverride", { width: size, height: size, deviceScaleFactor: 1, mobile: false });
    await b.cdp("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    await b.cdp("Page.navigate", { url: `${PAGE}?kind=${kind}&mark=${MARK}` });
    await sleep(400);
    const { data } = await b.cdp("Page.captureScreenshot", { format: "png", fromSurface: true });
    const png = Buffer.from(data, "base64");
    writeFileSync(dir + file, png);

    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    // Decode the file again in the page and read the corner and centre pixels.
    const alpha = await b.eval(`(async () => {
      const img = new Image();
      img.src = "data:image/png;base64,${data}";
      await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      const a = (x, y) => g.getImageData(x, y, 1, 1).data[3];
      return { corner: a(0, 0), centre: a(img.width >> 1, img.height >> 1) };
    })()`);
    const wantCorner = kind === "any" ? 0 : 255;
    const ok = width === size && height === size && alpha.corner === wantCorner && alpha.centre === 255;
    if (!ok) failed = true;
    console.log(`${ok ? "ok  " : "FAIL"} ${file}  ${width}x${height}  corner alpha ${alpha.corner} (want ${wantCorner})  centre alpha ${alpha.centre}`);
  }
} finally {
  b.close();
}
process.exit(failed ? 1 : 0);
