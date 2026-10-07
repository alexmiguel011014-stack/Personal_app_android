// node e2e/ficha-privacy.mjs [mobile] - GOALS.md section 33g: the trainer's exercise reference stays out of sight.
// Signed in as the seeded trainer it opens a new ficha, copies the prompt, reads everything a person or a script could
// read (the prompt, the clipboard, the page text, the Gemini tab, every loaded script) and fails on any trace of the
// reference; checks the old public files are gone; pastes an answer and checks the review recognises exercises without
// listing the catalog; saves and checks the muscles were filled in; and asks Firestore (REST, with real ID tokens)
// who may read the gated document. The sentinels come from the reference's own source at run time, and so do the
// exercise names used below - this file carries none of them. Needs the same bench as the other scripts (npm run dev:local).
import { buildCatalog } from "../scripts/lib/catalogSource.mjs";
import { findLeaks, isLeak, loadSentinels } from "../scripts/lib/referenceSentinels.mjs";
import { browser, check, summary, sleep, reseed, uidByEmail, fsList, fieldValue } from "./lib.mjs";

const viewport = process.argv.includes("mobile") ? "mobile" : "desktop";
await reseed();

const sentinels = loadSentinels();
const [first, second, third] = buildCatalog().exercises;
const FORBIDDEN = /\btabela\b|coeficiente|régua|\bPDF\b/i;
const verdict = (text, allowNames) => {
  const found = findLeaks(text, sentinels);
  return { ok: !isLeak(found, { allowNames }) && !FORBIDDEN.test(text), found };
};
const clean = (label, text, allowNames = 0) => {
  const { ok, found } = verdict(text, allowNames);
  check(`${label}: no phrase, name or naming word of the reference`, ok, JSON.stringify(found));
};

const ana = await uidByEmail("ana@teste.dev");
check("the seeded student exists", !!ana);

// ---------- who may read the gated document (Firestore REST with real ID tokens) ----------
const idToken = async (email) => {
  const r = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "senha123", returnSecureToken: true }),
  });
  return r.ok ? (await r.json()).idToken : null;
};
const readDoc = async (token) =>
  (await fetch("http://127.0.0.1:8081/v1/projects/demo-personal-tracker/databases/(default)/documents/appData/exerciseCatalog", { headers: token ? { Authorization: `Bearer ${token}` } : {} })).status;
check("an approved trainer can read the document", (await readDoc(await idToken("treinador@teste.dev"))) === 200);
check("the ADM can read it", (await readDoc(await idToken("admin@teste.dev"))) === 200);
check("a student cannot", (await readDoc(await idToken("ana@teste.dev"))) === 403);
check("a suspended trainer cannot", (await readDoc(await idToken("suspended@teste.dev"))) === 403);
check("nobody signed out can", (await readDoc(null)) === 403);

