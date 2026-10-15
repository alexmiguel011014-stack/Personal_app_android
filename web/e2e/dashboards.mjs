// node e2e/dashboards.mjs — GOALS.md §37 end to end: the trainer's "Hoje" and the ADM's "Visão geral" against the demo seed
// (`reseed({ demo: true })`: eight weeks of training, the platform's own plans and payments, one voided). Every figure is
// recomputed here from the emulator's documents, not from the site's code. Also: the first "Precisa de você" rows on a phone's
// first screen, no sideways scroll, every chart named, the ADM's short bottom-bar labels, no Gemini on the ADM screen.
import { browser, check, summary, reseed, fsList, fieldValue } from "./lib.mjs";

await reseed({ demo: true });

const A = await browser("adm");
const T = await browser("trn");
const MT = await browser("mtrn", "mobile");
const MA = await browser("madm", "mobile");

const TZ = "America/Sao_Paulo";
const day = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(ms);
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const reais = (cents) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\s/g, " ");
const norm = (text) => text.replace(/[\s ]+/g, " ").trim();
const today = day(Date.now());
const month = today.slice(0, 7);

const kpiValues = (b) => b.eval(`[...document.querySelectorAll('.kpi')].map(k=>({label:k.querySelector('.kpi-label')?.innerText.trim(), value:k.querySelector('.kpi-value')?.innerText.replace(/\\s+/g,' ').trim(), change:k.querySelector('.kpi-change')?.innerText.trim()??null, sub:k.querySelector('.kpi-sub')?.innerText.trim()??null, href:k.querySelector('a')?.getAttribute('href')??null}))`);
const noSideScroll = (b) => b.eval(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`);
const unnamedCharts = (b) => b.eval(`[...document.querySelectorAll('main [role=img]')].filter(e=>!(e.getAttribute('aria-label')||'').trim()).length`);
const chartCount = (b) => b.eval(`document.querySelectorAll('main [role=img]').length`);
const firstRowOnFirstScreen = (b) => b.eval(`(()=>{const r=document.querySelector('.attention-row'); if(!r) return null; const nav=document.querySelector('.primary-nav'); const limit=nav?nav.getBoundingClientRect().top:innerHeight; return Math.round(r.getBoundingClientRect().top) < limit - 20;})()`);

try {
  // ---------- the personal's "Hoje" ----------
  check("trainer signs in", (await T.login("treinador@teste.dev")) === "/app/");
  await T.go("/app/", 4500);
  const logs = await fsList("workoutLogs");
  const sessions = new Set(logs.map((d) => `${fieldValue(d.fields.studentId)}|${day(Number(fieldValue(d.fields.date)))}`));
  const days = [...sessions].map((s) => s.split("|")[1]);
  const inWindow = (offset) => days.filter((d) => d >= addDays(today, -offset - 6) && d <= addDays(today, -offset)).length;
  const expectedBars = [7, 6, 5, 4, 3, 2, 1, 0].map((i) => inWindow(i * 7));
  const kpis = await kpiValues(T);
  check("four figures on the trainer's home", kpis.length === 4, kpis.map((k) => k.label).join(" | "));
  const sessionsKpi = kpis.find((k) => /Treinos na semana/.test(k.label ?? ""));
  check("'Treinos na semana' is the sessions of the last 7 days (student × day, not documents)", sessionsKpi?.value === String(expectedBars[7]), `${sessionsKpi?.value} vs ${expectedBars[7]}`);
  const diff = expectedBars[7] - expectedBars[6];
  check("…and says how it moved against the 7 days before, in words", new RegExp(`${diff === 0 ? "Sem mudança" : diff > 0 ? `\\+${diff}` : `−${-diff}`}`).test(sessionsKpi?.change ?? ""), sessionsKpi?.change ?? "");
  const bars = await T.eval(`[...document.querySelectorAll('.bar-chart .bar-value')].map(e=>Number(e.innerText))`);
  check("the eight bars equal the sessions per 7-day window recomputed from the logs", JSON.stringify(bars) === JSON.stringify(expectedBars), `${bars} vs ${expectedBars}`);
  const students = kpis.find((k) => k.label === "Alunos");
  check("'Alunos' counts the six active students, four connected", /^6$/.test(students?.value ?? "") && /4 conectados · 2 aguardando conexão/.test(students?.sub ?? ""), `${students?.value} / ${students?.sub}`);
  const charges = await fsList("payments");
  const received = charges.filter((d) => fieldValue(d.fields.paidAt) !== null && String(day(Number(fieldValue(d.fields.paidAt)))).startsWith(month)).reduce((s, d) => s + Number(fieldValue(d.fields.amountCents)), 0);
  const money = kpis.find((k) => /Mensalidades/.test(k.label ?? ""));
  check("the money card shows what was received this month", norm(money?.value ?? "").includes(norm(reais(received))), `${money?.value} vs ${reais(received)}`);
  check("every figure is a link to its page", kpis.every((k) => k.href?.startsWith("/app/") || k.href?.startsWith("/Personal_app_android/app/")), kpis.map((k) => k.href).join(" "));

  const inbox = await T.eval(`[...document.querySelectorAll('.attention-row')].map(r=>({name:r.querySelector('.attention-name').innerText.trim(), reason:r.querySelector('.attention-reason').innerText.trim(), href:r.querySelector('a')?.getAttribute('href')}))`);
  // GOALS.md §38i added "Anamnese com ponto de atenção": Ana's seeded anamnese (a PAR-Q+ "sim" and a knee injury, 8 days ago) is one this device has not opened.
  check("'Precisa de você' lists late → quiet → assessment → anamnese with a flag, in that order", inbox.map((i) => i.reason).join(" > ") === "Mensalidade em atraso > Sem treinar > Avaliação pendente > Anamnese com ponto de atenção", inbox.map((i) => `${i.name}: ${i.reason}`).join(" | "));
  check("Carla (two days in) and the fresh drafts are not nagged about", !inbox.some((i) => /Carla|Maria|Pedro/.test(i.name)));
  check("the roster and the numbers list left the home", !/Seus alunos|A semana em números|Ver diretório/.test(await T.text()));
  check("every chart on the home has a name", (await unnamedCharts(T)) === 0 && (await chartCount(T)) >= 4, String(await chartCount(T)));
  await T.eval(`(()=>{const a=[...document.querySelectorAll('.attention-row')].find(r=>/Diego/.test(r.innerText)).querySelector('a'); a.click();})()`);
  await T.waitFor(`location.pathname.includes('/app/alunos/detalhe') && /Diego/.test(document.querySelector('main')?.innerText||'')`, 20000);
  check("'Ver aluno' on Diego's row opens his page", /Diego/.test(await T.text("main")), await T.url());

  // ---------- the personal's home on a phone ----------
  await MT.login("treinador@teste.dev");
  await MT.go("/app/", 4500);
  check("phone: no sideways scroll on the trainer's home", await noSideScroll(MT));
  check("phone: the first 'Precisa de você' row is on the first screen", (await firstRowOnFirstScreen(MT)) === true);
  check("phone: every chart is named", (await unnamedCharts(MT)) === 0);

  // ---------- the ADM's overview ----------
  check("ADM signs in", (await A.login("admin@teste.dev")) === "/admin/");
  await A.go("/admin/", 6000);
  const payments = await fsList("platformPayments");
  const paidThisMonth = payments.filter((d) => fieldValue(d.fields.voidedAt) === null && day(Number(fieldValue(d.fields.paidAt))).startsWith(month)).reduce((s, d) => s + Number(fieldValue(d.fields.amountCents)), 0);
  const voidedThisMonth = payments.filter((d) => fieldValue(d.fields.voidedAt) !== null && day(Number(fieldValue(d.fields.paidAt))).startsWith(month)).length;
  const adm = await kpiValues(A);
  check("four figures on the ADM's overview", adm.length === 4, adm.map((k) => k.label).join(" | "));
  const revenue = adm.find((k) => /Recebido/.test(k.label ?? ""));
  check("'Recebido no mês' is the platform payments not voided (the estorno is left out)", voidedThisMonth === 1 && norm(revenue?.value ?? "").startsWith(norm(reais(paidThisMonth))), `${revenue?.value} vs ${reais(paidThisMonth)} (voided this month: ${voidedThisMonth})`);
  const revenueBars = await A.eval(`[...document.querySelectorAll('.bar-chart')].map(c=>c.getAttribute('aria-label'))`);
  check("'Receita por mês' draws six months", (await A.eval(`[...document.querySelectorAll('.bar-chart')].some(c=>c.querySelectorAll('.bar-col').length===6)`)) === true, revenueBars.join(" || ").slice(0, 120));
  const legend = await A.eval(`Object.fromEntries([...document.querySelectorAll('.stack-legend li')].map(li=>[li.querySelector('a,span:not(.swatch)').innerText.trim(), Number(li.querySelector('strong').innerText)]))`);
  await A.go("/admin/mensalidades/", 5000);
  const board = await A.eval(`Object.fromEntries([...document.querySelectorAll('.admin-figure-button')].map(b=>[b.querySelector('.admin-figure-label').innerText.trim(), Number(b.querySelector('.admin-figure-value').innerText)]))`);
  check("the stacked bar's counts equal the Mensalidades board's figures", Object.entries(legend).length > 0 && Object.entries(legend).every(([name, count]) => board[name] === count), `${JSON.stringify(legend)} vs ${JSON.stringify(board)}`);
  await A.go("/admin/", 6000);
  const admInbox = await A.eval(`[...document.querySelectorAll('.attention-row')].map(r=>({name:r.querySelector('.attention-name').innerText.trim(), reason:r.querySelector('.attention-reason').innerText.trim()}))`);
  check("the inbox opens with the pending request, then the late personal", /solicitaç/.test(admInbox[0]?.name ?? "") && admInbox[1]?.reason === "Mensalidade em atraso", admInbox.map((i) => `${i.name}: ${i.reason}`).join(" | "));
  check("a suspended personal is not in the inbox", !admInbox.some((i) => /Suspenso/.test(i.name)));
  const admText = await A.text("main");
  check("no Gemini, no AI Studio on the ADM overview", !/Gemini|AI Studio/i.test(admText));
  check("the audit shows the personal's name, not 'UID'", !/UID /.test(admText) && /Personal Suspenso/.test(admText));
  check("every chart on the overview has a name", (await unnamedCharts(A)) === 0 && (await chartCount(A)) >= 4, String(await chartCount(A)));

  // ---------- the ADM on a phone ----------
  await MA.login("admin@teste.dev");
  await MA.go("/admin/", 6000);
  check("phone: no sideways scroll on the ADM overview", await noSideScroll(MA));
  check("phone: the first inbox row is on the first screen", (await firstRowOnFirstScreen(MA)) === true);
  const navLabels = await MA.eval(`[...document.querySelectorAll('.primary-nav a')].map(a=>({name:a.getAttribute('aria-label')||a.innerText.trim(), shown:[...a.querySelectorAll('span')].filter(s=>getComputedStyle(s).display!=='none'&&s.children.length===0).map(s=>s.innerText.trim()).join(''), clipped:[...a.querySelectorAll('span')].some(s=>s.scrollWidth>s.clientWidth+1)}))`);
  check("phone: the ADM bottom bar writes short labels and keeps the full names for assistive tech", navLabels.some((n) => n.name === "Mensalidades" && n.shown === "Mensal.") && navLabels.some((n) => n.name === "Modelos de plano" && n.shown === "Planos"), JSON.stringify(navLabels));
  check("phone: no bottom-bar label is cut off", navLabels.every((n) => !n.clipped), JSON.stringify(navLabels.filter((n) => n.clipped)));
  check("phone: every chart is named", (await unnamedCharts(MA)) === 0);

  const errors = [...A.logs, ...T.logs, ...MT.logs, ...MA.logs].filter((l) => !/favicon|Failed to load resource/.test(l));
  check("no console errors on either dashboard", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  for (const b of [A, T, MT, MA]) b.close();
}
process.exit(summary() === 0 ? 0 : 1);
