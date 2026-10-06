// Browser tests for the site, run against the local emulators (see README.md in this folder's parent, "Browser tests").
// Headless Chrome driven over CDP + direct emulator REST helpers — no dependencies (Node 24: global fetch/WebSocket).
// Needs: the emulators and `npm run dev` with NEXT_PUBLIC_FIREBASE_EMULATORS=true running (npm run dev:local does both),
// and Chrome (CHROME_PATH overrides the default Windows location).
import { spawn, execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
export const BASE = "http://localhost:3000";
export const PROJECT = "demo-personal-tracker";
export const BUCKET = "personalapp-88129.firebasestorage.app";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- result bookkeeping ----------
const results = [];
export function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
export function summary() {
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  for (const f of fails) console.log("  FAILED:", f.name, f.detail);
  return fails.length;
}

// ---------- emulator REST ----------
const FS = `http://127.0.0.1:8081/v1/projects/${PROJECT}/databases/(default)/documents`;
const OWNER = { Authorization: "Bearer owner" };
export async function fsGet(path) {
  const r = await fetch(`${FS}/${path}`, { headers: OWNER });
  return r.ok ? r.json() : null;
}
export async function fsList(collection) {
  const out = [];
  let token = "";
  do {
    const r = await (await fetch(`${FS}/${collection}?pageSize=200${token}`, { headers: OWNER })).json();
    out.push(...(r.documents ?? []));
    token = r.nextPageToken ? `&pageToken=${r.nextPageToken}` : "";
  } while (token);
  return out;
}
export const fieldValue = (f) => (f === undefined ? undefined : f.stringValue ?? f.integerValue ?? f.booleanValue ?? f.doubleValue ?? (f.nullValue === null ? null : f));
export async function uidByEmail(email, password = "senha123") {
  const r = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  return r.ok ? (await r.json()).localId : null;
}
export async function fsPatch(path, fields) {
  const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join("&");
  const r = await fetch(`${FS}/${path}?${mask}`, { method: "PATCH", headers: { ...OWNER, "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
  return r.ok;
}
export async function oobCodes() {
  return (await (await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/oobCodes`)).json()).oobCodes ?? [];
}
export async function authSignIn(email, password) {
  const r = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  return r.ok;
}
export async function avatarObjects(uid) {
  const r = await fetch(`http://127.0.0.1:9199/v0/b/${BUCKET}/o?prefix=account-avatars%2F${uid}%2F`, { headers: OWNER });
  if (!r.ok) return [];
  return ((await r.json()).items ?? []).map((i) => i.name);
}

// ---------- browser ----------
const VIEWPORTS = {
  desktop: { width: 1440, height: 900, mobile: false, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, mobile: true, deviceScaleFactor: 2 },
};
let nextPort = 9400;

export async function browser(label = "b", vp = "desktop") {
  const port = nextPort++;
  const userDir = join(tmpdir(), `chrome-flows-${label}-${port}`);
  rmSync(userDir, { recursive: true, force: true });
  const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`, "--no-first-run", "--disable-gpu", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* starting */ }
    if (!target) await sleep(200);
  }
  if (!target) throw new Error("chrome did not start");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const logs = [];
  const net = []; const netOpen = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === "Network.requestWillBeSent") netOpen.set(m.params.requestId, { url: m.params.request.url, method: m.params.request.method, t: m.params.timestamp, post: (m.params.request.postData ?? "").slice(0, 160) });
    if (m.method === "Network.loadingFinished" || m.method === "Network.loadingFailed") { const o = netOpen.get(m.params.requestId); if (o) { net.push({ ...o, ms: Math.round((m.params.timestamp - o.t) * 1000), failed: m.method === "Network.loadingFailed" }); netOpen.delete(m.params.requestId); } }
    if (m.method === "Runtime.consoleAPICalled" && ["error"].includes(m.params.type)) logs.push("console.error: " + m.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 200));
    if (m.method === "Runtime.exceptionThrown") logs.push("exception: " + (m.params.exceptionDetails.exception?.description ?? "").slice(0, 200));
    if (m.method === "Page.javascriptDialogOpening") { dialog.last = m.params; send("Page.handleJavaScriptDialog", { accept: dialog.accept }); }
  };
  const dialog = { accept: true, last: null };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  const v = VIEWPORTS[vp];
  await send("Emulation.setDeviceMetricsOverride", { ...v, screenOrientation: { type: "portraitPrimary", angle: 0 } });

  const api = {
    logs, dialog, net,
    async go(path, wait = 2500) { await send("Page.navigate", { url: path.startsWith("http") ? path : BASE + path }); await sleep(wait); },
    async eval(expr) {
      const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(expr, ms = 15000, step = 400) {
      const end = Date.now() + ms;
      while (Date.now() < end) { try { const v = await api.eval(expr); if (v) return v; } catch { /* page changing */ } await sleep(step); }
      return false;
    },
    url: () => api.eval("location.pathname + location.search"),
    text: (sel = "main") => api.eval(`(document.querySelector(${JSON.stringify(sel)})?.innerText ?? "").replace(/\\n+/g, " | ")`),
    async key(key, modifiers = 0) {
      const map = { Tab: ["Tab", 9], Enter: ["Enter", 13], Escape: ["Escape", 27], Space: [" ", 32] };
      const [k, code] = map[key] ?? [key, key.charCodeAt(0)];
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code: k, windowsVirtualKeyCode: code, modifiers });
      if (key === "Enter") await send("Input.dispatchKeyEvent", { type: "char", text: "\r", key: k, windowsVirtualKeyCode: code });
      if (key === "Space") await send("Input.dispatchKeyEvent", { type: "char", text: " ", key: k, windowsVirtualKeyCode: code });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: k, windowsVirtualKeyCode: code, modifiers });
    },
    // focus a control by CSS selector (or by label text), then type like a user
    async focus(selector) { return api.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return false; e.focus(); return document.activeElement===e;})()`); },
    async type(text, { replace = true } = {}) {
      if (replace) await api.eval("document.activeElement && document.activeElement.select && document.activeElement.select()");
      if (text === "") await api.key("Backspace");
      else await send("Input.insertText", { text });
    },
    // label text -> input element index inside a form, for stable targeting
    async fillLabel(label, text, scope = "main") {
      const ok = await api.eval(`(()=>{const l=[...document.querySelectorAll(${JSON.stringify(scope)} + ' label')].find(x=>x.innerText.trim().startsWith(${JSON.stringify(label)})); const e=l&&l.querySelector('input,textarea,select'); if(!e) return false; e.focus(); if(e.select) e.select(); return true;})()`);
      if (!ok) throw new Error("no field labelled " + label);
      await api.type(text, { replace: false });
      if (text === "") await api.key("Backspace");
    },
    async click(textRe, scope = "main") {
      return api.eval(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(scope)} + ' button, ' + ${JSON.stringify(scope)} + ' a')].find(x=>new RegExp(${JSON.stringify(textRe)},'i').test(x.textContent)); if(!b) return false; b.click(); return true;})()`);
    },
    async shot(name, outDir) {
      const m = await send("Page.getLayoutMetrics");
      const clip = { x: 0, y: 0, width: Math.ceil(m.cssContentSize.width), height: Math.min(Math.ceil(m.cssContentSize.height), 3000), scale: 1 };
      const r = await send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: true });
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, name + ".png"), Buffer.from(r.data, "base64"));
    },
    async login(email, password = "senha123") {
      await api.go("/entrar/", 1800);
      await api.focus("input[type=email]"); await api.type(email);
      await api.focus("input[type=password]"); await api.type(password);
      await api.key("Enter");
      await api.waitFor(`!location.pathname.startsWith('/entrar')`, 12000);
      await sleep(1200);
      return api.url();
    },
    async png(color = "#c33") {
      return api.eval(`(async()=>{const cv=document.createElement('canvas');cv.width=cv.height=64;const x=cv.getContext('2d');x.fillStyle=${JSON.stringify(color)};x.fillRect(0,0,64,64);return await new Promise(r=>cv.toBlob(b=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(b)},'image/png'))})()`);
    },
    // set a file on the page's <input type=file> (data URL -> File), like choosing it in the picker
    async chooseFile(dataUrlOrSpec) {
      return api.eval(`(async()=>{const i=document.querySelector('input[type=file]'); let f; const spec=${JSON.stringify(dataUrlOrSpec)}; if(typeof spec==='string'){const b=await (await fetch(spec)).blob(); f=new File([b],'a.png',{type:'image/png'});} else {f=new File([new Uint8Array(spec.size||5)],spec.name,{type:spec.type});} const dt=new DataTransfer(); dt.items.add(f); i.files=dt.files; i.dispatchEvent(new Event('change',{bubbles:true})); return true;})()`);
    },
    close() { try { ws.close(); } catch { /* */ } proc.kill(); },
  };
  return api;
}

/** Wipes the emulators and plants the fake accounts again, so every test starts from the same state. */
export async function reseed() {
  execSync("npm run seed:emulators", { cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: "ignore" });
}
