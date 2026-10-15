import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// GOALS.md §40b: the install manifest is a static file next to the root layout (src/app/manifest.webmanifest) whose URLs
// are all relative, so one file works under the Pages sub-path and at a domain root. This guards it at the source:
// the colours must be the ones the site already paints (a different splash/theme colour is the kind of drift nobody
// notices until a phone shows it), the icons must exist at the sizes the manifest claims, and no URL may be absolute.
// `npm run check:manifest` does the same against the built `out/`, where the base path shows up.

const WEB = fileURLToPath(new URL("../..", import.meta.url));
const read = (path: string) => readFileSync(join(WEB, path), "utf8");
const manifest = JSON.parse(read("src/app/manifest.webmanifest")) as {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  lang: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
};

function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(join(WEB, path));
  expect(bytes.subarray(0, 8).toString("hex"), `${path} is a PNG`).toBe("89504e470d0a1a0a");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(read("src/app/globals.css"))?.[1];

describe("manifest.webmanifest", () => {
  it("names the app and opens it like one", () => {
    expect(manifest.name).toBe("ALLU personal");
    expect(manifest.short_name).toBe("ALLU");
    expect(manifest.short_name.length).toBeLessThanOrEqual(12); // longer names are cut under a home-screen icon
    expect(manifest.display).toBe("standalone");
    expect(manifest.lang).toBe("pt-BR");
  });

  it("uses relative URLs only, and starts inside its scope", () => {
    for (const url of [manifest.id, manifest.start_url, manifest.scope, ...manifest.icons.map((icon) => icon.src)]) {
      expect(url, "no absolute or root-relative URL: it would ignore the base path").toMatch(/^\.\//);
    }
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
    // /entrar sends a signed-in visitor to their area and shows the form to everyone else.
    expect(manifest.start_url).toBe("./entrar/");
    expect(existsSync(join(WEB, "src/app/entrar/page.tsx"))).toBe(true);
  });

  it("uses the colours the site paints", () => {
    expect(manifest.theme_color.toLowerCase()).toBe(token("forest")?.toLowerCase());
    expect(manifest.background_color.toLowerCase()).toBe(token("paper")?.toLowerCase());
    const layout = read("src/app/layout.tsx");
    expect(/themeColor:\s*"([^"]+)"/.exec(layout)?.[1]?.toLowerCase()).toBe(manifest.theme_color.toLowerCase());
  });

  it("has 192 and 512 icons for any use and a maskable one of its own, all present at their stated size", () => {
    const entries = manifest.icons.map((icon) => ({ ...icon, purpose: icon.purpose ?? "any" }));
    for (const size of [192, 512]) expect(entries.some((icon) => icon.sizes === `${size}x${size}` && icon.purpose === "any")).toBe(true);
    expect(entries.filter((icon) => icon.purpose === "maskable").length).toBeGreaterThanOrEqual(1);
    for (const icon of entries) {
      expect(icon.purpose, "maskable is declared on its own, never as \"any maskable\"").toMatch(/^(any|maskable)$/);
      expect(icon.type).toBe("image/png");
      const path = `public/${icon.src.replace(/^\.\//, "")}`;
      expect(existsSync(join(WEB, path)), path).toBe(true);
      expect(`${pngSize(path).width}x${pngSize(path).height}`, path).toBe(icon.sizes);
    }
  });

  it("is next to the favicon and the iOS icon Next links by file convention", () => {
    expect(pngSize("src/app/icon.png")).toEqual({ width: 32, height: 32 });
    expect(pngSize("src/app/apple-icon.png")).toEqual({ width: 180, height: 180 });
  });
});
