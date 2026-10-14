// node e2e/detalhes.mjs - GOALS.md section 38d: the details of a prescribed exercise (carga, descanso, observação).
// Signed in as the seeded trainer it fills the three fields in the ficha editor (with the validation messages), saves,
// checks what Firestore holds (the JSON the phone decodes: keys only for what was set), re-opens the ficha, pastes over it
// (and is told the details go), then signs in as the aluno and checks the home card and the log screen: the line
// "Supino — 3x12 · 40kg · descanso 1:30", the note, "Ver vídeo", and that a hostile note stays plain text.
// Needs the same bench as the other scripts (npm run dev:local, or the second bench with E2E_BASE).
import {
  browser,
  check,
  summary,
  sleep,
  reseed,
  uidByEmail,
  fsList,
  fieldValue,
} from "./lib.mjs";

await reseed();
const carla = await uidByEmail("carla@teste.dev");
check("the seeded aluno exists", !!carla);

const NOTE = "Desça devagar. Vídeo: https://youtu.be/abc.";
const HOSTILE =
  "javascript:alert(1) <b>negrito</b> <img src=x onerror=alert(2)>";

const b = await browser("detalhes", "desktop");
const nav = (path) =>
  b.eval(`window.next.router.push(${JSON.stringify(path)}); true`);
