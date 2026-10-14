// node e2e/aluno-home.mjs - GOALS.md section 38f: what the aluno sees. On a 390 px phone, as the seeded alunos:
// "Próximo treino" (the one after the treino trained last in the newest ficha, wrapping round — followed through real
// sessions saved from the log screen), "Esta semana" (seven day dots and the counts, checked against the logs read
// straight from Firestore), "Meus horários" (their own appointments, nothing for an aluno with none), and the charts in
// "Evolução" (the weight and the load, each a role="img" with a sentence, the table one tap away). Needs the same bench as
// the other scripts.
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
const ana = await uidByEmail("ana@teste.dev");
check(
  "the seeded alunos exist",
  !!ana &&
    !!(await uidByEmail("bruno@teste.dev")) &&
    !!(await uidByEmail("carla@teste.dev")),
);

const a = await browser("aluno-home", "mobile");
const must = async (label, expression, ms = 30000) => {
  if (!(await a.waitFor(expression, ms)))
    throw new Error(`timed out waiting for: ${label}`);
};
const nav = (path) =>
  a.eval(`window.next.router.push(${JSON.stringify(path)}); true`);
const home = async () => {
  await nav("/aluno/");
  await must(
    "the home",
    `location.pathname === '/aluno/' && !document.body.innerText.includes('Carregando') && document.body.innerText.includes('Olá,')`,
  );
  await sleep(300);
};
const nextCard = () =>
  a.eval(
    `(() => { const s = document.querySelector('section.next-treino'); return s ? { h2: s.querySelector('h2')?.textContent, name: s.querySelector('h3')?.innerText, text: s.innerText.replace(/\\n+/g, ' | '), href: s.querySelector('a')?.getAttribute('href'), cta: s.querySelector('a')?.innerText.trim() } : null; })()`,
  );
