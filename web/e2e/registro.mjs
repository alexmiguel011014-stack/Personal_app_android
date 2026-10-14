// node e2e/registro.mjs - GOALS.md section 38e: the log screen. Signed in as the seeded aluno on a 390 px phone it checks
// the compact rows (one header per exercise, no label on every row, controls >= 44 px), "Última vez" and the row
// placeholders from the logs already in memory, "Repetir a última", the post-save summary with "Recordes", and the rest
// timer (start, +15 s / -15 s, cancel, and the end: beep + vibration, faked in the page so they can be counted).
// Firestore (REST) is read after the save. Needs the same bench as the other scripts.
import {
  browser,
  check,
  summary,
  sleep,
  reseed,
  uidByEmail,
  fsList,
  fieldValue,
  fsPatch,
} from "./lib.mjs";

await reseed();
const ana = await uidByEmail("ana@teste.dev");
check("the seeded aluno exists", !!ana);

// Remada gets a two-second rest so the END of the timer can be watched without waiting a minute.
const EXERCISES = [
  { name: "Supino", sets: 3, reps: "12" },
  { name: "Remada", sets: 3, reps: "12", restSeconds: 2 },
  { name: "Agachamento", sets: 4, reps: "10", weight: "40kg" },
];
check(
  "a two-second rest was planted on Remada",
  await fsPatch("workouts/ficha-a", {
    exercisesJson: { stringValue: JSON.stringify(EXERCISES) },
  }),
);

const a = await browser("registro", "mobile");
const field = (fieldset, index) =>
  `document.querySelectorAll('main form fieldset')[${fieldset}].querySelectorAll('input')[${index}]`;