const must = async (label, expression, ms = 30000, on = b) => {
  if (!(await on.waitFor(expression, ms)))
    throw new Error(`timed out waiting for: ${label}`);
};
const setField = (selector, value) =>
  b.eval(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)}); if(!e) return false; const proto=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); return true})()`,
  );
const paste = (text) =>
  setField('textarea[aria-label="Texto para importar"]', text);
const clickIn = (selector, label) =>
  b.eval(
    `(()=>{const x=[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => new RegExp(${JSON.stringify(label)}).test(e.textContent.trim())); if(!x) return false; x.click(); return true})()`,
  );
const openDetails = (index) =>
  b.eval(
    `(()=>{const d=document.querySelectorAll('li.review-exercise details.review-details')[${index}]; if(!d) return false; d.open=true; return true})()`,
  );
const summaryText = (index) =>
  b.eval(
    `document.querySelectorAll('li.review-exercise details.review-details summary')[${index}]?.innerText.trim() ?? ''`,
  );
const field = (kind, index) =>
  `li.review-exercise:nth-of-type(${index + 1}) [aria-label^="${kind} ("]`;
const openEditor = async (fichaId) => {
  await nav(
    `/app/fichas/editar/?aluno=${carla}${fichaId ? `&ficha=${fichaId}` : ""}`,
  );
  await must(
    "the editor",
    `location.pathname.startsWith('/app/fichas/editar') && document.body.innerText.includes('Importador Inteligente')`,
  );
  await must(
    "the save button",
    `[...document.querySelectorAll('button')].some((x) => x.textContent.trim() === 'Salvar ficha' && !x.disabled)`,
  );
};
const carlaDocs = async () =>
  (await fsList("workouts")).filter(
    (d) => fieldValue(d.fields?.studentId) === carla,
  );

try {
  check("trainer signs in", (await b.login("treinador@teste.dev")) === "/app/");

  // ---------- 1. the editor: a Detalhes disclosure on every exercise ----------
  await openEditor();
  await paste("Treino A\nSupino 3x12\nAgachamento 4x8");
  await must(
    "two exercises",
    `document.querySelectorAll('li.review-exercise').length === 2`,
    8000,
  );
  check(
    "every exercise has a closed 'Detalhes' disclosure",
    (await b.eval(
      `document.querySelectorAll('li.review-exercise details.review-details:not([open])').length`,
    )) === 2 && (await summaryText(0)) === "Detalhes",
  );
  check(
    "the importer did not say anything was discarded (nothing was filled yet)",
    !(await b.eval(`document.body.innerText.includes('foram descartados')`)),
  );

  await openDetails(0);
  await openDetails(1);
  check(
    "the three fields are there, labelled",
    await b.eval(
      `['Carga', 'Descanso', 'Observação'].every((t) => [...document.querySelectorAll('li.review-exercise:nth-of-type(1) label')].some((l) => l.innerText.trim().startsWith(t)))`,
    ),
  );

  // ---------- 2. validation, in the trainer's words ----------
  await setField(field("Descanso em segundos", 0), "601");
  check(
    "a rest above 600 s is refused where it is typed",
    await b.waitFor(
      `/vai até 600 segundos/.test(document.querySelector('li.review-exercise:nth-of-type(1) .review-details-fields')?.innerText ?? '') && document.querySelector('li.review-exercise:nth-of-type(1) [aria-label^="Descanso"]').getAttribute('aria-invalid') === 'true'`,
      5000,
    ),
  );
  check(
    "and it did not reach the exercise",
    (await summaryText(0)) === "Detalhes",
  );
  await setField(field("Descanso em segundos", 0), "1:30");
  check(
    "'1:30' is refused too (seconds only)",
    await b.waitFor(
      `/Use só números/.test(document.querySelector('li.review-exercise:nth-of-type(1) .review-details-fields')?.innerText ?? '')`,
      5000,
    ),
  );
  await setField(field("Descanso em segundos", 0), "90");
  await setField(field("Carga", 0), "40kg");
  await setField(field("Observação", 0), NOTE);
  check(
    "with valid values the summary says they are filled",
    await b.waitFor(
      `document.querySelectorAll('li.review-exercise details.review-details summary')[0].innerText.trim() === 'Detalhes (preenchidos)'`,
      5000,
    ),
  );
  check(
    "the invalid-state messages are gone",
    !(await b.eval(
      `!!document.querySelector('li.review-exercise:nth-of-type(1) .review-details-fields small[role=alert]')`,
    )),
  );

  await setField(field("Observação", 1), "x".repeat(301));
  await b.eval(
    `document.querySelector('input[placeholder^="Ex: Hipertrofia"]') ? true : false`,
  );
  await setField('input[placeholder^="Ex: Hipertrofia"]', "Com detalhes");
  await clickIn("main button", "^Salvar ficha$");
  await sleep(600);
  const blocked = await b.eval(
    `[...document.querySelectorAll('ul[role=alert] li')].map((l) => l.innerText)`,
  );
  check(
    "a 301-character observação blocks saving, naming the exercise",
    blocked.some((m) =>
      /exercício 2: a observação aceita até 300 caracteres/.test(m),
    ),
    JSON.stringify(blocked),
  );
  check("nothing was written", (await carlaDocs()).length === 0);

  // ---------- 3. saving; what the phone will decode ----------
  await setField(field("Observação", 1), HOSTILE);
  await setField(field("Carga", 1), "   ");
  await clickIn("main button", "^Salvar ficha$");
  check(
    "saving returns to the aluno",
    await b.waitFor(`location.pathname.startsWith('/app/alunos')`, 20000),
  );
  const docs = await carlaDocs();
  check("one treino stored", docs.length === 1);
  const stored = JSON.parse(fieldValue(docs[0]?.fields?.exercisesJson) ?? "[]");
  check(
    "the first exercise carries carga, descanso and observação",
    stored[0]?.weight === "40kg" &&
      stored[0]?.restSeconds === 90 &&
      stored[0]?.notes === NOTE,
    JSON.stringify(stored[0]),
  );
  check(
    "a blank carga is not stored (no key), the note is",
    stored[1] &&
      !("weight" in stored[1]) &&
      !("restSeconds" in stored[1]) &&
      stored[1].notes === HOSTILE,
    JSON.stringify(stored[1]),
  );
  const fichaId = fieldValue(docs[0]?.fields?.ficha?.mapValue?.fields?.id);

  // ---------- 4. editing again: the values come back; pasting over them says they go ----------
  await openEditor(fichaId);
  check(
    "the saved details are back in the editor",
    (await summaryText(0)) === "Detalhes (preenchidos)" &&
      (await b.eval(
        `document.querySelector(${JSON.stringify(field("Carga", 0))}).value`,
      )) === "40kg" &&
      (await b.eval(
        `document.querySelector(${JSON.stringify(field("Descanso em segundos", 0))}).value`,
      )) === "90",
  );
  await paste("Treino A\nRemada 4x10");
  check(
    "pasting over exercises that had details says they were discarded",
    await b.waitFor(
      `document.body.innerText.includes('Os detalhes (carga, descanso e observação) dos exercícios substituídos foram descartados.')`,
      8000,
    ),
  );
  check(
    "and the pasted exercise starts with none",
    (await summaryText(0)) === "Detalhes",
  );
  await nav(`/app/alunos/detalhe/?id=${carla}`);
  await sleep(500);

  // ---------- 5. the aluno ----------
  const a = await browser("detalhes-aluno", "mobile");
  try {
    check(
      "the aluno signs in",
      (await a.login("carla@teste.dev")).startsWith("/aluno"),
    );
    await must("the home", `location.pathname === '/aluno/' && document.body.innerText.includes('Com detalhes')`, 30000, a);
    await a.eval(
      `document.querySelectorAll('details').forEach((d) => (d.open = true)); true`,
    );
    const lines = await a.eval(
      `[...document.querySelectorAll('.workout-card li')].map((li) => li.innerText.replace(/\\n+/g, ' | '))`,
    );
    check(
      "the home line reads 'Supino — 3x12 · 40kg · descanso 1:30'",
      lines[0]?.startsWith("Supino — 3x12 · 40kg · descanso 1:30"),
      JSON.stringify(lines),
    );
    check(
      "the note is under it",
      /Desça devagar\. Vídeo: https:\/\/youtu\.be\/abc\./.test(lines[0] ?? ""),
      lines[0],
    );
    const link = await a.eval(
      `(()=>{const x=document.querySelector('.workout-card li a'); return x ? { text: x.innerText.trim(), href: x.href, target: x.target, rel: x.rel } : null})()`,
    );
    check(
      "'Ver vídeo' opens the link in a new tab without opener",
      link?.text === "Ver vídeo" &&
        link.href === "https://youtu.be/abc" &&
        link.target === "_blank" &&
        /noopener/.test(link.rel),
      JSON.stringify(link),
    );
    check(
      "an exercise without details stays 'Agachamento — 4x8'",
      lines[1]?.startsWith("Agachamento — 4x8") &&
        !/descanso|·/.test((lines[1] ?? "").split("|")[0]),
      lines[1],
    );
    check(
      "the hostile note is text: no second link, no <b>, no <img>",
      (await a.eval(
        `document.querySelectorAll('.workout-card li a').length`,
      )) === 1 &&
        !(await a.eval(
          `!!document.querySelector('.workout-card li b, .workout-card li img')`,
        )) &&
        /negrito/.test(lines[1] ?? ""),
      lines[1],
    );

    await a.eval(
      `document.querySelector('.workout-card a.button').click(); true`,
    );
    await must("the log screen", `location.pathname.startsWith('/aluno/treino') && document.body.innerText.includes('Salvar sessão')`, 30000, a);
    const target = await a.eval(
      `[...document.querySelectorAll('main form fieldset')].map((f) => f.innerText.replace(/\\n+/g, ' | '))`,
    );
    check(
      "the log screen shows the same line and the note under each exercise",
      /Alvo: 3x12 · 40kg · descanso 1:30/.test(target[0] ?? "") &&
        /Desça devagar/.test(target[0] ?? "") &&
        /Alvo: 4x8/.test(target[1] ?? ""),
      JSON.stringify(target),
    );
    check(
      "and the same 'Ver vídeo' link",
      (await a.eval(
        `document.querySelectorAll('main form fieldset a').length`,
      )) === 1,
    );
  } finally {
    a.close();
  }
  console.log(
    "INFO  page errors:",
    [...new Set(b.logs)].slice(0, 4).join(" || ") || "none",
  );
  check(
    "no page errors in the editor",
    !b.logs.some((l) => /exception|Hydration|Warning/.test(l)),
    [...new Set(b.logs)].join(" || "),
  );
} catch (error) {
  check("script completed", false, String(error.message ?? error));
} finally {
  b.close();
}
process.exit(summary() ? 1 : 0);