try {
  // ---------- Ana: the home ----------
  check("Ana signs in", (await a.login("ana@teste.dev")).startsWith("/aluno"));
  await home();
  const card = await nextCard();
  check(
    "'Próximo treino' is on top: the treino, its ficha, its size and a 'Começar' button",
    card?.h2 === "Próximo treino" &&
      card.name === "Ficha A" &&
      /Ficha atual · 3 exercícios/.test(card.text) &&
      card.cta === "Começar" &&
      /ficha=ficha-a/.test(card.href ?? ""),
    JSON.stringify(card),
  );
  check(
    "it comes before everything else on the home (after the greeting)",
    await a.eval(
      `(() => { const sections = [...document.querySelectorAll('main > section')].map((s) => s.querySelector('h2')?.textContent); return sections[0] === 'Próximo treino' && sections[1] === 'Esta semana' && sections[2] === 'Meus horários'; })()`,
    ),
  );
  check(
    "the list of fichas is still there below, with 'Registrar treino de hoje'",
    await a.eval(
      `document.querySelectorAll('.ficha-group .workout-card').length === 1 && /Registrar treino de hoje/.test(document.querySelector('.ficha-group').innerText)`,
    ),
  );

  // ---------- Esta semana, against the logs in Firestore ----------
  const zone = await a.eval(`Intl.DateTimeFormat().resolvedOptions().timeZone`);
  const day = (ms) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(ms);
  const trained = new Set(
    (await fsList("workoutLogs"))
      .filter((d) => fieldValue(d.fields?.studentId) === ana)
      .map((d) => day(Number(fieldValue(d.fields?.date)))),
  );
  const todayStr = day(Date.now());
  const shift = (date, days) =>
    new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
      .toISOString()
      .slice(0, 10);
  const weekday = new Date(`${todayStr}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const monday = shift(todayStr, -((weekday + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => shift(monday, i));
  const expectedWeek = week.filter((d) => trained.has(d)).length;
  const expectedMonth = [...trained].filter(
    (d) => d.slice(0, 7) === todayStr.slice(0, 7) && d <= todayStr,
  ).length;
  const dots = await a.eval(
    `[...document.querySelectorAll('.week-dots li')].map((li) => ({ label: li.querySelector('.day-label').innerText, state: li.dataset.state, name: li.innerText.replace(/\\n+/g, '') }))`,
  );
  check(
    "seven dots, Seg to Dom",
    dots.map((d) => d.label).join(",") === "Seg,Ter,Qua,Qui,Sex,Sáb,Dom",
    JSON.stringify(dots),
  );
  check(
    "the dots show the days Ana trained this week, today and what is still ahead",
    dots.every(
      (d, i) =>
        d.state ===
        (trained.has(week[i])
          ? "done"
          : week[i] === todayStr
            ? "today"
            : week[i] < todayStr
              ? "missed"
              : "future"),
    ),
    JSON.stringify(dots.map((d) => d.state)),
  );
  check(
    "a screen reader hears the day and what happened ('Ter: treinou')",
    dots.every((d, i) => !trained.has(week[i]) || /: treinou$/.test(d.name)),
    JSON.stringify(dots.map((d) => d.name)),
  );
  const sentence = await a.eval(
    `document.querySelector('section.week p').innerText`,
  );
  const plural = expectedWeek === 1 ? "treino" : "treinos";
  check(
    "the sentence counts this week and this month the way the logs say",
    sentence ===
      `${expectedWeek} ${plural} esta semana · ${expectedMonth} no mês`,
    `${sentence} (expected ${expectedWeek} / ${expectedMonth})`,
  );

  // ---------- Meus horários ----------
  const hours = await a.eval(
    `document.querySelector('section.appointments')?.innerText.replace(/\\n+/g, ' | ')`,
  );
  check(
    "Ana's appointments read 'Seg, Qua, Sex · 07:00'",
    hours === "Meus horários | Seg, Qua, Sex · 07:00",
    hours,
  );

  // ---------- Evolução: the charts ----------
  await nav("/aluno/evolucao/");
  await must(
    "Evolução",
    `document.body.innerText.includes('Progressão de carga') && document.body.innerText.includes('Minhas avaliações') && !document.body.innerText.includes('Carregando')`,
  );
  await sleep(300);
  const charts = await a.eval(
    `[...document.querySelectorAll('svg[role=img]')].map((s) => s.getAttribute('aria-label'))`,
  );
  check(
    "the weight is a line with a sentence: trend, first, last and best",
    charts.some((c) =>
      /^Peso: estável, de 74,2 kg \(\d\d\/\d\d\) a 73,1 kg \(\d\d\/\d\d\); melhor 74,2 kg em \d\d\/\d\d; 2 registros\.$/.test(
        c,
      ),
    ),
    JSON.stringify(charts),
  );
  check(
    "so is the load of the first exercise",
    charts.some((c) =>
      /^Maior carga de Agachamento: subindo, de 20 kg \(\d\d\/\d\d\) a 31 kg \(\d\d\/\d\d\); melhor 31 kg em \d\d\/\d\d; 6 registros\.$/.test(
        c,
      ),
    ),
    JSON.stringify(charts),
  );
  const captions = await a.eval(
    `[...document.querySelectorAll('figure.line-chart figcaption')].map((c) => c.innerText.trim())`,
  );
  check(
    "the numbers are also plain text under each chart",
    captions.includes("Primeiro 74,2 kg · Último 73,1 kg · Melhor 74,2 kg") &&
      captions.includes("Primeiro 20 kg · Último 31 kg · Melhor 31 kg"),
    JSON.stringify(captions),
  );
  check(
    "the tables are still there, one tap away (closed, with 'Ver em tabela')",
    await a.eval(
      `(() => { const d = [...document.querySelectorAll('details.chart-table')]; const load = d.find((x) => /Ver em tabela/.test(x.querySelector('summary').innerText)); return !!load && !load.open && load.querySelectorAll('tbody tr').length === 6 && d.some((x) => /Ver todas as medidas/.test(x.querySelector('summary').innerText) && !x.open && x.querySelectorAll('li').length === 2); })()`,
    ),
  );
  check(
    "the measurement form is behind 'Registrar medida' and starts closed",
    await a.eval(
      `(() => { const d = [...document.querySelectorAll('details.chart-table')].find((x) => x.querySelector('summary').innerText.trim() === 'Registrar medida'); return !!d && !d.open && !!d.querySelector('input'); })()`,
    ),
  );
  await a.eval(
    `const s = document.querySelector('select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'Supino'); s.dispatchEvent(new Event('change', { bubbles: true })); true`,
  );
  check(
    "picking another exercise redraws the chart with its own sentence",
    await a.waitFor(
      `[...document.querySelectorAll('svg[role=img]')].some((s) => /^Maior carga de Supino: /.test(s.getAttribute('aria-label')))`,
      5000,
    ),
  );
  const lineHeights = await a.eval(
    `[...document.querySelectorAll('figure.line-chart svg')].map((s) => Math.round(s.getBoundingClientRect().height))`,
  );
  check(
    "a chart is a readable size on a phone (not a thin strip)",
    lineHeights.length === 2 && lineHeights.every((h) => h >= 80),
    JSON.stringify(lineHeights),
  );
  console.log(
    "INFO  Evolução height at 390 px:",
    await a.eval(`document.documentElement.scrollHeight`),
    "px (2,765 before §38c)",
  );

  // ---------- Carla: no ficha, no appointments ----------
  const carla = await browser("aluno-home-carla", "mobile");
  try {
    await carla.login("carla@teste.dev");
    await carla.waitFor(
      `document.body.innerText.includes('Olá,') && !document.body.innerText.includes('Carregando')`,
      20000,
    );
    check(
      "an aluno with no ficha has no 'Próximo treino', no week and no appointments — just the empty note",
      await carla.eval(
        `!document.querySelector('section.next-treino') && !document.querySelector('section.week') && !document.querySelector('section.appointments') && /Seu personal ainda não montou sua ficha/.test(document.body.innerText)`,
      ),
    );
  } finally {
    carla.close();
  }
} catch (error) {
  check("script completed", false, String(error.message ?? error));
}

// ---------- Bruno: the next treino follows his real sessions ----------
const b = await browser("aluno-home-bruno", "mobile");
const bnav = (path) =>
  b.eval(`window.next.router.push(${JSON.stringify(path)}); true`);
const bmust = async (label, expression, ms = 30000) => {
  if (!(await b.waitFor(expression, ms)))
    throw new Error(`timed out waiting for: ${label}`);
};
const bcard = async () => {
  await bnav("/aluno/");
  await bmust(
    "the home",
    `location.pathname === '/aluno/' && !!document.querySelector('section.next-treino')`,
  );
  await sleep(300);
  return b.eval(
    `document.querySelector('section.next-treino').innerText.replace(/\\n+/g, ' | ')`,
  );
};
const bLog = async (treinoId) => {
  await bnav(`/aluno/treino/?ficha=${treinoId}`);
  await bmust(
    "the log form",
    `document.body.innerText.includes('Salvar sessão')`,
  );
  await b.eval(
    `(() => { const e = document.querySelectorAll('main form fieldset')[0].querySelectorAll('input'); for (const [i, v] of [[0, '20'], [1, '10']]) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e[i], v); e[i].dispatchEvent(new Event('input', { bubbles: true })); } return true; })()`,
  );
  await b.eval(
    `[...document.querySelectorAll('main form button')].find((x) => x.textContent.trim() === 'Salvar sessão').click(); true`,
  );
  await bmust(
    "saved",
    `document.body.innerText.includes('Treino registrado')`,
    20000,
  );
};
try {
  check(
    "Bruno signs in",
    (await b.login("bruno@teste.dev")).startsWith("/aluno"),
  );
  const first = await bcard();
  check(
    "with no log in his newest ficha it starts at the first treino (a log of a treino that is not there changes nothing)",
    /Definição — outubro · 3 exercícios/.test(first) &&
      /Treino A — Superiores/.test(first) &&
      !/depois do/.test(first),
    first,
  );
  await bLog("bruno-def-a");
  const second = await bcard();
  check(
    "after Treino A the next is Treino B, and it says so",
    /Treino B — Inferiores/.test(second) &&
      /depois do Treino A — Superiores/.test(second),
    second,
  );
  await bLog("bruno-def-b");
  const third = await bcard();
  check(
    "after the last treino it wraps round to the first",
    /Treino A — Superiores/.test(third) &&
      /depois do Treino B — Inferiores/.test(third),
    third,
  );
  const bh = await b.eval(
    `document.querySelector('section.appointments')?.innerText.replace(/\\n+/g, ' | ')`,
  );
  check(
    "Bruno's appointments read 'Ter, Qui · 18:00'",
    bh === "Meus horários | Ter, Qui · 18:00",
    bh,
  );
} catch (error) {
  check("Bruno's part completed", false, String(error.message ?? error));
} finally {
  b.close();
}

check("no page errors", a.logs.length === 0, [...new Set(a.logs)].join(" || "));
a.close();
process.exit(summary() ? 1 : 0);
