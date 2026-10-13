// node e2e/read-budget.mjs [--report] - GOALS.md section 38b: what each page costs in Firestore reads on the Spark
// plan (50,000 a day for the whole project), measured on the "heavy year" fixture (one personal, 20 alunos, a year
// of training: npm run seed:emulators -- --heavy). The site tallies the documents every read returns in
// window.__alluReads (data/firestoreRead.ts, emulators only). Signed in as the heavy personal (desktop) and as one
// of their alunos (phone) it opens each page the way a person would - in-app navigation, one tab - and fails when a
// page reads more than its ceiling below. --report prints the table without failing. Needs `npm run dev:local`.
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { browser, check, summary, sleep, uidByEmail } from "./lib.mjs";

const REPORT_ONLY = process.argv.includes("--report");
const QUOTA = 50_000;

// Ceilings per page on the heavy fixture (GOALS.md §38b, measured 2026-10-13 with headroom). "first" is the page a
// session opens on — on the first visit of a month it also creates the month's charges and reads the snapshot a
// second time; the others are visits later in the same session. The old all-time load cost 19,061 on each page.
const CEILING = {
  trainer: { first: 5_000, later: 150, registros: 400, aluno: 300 },
  student: { first: 300, later: 50 },
};
// What the modelled day below may cost before the check fails: 30% of the project's daily quota for one personal
// with 20 alunos all training three times a week. The all-time load modelled at about 365,000.
const DAY_CEILING = 15_000;

execSync("npm run seed:emulators -- --heavy", { cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: "ignore" });
const heavyStudent = await uidByEmail("pesado01@teste.dev");
check("the heavy fixture is seeded", !!heavyStudent);

const total = (tally) => Object.values(tally ?? {}).reduce((sum, n) => sum + n, 0);
const rows = [];

async function measure(b, area, page, ceiling, open) {
  await b.eval("window.__alluReads = {}; true");
  await open();
  await b.waitFor(`!document.body.innerText.includes('Carregando')`, 60000);
  await sleep(2500);
  const tally = await b.eval("window.__alluReads ?? {}");
  const reads = total(tally);
  rows.push({ area, page, reads, ceiling, tally });
  if (!REPORT_ONLY) check(`${area} · ${page}: ${reads} reads <= ${ceiling}`, reads <= ceiling, JSON.stringify(tally));
  return reads;
}
const nav = (b, path) => () => b.eval(`window.next.router.push(${JSON.stringify(path)}); true`);

// ---------- the personal, desktop ----------
const trainer = await browser("budget-trainer", "desktop");
await trainer.go("/entrar/", 1800);
const trainerFirst = await measure(trainer, "personal", "Hoje (abre a sessão)", CEILING.trainer.first, () => trainer.login("pesado@teste.dev"));
const later = [];
for (const [page, path, ceiling] of [
  ["Alunos", "/app/alunos/", CEILING.trainer.later],
  ["Agenda", "/app/agenda/", CEILING.trainer.later],
  ["Mensalidades", "/app/mensalidades/", CEILING.trainer.later],
  ["Registros", "/app/registros/", CEILING.trainer.registros],
  ["Página do aluno", `/app/alunos/detalhe/?id=${heavyStudent}`, CEILING.trainer.aluno],
  ["Hoje (de novo)", "/app/", CEILING.trainer.later],
]) {
  later.push(await measure(trainer, "personal", page, ceiling, nav(trainer, path)));
}
trainer.close();

// ---------- the aluno, phone ----------
const student = await browser("budget-student", "mobile");
await student.go("/entrar/", 1800);
const studentFirst = await measure(student, "aluno", "Fichas (abre a sessão)", CEILING.student.first, () => student.login("pesado01@teste.dev"));
const studentLater = [];
for (const [page, path] of [
  ["Evolução", "/aluno/evolucao/"],
  ["Fichas (de novo)", "/aluno/"],
  ["Conta", "/aluno/conta/"],
]) {
  studentLater.push(await measure(student, "aluno", page, CEILING.student.later, nav(student, path)));
}
student.close();

// ---------- the modelled day (GOALS.md §38b, D15) ----------
// The personal opens the site twice and visits 14 more pages; each of the 20 alunos opens it once and visits 3.
const avg = (list) => (list.length === 0 ? 0 : list.reduce((a, b) => a + b, 0) / list.length);
const day = 2 * trainerFirst + 14 * avg(later) + 20 * (studentFirst + 3 * avg(studentLater));

console.log("\nReads per page (heavy fixture):");
for (const row of rows) console.log(`  ${row.area.padEnd(8)} ${row.page.padEnd(24)} ${String(row.reads).padStart(6)}   (teto ${row.ceiling})  ${JSON.stringify(row.tally)}`);
console.log(`\nModelled day for this personal and their 20 alunos: ${Math.round(day)} reads = ${((100 * day) / QUOTA).toFixed(1)}% of the project's ${QUOTA} a day.`);
console.log(`That is room for about ${Math.floor(QUOTA / day)} personais this busy in one project.`);
if (REPORT_ONLY) process.exit(0);
check(`the modelled day: ${Math.round(day)} reads <= ${DAY_CEILING}`, day <= DAY_CEILING);
process.exit(summary() > 0 ? 1 : 0);
