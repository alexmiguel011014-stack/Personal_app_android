// node e2e/mensalidades.mjs — GOALS.md §35 end to end through the UI: plans built from zero (no reason box, no default-trial
// card, no trial student cap), the Mensalidades list and its states, "Marcar como pago", the estorno, and the trainer's lock
// and unlock. Replaces the old invoice-driven billing script. Time passing is simulated by writing a past expiry straight
// into the emulator, as the site has no clock job.
import { browser, check, summary, sleep, reseed, uidByEmail, fsGet, fsList, fsPatch, fieldValue } from "./lib.mjs";

await reseed();
const TRAINER = "treinador@teste.dev";
const tid = await uidByEmail(TRAINER);
check("seeded trainer found", !!tid, tid ?? "");

const A = await browser("adm");
const T = await browser("trn");
const M = await browser("mob", "mobile");

const setValue = (b, scope, label, value) => b.eval(`(()=>{const l=[...document.querySelectorAll(${JSON.stringify(scope)} + ' label')].find(x=>x.innerText.trim().startsWith(${JSON.stringify(label)})); const e=l&&l.querySelector('input,select'); if(!e) return false; const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true;})()`);
const choose = (b, scope, label, optionStart) => b.eval(`(()=>{const l=[...document.querySelectorAll(${JSON.stringify(scope)} + ' label')].find(x=>x.innerText.trim().startsWith(${JSON.stringify(label)})); const s=l&&l.querySelector('select'); const o=s&&[...s.options].find(o=>o.text.startsWith(${JSON.stringify(optionStart)})); if(!o) return false; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,o.value); s.dispatchEvent(new Event('change',{bubbles:true})); return true;})()`);
const clickIn = (b, scope, re) => b.eval(`(()=>{const x=[...document.querySelectorAll(${JSON.stringify(scope)} + ' button')].find(x=>new RegExp(${JSON.stringify(re)},'i').test(x.textContent)); if(!x) return false; x.click(); return true;})()`);
const notices = (b) => b.eval(`[...document.querySelectorAll('main [role=status], main [role=alert]')].map(e=>e.innerText.trim()).filter(Boolean)`);
const rowText = (b, name) => b.eval(`(()=>{const r=[...document.querySelectorAll('main table tbody tr')].find(r=>r.innerText.includes(${JSON.stringify(name)})); return r?r.innerText.replace(/\\s+/g,' ').trim():null;})()`);
const clickRow = (b, name, re) => b.eval(`(()=>{const r=[...document.querySelectorAll('main table tbody tr')].find(r=>r.innerText.includes(${JSON.stringify(name)})); const x=r&&[...r.querySelectorAll('button')].find(x=>new RegExp(${JSON.stringify(re)},'i').test(x.textContent)); if(!x) return false; x.click(); return true;})()`);
const userField = async (uid, key) => fieldValue((await fsGet(`users/${uid}`))?.fields?.[key]);
const addMonths = (date, n) => { const [y, m, d] = date.split("-").map(Number); const i = y * 12 + (m - 1) + n; const ty = Math.floor(i / 12), tm = (i % 12) + 1; const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate(); return `${ty}-${String(tm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`; };
const saoPauloDate = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(ms);
const loaded = (b) => b.waitFor(`/Mensalidades/.test(document.querySelector('main h1')?.innerText||'') && !/Carregando/.test(document.querySelector('main')?.innerText||'')`, 30000);