// ---------- the trainer's screens ----------
const b = await browser("ficha-privacy", viewport);
try {
  check("trainer signs in", (await b.login("treinador@teste.dev")) === "/app/");
  await b.go(`/app/fichas/editar/?aluno=${ana}`, 3500);
  await b.waitFor(`document.body.innerText.includes('Nova ficha')`, 20000);

  // the old public files are gone; the web-only templates are served
  const status = (path) => b.eval(`fetch(${JSON.stringify(path)}).then(r=>r.status)`);
  check("the old public table file is gone (404)", (await status("/prompt/hypertrophy_volume_reference.md")) === 404);
  check("the old public catalog file is gone (404)", (await status("/prompt/exercise-catalog.json")) === 404);
  check("the phone's template is not served either (404)", (await status("/prompt/ficha_prompt_template.md")) === 404);
  for (const name of ["ficha_prompt_single.md", "ficha_prompt_multi.md", "ficha_system_gemini.md"]) {
    check(`the web-only template ${name} is served (200)`, (await status(`/prompt/${name}`)) === 200);
  }

  // the copyable prompt: the textarea AND the clipboard
  await b.eval(`window.__clip=[]; Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async (t)=>{window.__clip.push(t)}}})`);
  check("'Copiar prompt' is available", await b.click("^Copiar prompt$"));
  await b.waitFor(`!!document.querySelector('textarea[aria-label="Prompt"]')`, 8000);
  const shown = await b.eval(`document.querySelector('textarea[aria-label="Prompt"]')?.value ?? ''`);
  const clipped = await b.eval(`window.__clip[0] ?? ''`);
  check("the prompt is shown and has the student's profile and the format rules", shown.length > 500 && shown.includes("Pedido do Professor") && shown.includes("UM ÚNICO bloco de código"));
  check("what reached the clipboard is exactly what is shown", clipped === shown);
  clean("the prompt on screen", shown);
  clean("the prompt on the clipboard", clipped);
  const sizeNote = await b.text("main");
  check("the length hint reflects a short prompt (no table: well under 9 mil caracteres)", /≈\s*[1-6],\d\s*mil caracteres/.test(sizeNote), sizeNote.match(/≈[^|]*caracteres/)?.[0] ?? "");
  check("there is no 'I already have the table' switch", !/Já tenho a tabela/.test(sizeNote));

  // the Gemini tab (no call is made here)
  await b.eval(`document.getElementById('tab-gemini').click()`);
  await sleep(600);
  clean("the Gemini tab", await b.eval(`document.getElementById('panel-ai').innerText`));
  await b.eval(`document.getElementById('tab-copy').click()`);

  // the page text and every script that has been loaded
  clean("the whole page text", await b.eval("document.body.innerText"), 2);
  const scripts = await b.eval(`(async()=>{const urls=[...document.scripts].map(s=>s.src).filter(Boolean); return await Promise.all(urls.map(u=>fetch(u).then(r=>r.text()).catch(()=>"")))})()`);
  check("scripts were loaded to inspect", scripts.length > 0, String(scripts.length));
  // (scripts: phrases and names only - ordinary source may use the word "tabela" for the billing screens)
  const dirty = scripts.map((text, i) => [i, findLeaks(text, sentinels)]).filter(([, found]) => isLeak(found, { allowNames: 2 }));
  check("no loaded script carries a phrase or 3+ exercise names of the reference", dirty.length === 0, JSON.stringify(dirty));

  // pasting an answer: the review recognises the exercises, never lists the catalog
  const guess = `${second.name.split(" ")[0]} especial`;
  const answer = [`Treino F`, `${first.name} 6x10`, `${second.name} 3x12`, `Treino G`, `${third.name} 4x8`, `${guess} 3x10`, `Nome totalmente inventado 3x10`].join("\n");
  await b.eval(`(()=>{const e=document.querySelector('textarea[aria-label="Texto para importar"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e, ${JSON.stringify(answer)}); e.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
  check("the review opens with the two treinos", await b.waitFor(`document.body.innerText.includes('Encontrei 2 treinos')`, 8000));
  await b.waitFor(`!document.querySelector('.review')?.innerText.includes('Carregando dados dos exercícios')`, 15000);
  const review = await b.text(".review");
  const recognized = (review.match(/Músculos reconhecidos/g) ?? []).length;
  check("the exercises from the reference are recognised", recognized >= 3, `${recognized} recognised`);
  check("an exercise that nobody matched says so, plainly", /Sem ativação calculada|Correspondência aproximada/.test(review));
  check("the review never names the reference as a table or catalog", !FORBIDDEN.test(review) && !/catálogo/i.test(review), review.slice(0, 200));
  const rows = await b.eval(`[...document.querySelectorAll('.review-exercise')].map(li=>({sug:li.querySelectorAll('button[aria-label^="Usar "]').length}))`);
  check("no exercise row offers more than 3 names", rows.length === 5 && rows.every((r) => r.sug <= 3), JSON.stringify(rows));
  check("the guessed name gets at least one suggestion", rows.some((r) => r.sug >= 1));
  check("there is no dropdown listing the catalog", (await b.eval(`document.querySelectorAll('.review select, .review option').length`)) === 0);
  check("the volume per muscle appears", /Volume efetivo por músculo/.test(review));
  const request = await b.eval(`document.querySelector('textarea[aria-label="Pedido de ajuste de volume"]')?.value ?? ''`);
  check("a volume-adjust request is offered, with totals and band words only", /séries efetivas por semana/.test(request) && /COMPLETA e atualizada/.test(request), request.slice(0, 120));
  clean("the volume-adjust request", request);
  check("the page text still has no phrase of the reference after the review", verdict(await b.eval("document.body.innerText"), 12).ok);

  // saving fills in the muscles from the gated document
  check("'Salvar 2 fichas' is available", await b.click("^Salvar 2 fichas$"));
  await b.waitFor(`document.body.innerText.includes('Substituir a ficha atual?')`, 8000);
  check("the replace question appears (the student already has a ficha)", await b.click("Só adicionar", "body"));
  await b.waitFor(`location.pathname.startsWith('/app/alunos')`, 15000);
  const saved = (await fsList("workouts")).filter((d) => /^Treino [FG]$/.test(fieldValue(d.fields?.name) ?? ""));
  check("both fichas were saved", saved.length === 2, String(saved.length));
  const json = (name) => fieldValue(saved.find((d) => fieldValue(d.fields?.name) === name)?.fields?.exercisesJson) ?? "";
  check("a recognised exercise was stored with its muscles", json("Treino F").includes('"muscleActivation"'));
  check("an unrecognised exercise was stored without any", !/inventado/.test(json("Treino G")) || !json("Treino G").split("inventado")[1]?.slice(0, 120).includes("muscleActivation"));

  const errs = [...new Set(b.logs)].filter((l) => !/favicon|404|400|Failed to load resource/.test(l));
  if (errs.length) console.log("INFO  browser errors:", errs.slice(0, 5).join(" || "));
} catch (e) {
  check("script completed", false, e.message);
} finally {
  b.close();
}
process.exit(summary() ? 1 : 0);
