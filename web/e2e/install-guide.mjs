// node e2e/install-guide.mjs <trainer|student|admin> — GOALS.md §40: "Configurações" and its "Instalar no celular" tab.
// Needs the emulators and the site (npm run dev:local), like the other scripts here.
import { browser, check, summary, reseed, sleep } from "./lib.mjs";

const role = process.argv[2] ?? "trainer";
const EMAIL = { trainer: "treinador@teste.dev", student: "ana@teste.dev", admin: "admin@teste.dev" }[role];
const ACCOUNT = { trainer: "/app/conta/", student: "/aluno/conta/", admin: "/admin/conta/" }[role];
const INSTALL = `${ACCOUNT}instalar/`;
const HOME = { trainer: "/app/", student: "/aluno/", admin: "/admin/" }[role];

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 15; SM-S926B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";

await reseed();
const b = await browser(`${role}-install`, "desktop");
const heading = (level) => b.eval(`[...document.querySelectorAll('main h${level}')].map((h) => h.innerText.trim())`);
const pressed = () => b.eval(`[...document.querySelectorAll('.install-toggle button')].map((x) => x.textContent.trim() + ':' + x.getAttribute('aria-pressed')).join(' ')`);

try {
  check(`[${role}] signs in and lands in its own area`, (await b.login(EMAIL)) === HOME, await b.url());

  // ---------- Configurações: the label, the title, the two tabs ----------
  await b.go(ACCOUNT, 3000);
  check(`[${role}] the profile entry says Configurações`, /Configurações/.test(await b.eval(`document.querySelector('a.profile-account small')?.innerText ?? ''`)));
  check(`[${role}] the page is titled Configurações`, /Configurações/.test(await b.eval("document.title")) && (await heading(1)).join() === "Configurações", await b.eval("document.title"));
  const tabs = await b.eval(`[...document.querySelectorAll('nav.settings-tabs a')].map((a) => a.textContent.trim() + (a.getAttribute('aria-current') ? '*' : '') + '=' + new URL(a.href).pathname).join(' ')`);
  check(`[${role}] two tabs, "Minha conta" current, URLs unchanged`, tabs === `Minha conta*=${ACCOUNT} Instalar no celular=${INSTALL}`, tabs);
  check(`[${role}] the account tab still holds the account form`, /E-mail de acesso/.test(await b.text()) && /Senha/.test(await b.text()));

  // ---------- the install tab: by click, then by link ----------
  await b.eval(`document.querySelector('nav.settings-tabs a:not([aria-current])').click()`);
  check(`[${role}] the second tab opens the install guide`, !!(await b.waitFor(`location.pathname === ${JSON.stringify(INSTALL)}`, 8000)), await b.url());
  await b.go(INSTALL, 3000);
  check(`[${role}] the guide opens by direct link, titled and framed`, /Instalar no celular/.test(await b.eval("document.title")) && (await heading(1)).join() === "Configurações", await b.eval("document.title"));
  check(`[${role}] the install tab is the current one`, (await b.eval(`document.querySelector('nav.settings-tabs a[aria-current=page]')?.textContent.trim()`)) === "Instalar no celular");
  check(`[${role}] a desktop browser opens the iPhone guide, with both on offer`, (await pressed()) === "iPhone:true Android:false" && /No iPhone, pelo Safari/.test((await heading(2)).join(" | ")), await pressed());
  check(`[${role}] every step has a title and a body`, await b.eval(`[...document.querySelectorAll('.install-step')].length >= 4 && [...document.querySelectorAll('.install-step')].every((s) => s.querySelector('h3')?.innerText.trim() && s.querySelector('p')?.innerText.trim())`));

  // ---------- the toggle ----------
  await b.eval(`[...document.querySelectorAll('.install-toggle button')].find((x) => x.textContent.trim() === 'Android').click()`);
  check(`[${role}] the Android button shows the Android guide`, (await pressed()) === "iPhone:false Android:true" && /No Android, pelo Chrome/.test((await heading(2)).join(" | ")), await pressed());

  // ---------- which phone this is (user agent) and whether it is already an app ----------
  await b.cdp("Emulation.setUserAgentOverride", { userAgent: ANDROID_UA });
  await b.go(INSTALL, 3000);
  check(`[${role}] an Android browser opens the Android guide first`, (await pressed()) === "iPhone:false Android:true", await pressed());
  await b.cdp("Emulation.setUserAgentOverride", { userAgent: IPHONE_UA });
  await b.go(INSTALL, 3000);
  check(`[${role}] an iPhone browser opens the iPhone guide first`, (await pressed()) === "iPhone:true Android:false", await pressed());
  check(`[${role}] not installed: no "already an app" notice`, !(await b.eval(`!!document.querySelector('.install-installed')`)));
  // "Installed" is `display-mode: standalone` (Android, iOS 16.4+) or Safari's older `navigator.standalone`; headless Chrome
  // cannot emulate the media feature, so each signal is planted before the page's own scripts run.
  const planted = [];
  for (const [label, source] of [
    ["display-mode: standalone", "(() => { const real = window.matchMedia.bind(window); window.matchMedia = (q) => (/display-mode:\\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : real(q)); })()"],
    ["navigator.standalone", "Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })"],
  ]) {
    const { identifier } = await b.cdp("Page.addScriptToEvaluateOnNewDocument", { source });
    await b.go(INSTALL, 3000);
    check(`[${role}] running as an installed app (${label}) says so`, await b.eval(`/já está usando o ALLU como aplicativo/.test(document.querySelector('.install-installed')?.innerText ?? '')`));
    await b.cdp("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    planted.push(label);
  }
  await b.cdp("Emulation.setUserAgentOverride", { userAgent: "" });

  // ---------- the pictures (none until §40i; then every one must load) ----------
  await b.go(INSTALL, 3000);
  await b.eval(`[...document.querySelectorAll('.install-toggle button')].find((x) => x.textContent.trim() === 'iPhone').click()`);
  // The pictures load lazily: bring each into view first, or an offscreen one has no size yet.
  await b.eval(`[...document.querySelectorAll('.install-shot img')].forEach((i) => i.scrollIntoView())`);
  await sleep(1200);
  const pictures = await b.eval(`[...document.querySelectorAll('.install-shot img')].map((i) => i.complete && i.naturalWidth > 0 && i.alt.trim().length > 0)`);
  check(`[${role}] every picture loads and has a description (${pictures.length} on this guide)`, pictures.every(Boolean));

  // ---------- the install manifest and its icons, as the browser fetches them ----------
  const manifest = await b.eval(`(async () => {
    const link = document.querySelector('link[rel=manifest]');
    if (!link) return { error: 'no manifest link' };
    const url = new URL(link.href);
    const manifest = await (await fetch(url)).json();
    const icons = [];
    for (const icon of manifest.icons) {
      const response = await fetch(new URL(icon.src, url));
      const bitmap = response.ok ? await createImageBitmap(await response.blob()) : null;
      icons.push({ src: icon.src, ok: response.ok, type: response.headers.get('content-type'), size: bitmap ? bitmap.width + 'x' + bitmap.height : null, declared: icon.sizes });
    }
    const start = await fetch(new URL(manifest.start_url, url));
    return { name: manifest.name, display: manifest.display, startOk: start.ok, icons };
  })()`);
  check(`[${role}] the manifest names the app and opens it standalone`, manifest.name === "ALLU personal" && manifest.display === "standalone", JSON.stringify(manifest).slice(0, 160));
  check(`[${role}] every manifest icon is a PNG of its declared size`, manifest.icons?.length >= 3 && manifest.icons.every((i) => i.ok && /image\/png/.test(i.type) && i.size === i.declared), JSON.stringify(manifest.icons));
  check(`[${role}] the manifest's start page loads`, manifest.startOk === true);
  if (b.logs.length) console.log("INFO  browser errors:", [...new Set(b.logs)].slice(0, 5).join(" || "));
} catch (e) {
  check(`[${role}] script completed (desktop)`, false, e.message);
} finally {
  b.close();
}

// ---------- 390 px: no sideways scroll, targets ≥ 44 px, the bottom bar still fits ----------
const m = await browser(`${role}-install-mobile`, "mobile");
try {
  await m.login(EMAIL);
  for (const [name, path] of [["Configurações", ACCOUNT], ["Instalar no celular", INSTALL]]) {
    await m.go(path, 3000);
    const a = await m.eval(`(() => {
      const vw = document.documentElement.clientWidth;
      const small = [...document.querySelectorAll('a,button')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && r.height < 44; }).map((e) => (e.getAttribute('aria-label') || e.innerText).trim().slice(0, 24) + ':' + Math.round(e.getBoundingClientRect().height));
      const tabs = [...document.querySelectorAll('nav.settings-tabs a')].map((e) => e.getBoundingClientRect().right <= vw);
      const text = [...document.querySelectorAll('main p, main h3, main summary')].filter((e) => parseFloat(getComputedStyle(e).fontSize) < 12).length;
      return { over: document.documentElement.scrollWidth > vw, small, tabsFit: tabs.every(Boolean), text };
    })()`);
    check(`[${role}] 390px ${name}: no horizontal overflow`, !a.over);
    check(`[${role}] 390px ${name}: controls are at least 44px`, a.small.length === 0, a.small.join(", "));
    check(`[${role}] 390px ${name}: both tabs are fully on screen`, a.tabsFit);
    check(`[${role}] 390px ${name}: text is at least 12px`, a.text === 0);
  }
} catch (e) {
  check(`[${role}] script completed (390 px)`, false, e.message);
} finally {
  m.close();
}
process.exit(summary() ? 1 : 0);