try {
  check("ADM signs in", (await A.login("admin@teste.dev")) === "/admin/");

  // ---- Modelos de plano: six fields, nothing else ----
  await A.go("/admin/planos/", 3000);
  const planosText = await A.text();
  check("the default-trial card is gone", !/Padrão do teste|Plano padrão/.test(planosText));
  await A.click("Novo plano"); await sleep(600);
  const formText = await A.text("main form");
  check("the plan form has no reason box and no trial student cap", !/Motivo da alteração/.test(formText) && !/durante o teste/.test(formText), formText.slice(0, 200));
  check("the plan form asks for the six plan fields", ["Nome do plano", "Mensalidade (R$)", "Alunos incluídos", "Adicional mensal por aluno excedente", "Máximo de códigos de convite ativos", "Período de teste (dias)"].every((l) => formText.includes(l)), formText.slice(0, 300));
  for (const [name, trial] of [["Plano sem teste", "0"], ["Plano com teste", "7"]]) {
    await A.click("Novo plano"); await sleep(400);
    const values = [["Nome do plano", name], ["Mensalidade (R$)", "49,90"], ["Alunos incluídos", "2"], ["Adicional mensal por aluno excedente", "6,50"], ["Máximo de códigos de convite ativos", "3"], ["Período de teste", trial]];
    for (const [label, value] of values) await setValue(A, "main form", label, value);
    await A.eval(`document.querySelector('main form button[type=submit]').click()`); await sleep(2500);
    check(`"${name}" is saved as version 1`, (await notices(A)).some((t) => new RegExp(`${name}.*versão 1`).test(t)), (await notices(A)).join(" | "));
  }
  check("the cards show the trial as 'Sem teste' / 'N dias de teste'", /Sem teste/.test(await A.text()) && /7 dias de teste/.test(await A.text()));

  // ---- two more trainers, created from the UI, start with no plan ----
  for (const [name, email] of [["Treinadora Sem Teste", "mensal.a@gmail.com"], ["Treinador Com Teste", "mensal.b@gmail.com"]]) {
    await A.go("/admin/personais/novo/", 2500);
    await setValue(A, "main form", "Nome", name);
    await setValue(A, "main form", "E-mail", email);
    await A.eval(`document.querySelector('main form button[type=submit]').click()`);
    await A.waitFor(`/Acesso criado/.test(document.body.innerText)`, 20000);
  }

  // ---- the list ----
  await A.go("/admin/mensalidades/", 2500); await loaded(A);
  const list = await A.text();
  check("Mensalidades shows the six state figures and the table", ["Em atraso", "Vence em breve", "Aguardando pagamento", "Em teste", "Em dia", "Sem plano"].every((s) => list.includes(s)) && (await A.eval(`!!document.querySelector('main table')`)));
  check("a trainer without a plan says 'Sem plano' and offers 'Cadastrar plano'", /Sem plano/.test((await rowText(A, "Treinadora Sem Teste")) ?? "") && /Cadastrar plano/.test((await rowText(A, "Treinadora Sem Teste")) ?? ""), (await rowText(A, "Treinadora Sem Teste")) ?? "no row");

  // plan without trial → waits for the first payment
  await clickRow(A, "Treinadora Sem Teste", "Cadastrar plano"); await sleep(600);
  await choose(A, "dialog[open]", "Plano", "Plano sem teste"); await sleep(300);
  check("the dialog says there is no trial and the access starts after the first payment", /depois do primeiro pagamento/.test(await A.text("dialog[open]")), await A.text("dialog[open]"));
  await clickIn(A, "dialog[open]", "^Cadastrar plano$"); await sleep(3000);
  const a1 = (await rowText(A, "Treinadora Sem Teste")) ?? "";
  check("a 0-day plan leaves the trainer 'Aguardando pagamento' with a pay button", /Aguardando pagamento/.test(a1) && /Marcar como pago/.test(a1), a1);

  // plan with a trial → free trial counted down
  await clickRow(A, "Treinador Com Teste", "Cadastrar plano"); await sleep(600);
  await choose(A, "dialog[open]", "Plano", "Plano com teste"); await sleep(300);
  check("the dialog announces a 7-day free trial", /Teste grátis de 7 dias/.test(await A.text("dialog[open]")), await A.text("dialog[open]"));
  await clickIn(A, "dialog[open]", "^Cadastrar plano$"); await sleep(3000);
  const b1 = (await rowText(A, "Treinador Com Teste")) ?? "";
  check("a 7-day plan shows 'Em teste' with the days left", /Em teste/.test(b1) && /(6|7) dias restantes/.test(b1), b1);
  const bUid = (await fsList("users")).find((d) => d.fields?.email?.stringValue === "mensal.b@gmail.com")?.name.split("/").pop();
  check("the trial does not cap students: the plan has no trial cap field", !(await fsGet(`platformSubscriptions/${bUid}`))?.fields?.terms?.mapValue?.fields?.trialMaxStudentSeats);

  // ---- Marcar como pago: during the trial, counted from the trial's end ----
  const trialEnd = Number(await userField(bUid, "platformBillingUntil"));
  await clickRow(A, "Treinador Com Teste", "Marcar como pago"); await sleep(1500);
  const dlg = await A.text("dialog[open]");
  const expectedDate = addMonths(saoPauloDate(trialEnd), 1);
  const [ey, em, ed] = expectedDate.split("-");
  check("the pay dialog shows the date the access will run through", dlg.includes(`${ed}/${em}/${ey}`), dlg);
  check("the pay dialog pre-fills the amount from the plan", /49,90/.test(await A.eval(`[...document.querySelectorAll('dialog[open] input')].map(i=>i.value).join('|')`)), dlg);
  await clickIn(A, "dialog[open]", "^Confirmar pagamento$"); await sleep(3500);
  check("payment is recorded with a notice", (await notices(A)).some((t) => /Pagamento registrado/.test(t) && t.includes(`${ed}/${em}/${ey}`)), (await notices(A)).join(" | "));
  const b2 = (await rowText(A, "Treinador Com Teste")) ?? "";
  check("after paying during the trial the row is 'Em dia'", /Em dia/.test(b2) && !/Em teste/.test(b2), b2);
  check("the trainer document is now current through that date", (await userField(bUid, "platformBillingStatus")) === "current" && (await userField(bUid, "platformBillingUntil")) === String(new Date(`${expectedDate}T23:59:59.999-03:00`).getTime()));
  check("the subscription turned from trial to paid", (await fsGet(`platformSubscriptions/${bUid}`))?.fields?.mode?.stringValue === "paid");
  const payDocs = (await fsList("platformPayments")).filter((d) => d.fields?.trainerUid?.stringValue === bUid);
  check("exactly one payment document exists, with its audit entry", payDocs.length === 1 && (await fsList("adminAudit")).some((d) => d.fields?.action?.stringValue === "payment.record" && d.fields?.targetUid?.stringValue === bUid), String(payDocs.length));

  // ---- Estornar (trainer detail): restores the trial ----
  await A.go(`/admin/personais/detalhe/?id=${bUid}`, 2500);
  await A.waitFor(`/Pagamentos/.test(document.body.innerText) && !/Carregando plano/.test(document.body.innerText)`, 30000);
  await clickIn(A, "main", "^Estornar$"); await sleep(800);
  await setValue(A, "dialog[open]", "Motivo", "Registrado por engano");
  await clickIn(A, "dialog[open]", "^Estornar$"); await sleep(3500);
  check("the estorno is recorded", (await notices(A)).some((t) => /Pagamento estornado/.test(t)), (await notices(A)).join(" | "));
  check("the trainer is back in the trial", (await userField(bUid, "platformBillingStatus")) === "trial" && (await fsGet(`platformSubscriptions/${bUid}`))?.fields?.mode?.stringValue === "trial");

  // ---- the seeded trainer: assign a 0-day plan → locked until the first payment ----
  await A.go("/admin/mensalidades/", 2500); await loaded(A);
  const trainerName = await userField(tid, "name");
  await clickRow(A, trainerName, "Cadastrar plano"); await sleep(600);
  await choose(A, "dialog[open]", "Plano", "Plano sem teste"); await sleep(300);
  await clickIn(A, "dialog[open]", "^Cadastrar plano$"); await sleep(3000);
  check("trainer sees the lock while waiting for the first payment", (await T.login(TRAINER)) === "/app/" && /Conta temporariamente bloqueada/.test(await T.text("main")) && /primeiro pagamento/.test(await T.text("main")), (await T.text("main")).slice(0, 160));
  await clickRow(A, trainerName, "Marcar como pago"); await sleep(1500);
  await clickIn(A, "dialog[open]", "^Confirmar pagamento$"); await sleep(3500);
  await T.go("/app/", 3000);
  check("payment unlocks the trainer's area", !/temporariamente bloqueada/.test(await T.text("main")) && /Hoje/.test(await T.text("main")), (await T.text("main")).slice(0, 120));

  // time passes: the expiry is in the past → locked, shown as late, and only a payment brings it back
  await fsPatch(`users/${tid}`, { platformBillingUntil: { integerValue: String(Date.now() - 3 * 86400000) } });
  await T.go("/app/", 3000);
  check("an expired mensalidade locks the trainer and names the date", /Conta temporariamente bloqueada/.test(await T.text("main")) && /venceu em \d{2}\/\d{2}\/\d{4}/.test(await T.text("main")), (await T.text("main")).slice(0, 160));
  await T.go("/app/conta/", 3500);
  check("a locked trainer still reads their plan and expiry", /Plano e mensalidade/.test(await T.text()) && /Em atraso/.test(await T.text()), (await T.text()).slice(0, 200));
  await A.go("/admin/mensalidades/", 2500); await loaded(A);
  check("the list shows the trainer 'Em atraso há 3 dias'", /Em atraso há 3 dias/.test((await rowText(A, trainerName)) ?? ""), (await rowText(A, trainerName)) ?? "");
  await clickRow(A, trainerName, "Marcar como pago"); await sleep(1500);
  await clickIn(A, "dialog[open]", "^Confirmar pagamento$"); await sleep(3500);
  await T.go("/app/", 3000);
  check("paying a late trainer restores access from today", !/temporariamente bloqueada/.test(await T.text("main")), (await T.text("main")).slice(0, 100));

  // ---- a stale screen cannot double-pay ----
  await fsPatch(`users/${tid}`, { platformBillingUntil: { integerValue: String(Date.now() + 40 * 86400000) } });
  await clickRow(A, trainerName, "Marcar como pago"); await sleep(1500);
  await clickIn(A, "dialog[open]", "^Confirmar pagamento$"); await sleep(3000);
  check("a payment from an out-of-date screen is refused", /atualizado em outro lugar/.test(await A.text("dialog[open]")), await A.text("dialog[open]"));

  // ---- phone width: no horizontal scroll, the rows stack ----
  await M.login("admin@teste.dev");
  await M.go("/admin/mensalidades/", 3000); await loaded(M);
  check("at phone width the page does not scroll sideways", await M.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1`), String(await M.eval(`document.documentElement.scrollWidth + ' > ' + window.innerWidth`)));

  const errs = [...new Set([...A.logs, ...T.logs, ...M.logs])].filter((l) => !/favicon|404|400|Failed to load resource/.test(l));
  if (errs.length) console.log("INFO  browser errors:", errs.slice(0, 5).join(" || "));
} catch (e) {
  check("script completed", false, e.message);
} finally {
  A.close(); T.close(); M.close();
}
process.exit(summary() ? 1 : 0);