const type = (fieldset, index, value) =>
  a.eval(
    `(() => { const e = ${field(fieldset, index)}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
  );
const valueOf = (fieldset, index) => a.eval(`${field(fieldset, index)}.value`);
const placeholderOf = (fieldset, index) =>
  a.eval(`${field(fieldset, index)}.placeholder`);
const clickIn = (fieldset, label) =>
  a.eval(
    `(() => { const b = [...document.querySelectorAll('main form fieldset')[${fieldset}].querySelectorAll('button')].find((x) => new RegExp(${JSON.stringify(label)}).test(x.textContent.trim())); if (!b) return false; b.click(); return true; })()`,
  );
const chipText = () =>
  a.eval(
    `document.querySelector('.rest-chip')?.innerText.replace(/\\n+/g, ' | ') ?? ''`,
  );
const must = async (label, expression, ms = 30000) => {
  if (!(await a.waitFor(expression, ms)))
    throw new Error(`timed out waiting for: ${label}`);
};

try {
  check("Ana signs in", (await a.login("ana@teste.dev")).startsWith("/aluno"));
  await a.go("/aluno/treino/?ficha=ficha-a", 3000);
  await must(
    "the log form",
    `document.body.innerText.includes('Salvar sessão') && document.querySelectorAll('main form fieldset').length === 3`,
  );

  // ---------- compact rows ----------
  check(
    "one 'Série · Peso · Reps' header per exercise",
    (await a.eval(
      `document.querySelectorAll('main form fieldset .set-head').length`,
    )) === 3,
  );
  check(
    "no visible label on every row (the header says it once)",
    (await a.eval(
      `document.querySelectorAll('main form fieldset label').length`,
    )) === 0,
  );
  const sizes = await a.eval(
    `[...document.querySelectorAll('main form fieldset .set-row input')].map((i) => ({ h: Math.round(i.getBoundingClientRect().height), f: parseFloat(getComputedStyle(i).fontSize), n: i.getAttribute('aria-label') }))`,
  );
  check(
    "every input is at least 44 px tall with 16 px text, and keeps its accessible name",
    sizes.length === 20 &&
      sizes.every(
        (s) => s.h >= 44 && s.f >= 16 && /^(Peso|Reps) da série \d+$/.test(s.n),
      ),
    JSON.stringify(sizes.slice(0, 2)),
  );
  const rowStep = await a.eval(
    `(() => { const r = [...document.querySelectorAll('main form fieldset')[0].querySelectorAll('.set-row')].map((x) => x.getBoundingClientRect()); return Math.round(r[1].top - r[0].top); })()`,
  );
  check(
    "a set row takes about 48 px (it took about 82 with a label on top of each input)",
    rowStep >= 44 && rowStep <= 52,
    `${rowStep}px`,
  );
  console.log(
    "INFO  page height at 390 px:",
    await a.eval(`document.documentElement.scrollHeight`),
    "px (it was 1,573 before 38e, without the new lines)",
  );

  // ---------- "Última vez" and the placeholders ----------
  const lasts = await a.eval(
    `[...document.querySelectorAll('main form fieldset .exercise-last')].map((p) => p.innerText.trim())`,
  );
  check(
    "each exercise shows 'Última vez (dd/mm): 31×12 · 33,5×10' from the logs in memory",
    lasts.length === 3 &&
      lasts.every((l) =>
        /^Última vez \(\d\d\/\d\d\): 31×12 · 33,5×10$/.test(l),
      ),
    JSON.stringify(lasts),
  );
  check(
    "row 1 hints last time's 31 × 12 and row 2 its 33,5 × 10",
    (await placeholderOf(0, 0)) === "31" &&
      (await placeholderOf(0, 1)) === "12" &&
      (await placeholderOf(0, 2)) === "33,5" &&
      (await placeholderOf(0, 3)) === "10",
  );
  check(
    "a row last time did not have hints the prescribed carga (Agachamento, 40kg) — or nothing",
    (await placeholderOf(2, 4)) === "40kg" &&
      (await placeholderOf(0, 4)) === "",
  );
  check(
    "a hint is not a value: every field is empty and 'Salvar sessão' is disabled",
    (await valueOf(0, 0)) === "" &&
      (await a.eval(
        `[...document.querySelectorAll('main form button')].find((b) => b.textContent.trim() === 'Salvar sessão').disabled`,
      )),
  );

  // ---------- Repetir a última ----------
  check(
    "'Repetir a última' is offered",
    await clickIn(0, "^Repetir a última$"),
  );
  await sleep(300);
  check(
    "it fills each set in its own row (the comma weight as it was written)",
    (await valueOf(0, 0)) === "31" &&
      (await valueOf(0, 1)) === "12" &&
      (await valueOf(0, 2)) === "33,5" &&
      (await valueOf(0, 3)) === "10" &&
      (await valueOf(0, 4)) === "" &&
      (await valueOf(0, 5)) === "",
  );
  check(
    "and only that exercise's rows",
    (await valueOf(1, 0)) === "" && (await valueOf(2, 0)) === "",
  );
  await type(0, 4, "200");
  await type(0, 5, "5");

  // ---------- save: summary and records ----------
  check(
    "'Salvar sessão' is enabled now",
    await a.eval(
      `![...document.querySelectorAll('main form button')].find((b) => b.textContent.trim() === 'Salvar sessão').disabled`,
    ),
  );
  await a.eval(
    `[...document.querySelectorAll('main form button')].find((b) => b.textContent.trim() === 'Salvar sessão').click(); true`,
  );
  await must(
    "saved",
    `document.body.innerText.includes('Treino registrado')`,
    20000,
  );
  const done = await a.text("main");
  check(
    "the summary counts exercises and sets",
    /1 exercício · 3 séries/.test(done),
    done,
  );
  check(
    "it names the record: the heaviest set ever logged, and what it beat",
    /Recordes/.test(done) && /Supino: 200kg × 5 — antes, 33,5kg/.test(done),
    done,
  );
  const logs = (await fsList("workoutLogs")).filter(
    (d) =>
      fieldValue(d.fields?.studentId) === ana &&
      Date.now() - Number(fieldValue(d.fields?.date)) < 3_600_000,
  );
  const stored = JSON.parse(
    fieldValue(logs[0]?.fields?.performedSetsJson) ?? "[]",
  );
  check(
    "Firestore: one new log for Supino, comma decimal stored with a dot as before",
    logs.length === 1 &&
      fieldValue(logs[0].fields.exerciseName) === "Supino" &&
      stored.map((s) => `${s.weight}x${s.reps}`).join(" ") ===
        "31x12 33.5x10 200x5",
    JSON.stringify(stored),
  );

  // ---------- the rest timer ----------
  await a.go("/aluno/treino/?ficha=ficha-a", 3000);
  await must(
    "the log form again",
    `document.body.innerText.includes('Salvar sessão') && document.querySelectorAll('main form fieldset').length === 3`,
  );
  await a.eval(`window.__vibrations = []; navigator.vibrate = (pattern) => { window.__vibrations.push(pattern); return true; };
    window.__oscillators = 0;
    window.AudioContext = class { constructor() { this.currentTime = 0; this.destination = {}; } resume() { return Promise.resolve(); } createGain() { return { gain: { value: 0 }, connect() {} }; } createOscillator() { window.__oscillators++; return { type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} }; } };
    true`);
  check(
    "each exercise has a 'Descansar' button: its prescribed rest, else 1:30",
    (await a.eval(
      `[...document.querySelectorAll('main form fieldset')].map((f) => [...f.querySelectorAll('.exercise-tools button')].pop().textContent.trim()).join('|')`,
    )) === "Descansar 1:30|Descansar 0:02|Descansar 1:30",
  );
  check("no timer before one is started", (await chipText()) === "");
  check(
    "tapping 'Descansar' starts the countdown",
    await clickIn(0, "^Descansar 1:30$"),
  );
  await must("the chip", `!!document.querySelector('.rest-chip')`, 5000);
  check(
    "the chip shows the time left and the exercise",
    /^1:(30|29|28) \| Supino/.test(await chipText()),
    await chipText(),
  );
  check(
    "the chip sits in the sticky bar, above 'Salvar sessão'",
    await a.eval(
      `(() => { const bar = document.querySelector('.sticky-actions'); return bar.firstElementChild.classList.contains('rest-chip') && bar.lastElementChild.textContent.trim() === 'Salvar sessão'; })()`,
    ),
  );
  await a.eval(
    `document.querySelector('.rest-chip button[aria-label="Mais 15 segundos"]').click(); true`,
  );
  await sleep(400);
  check(
    "'+15 s' moves the end by 15 seconds",
    /^1:(4[0-5]) /.test(await chipText()),
    await chipText(),
  );
  await a.eval(
    `document.querySelector('.rest-chip button[aria-label="Menos 15 segundos"]').click(); document.querySelector('.rest-chip button[aria-label="Menos 15 segundos"]').click(); true`,
  );
  await sleep(400);
  check(
    "'−15 s' twice takes 30 seconds off",
    /^1:(1[0-5]) /.test(await chipText()),
    await chipText(),
  );
  const controls = await a.eval(
    `[...document.querySelectorAll('.rest-chip button')].map((b) => Math.round(b.getBoundingClientRect().height))`,
  );
  check(
    "the chip's buttons are at least 44 px tall",
    controls.length === 3 && controls.every((h) => h >= 44),
    JSON.stringify(controls),
  );
  await a.eval(
    `[...document.querySelectorAll('.rest-chip button')].find((b) => b.textContent.trim() === 'Cancelar').click(); true`,
  );
  await sleep(300);
  check(
    "'Cancelar' removes it, and nothing beeped",
    (await chipText()) === "" &&
      (await a.eval(`window.__oscillators`)) === 0 &&
      (await a.eval(`window.__vibrations.length`)) === 0,
  );

  check(
    "a two-second rest: tap 'Descansar 0:02'",
    await clickIn(1, "^Descansar 0:02$"),
  );
  await must(
    "the end of the rest",
    `!!document.querySelector('.rest-chip.is-over')`,
    8000,
  );
  check(
    "at the end the chip says so",
    /^Descanso terminou \| Remada/.test(await chipText()),
    await chipText(),
  );
  check(
    "it vibrated once and played three beeps",
    (await a.eval(`window.__vibrations.length`)) === 1 &&
      (await a.eval(`window.__oscillators`)) === 3,
    `${await a.eval(`window.__vibrations.length`)} / ${await a.eval(`window.__oscillators`)}`,
  );
  check(
    "only 'Fechar' is left (no +15 s on a finished rest)",
    (await a.eval(
      `[...document.querySelectorAll('.rest-chip button')].map((b) => b.textContent.trim()).join('|')`,
    )) === "Fechar",
  );
  await sleep(1200);
  check(
    "it does not keep beeping while it waits to be closed",
    (await a.eval(`window.__oscillators`)) === 3 &&
      (await a.eval(`window.__vibrations.length`)) === 1,
  );
  await a.eval(
    `[...document.querySelectorAll('.rest-chip button')].find((b) => b.textContent.trim() === 'Fechar').click(); true`,
  );
  await sleep(300);
  check("'Fechar' removes it", (await chipText()) === "");
  check(
    "a second rest can start after one finished",
    (await clickIn(1, "^Descansar 0:02$")) &&
      (await a.waitFor(
        `!!document.querySelector('.rest-chip.is-over')`,
        8000,
      )) &&
      (await a.eval(`window.__oscillators`)) === 6,
  );

  check(
    "no page errors",
    a.logs.length === 0,
    [...new Set(a.logs)].join(" || "),
  );
} catch (error) {
  check("script completed", false, String(error.message ?? error));
} finally {
  a.close();
}
process.exit(summary() ? 1 : 0);
