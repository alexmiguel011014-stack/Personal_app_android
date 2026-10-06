// node e2e/billing.mjs — trial mode, the overdue lock and its recovery, end to end through the UI (ADM + trainer).
// Time passing is simulated by writing a past due date / deadline straight into the emulator, as the site has no clock job.
import { browser, check, summary, sleep, reseed, uidByEmail, fsList, fsPatch } from "./lib.mjs";

await reseed();
const TRAINER = "treinador@teste.dev";
const tid = await uidByEmail(TRAINER);
check("seeded trainer found", !!tid, tid ?? "");

const A = await browser("adm");
const T = await browser("trn");

const setField = (b, formMatch, label, value) => b.eval(`(()=>{const f=[...document.querySelectorAll('main form')].find(f=>new RegExp(${JSON.stringify(formMatch)},'i').test(f.innerText)); const l=f&&[...f.querySelectorAll('label')].find(x=>x.innerText.trim().startsWith(${JSON.stringify(label)})); const e=l&&l.querySelector('input,select'); if(!e) return false; const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true;})()`);
const submit = (b, formMatch) => b.eval(`(()=>{const f=[...document.querySelectorAll('main form')].find(f=>new RegExp(${JSON.stringify(formMatch)},'i').test(f.innerText)); if(!f) return false; f.querySelector('button[type=submit]').click(); return true;})()`);
const alerts = (b) => b.eval(`[...document.querySelectorAll('main [role=status], main [role=alert]')].map(e=>e.innerText.trim()).filter(Boolean)`);
const detail = async () => { await A.go(`/admin/personais/detalhe/?id=${tid}`, 2500); await A.waitFor(`/Assinatura e cobrança/.test(document.body.innerText) && !/Carregando termos/.test(document.body.innerText)`, 30000); };
const iso = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

try {
  check("ADM signs in", (await A.login("admin@teste.dev")) === "/admin/");

  // ---- plan template with a trial cap of 2 students ----
  await A.go("/admin/planos/", 3000);
  await A.click("Novo plano"); await sleep(600);
  const vals = ["Plano Teste", "49,90", "2", "6,50", "criação de teste", "3", "2", "7"];
  const labels = ["Nome do plano", "Mensalidade base", "Alunos incluídos", "Adicional mensal", "Motivo da alteração", "Máximo de códigos", "Máximo de alunos durante o teste", "Duração do teste deste plano"];
  for (let i = 0; i < labels.length; i++) await setField(A, "Novo modelo", labels[i], vals[i]);
  await submit(A, "Novo modelo"); await sleep(2500);
  check("template is saved as version 1", (await alerts(A)).some((t) => /versão 1/.test(t)), (await alerts(A)).join(" | "));

  // ---- assign it as a TRIAL ----
  await detail();
  await setField(A, "Salvar termos", "Modelo de origem", await A.eval(`[...document.querySelectorAll('main form select')].find(s=>/Modelo de origem/.test(s.closest('label')?.innerText||'')).options[1].value`), "select");
  await sleep(500);
  await setField(A, "Salvar termos", "Motivo da atribuição", "teste de modo teste");
  await submit(A, "Salvar termos"); await sleep(3500);
  const afterAssign = await A.text();
  check("trial assigned", /salvos na versão 1/.test(afterAssign), (await alerts(A)).join(" | "));
  check("panel says it is a free trial", /Teste grátis|Teste/.test(afterAssign.split("Status da assinatura")[1]?.slice(0, 80) ?? ""), (afterAssign.split("Status da assinatura")[1] ?? "").slice(0, 60));
  check("free trial explains it generates no charge", /não gera cobrança/i.test(afterAssign));
  const invoiceBtn = await A.eval(`(()=>{const b=[...document.querySelectorAll('main button')].find(x=>/^Emitir fatura$/.test(x.textContent.trim())); return b? {disabled:b.disabled, aria:b.getAttribute('aria-disabled')}:null})()`);
  check("invoice button is unavailable during an uncharged trial", invoiceBtn && (invoiceBtn.disabled || invoiceBtn.aria === "true"), JSON.stringify(invoiceBtn));

  // ---- trainer: sees the trial and is stopped at the student cap ----
  check("trainer signs in", (await T.login(TRAINER)) === "/app/");
  await T.go("/app/conta/", 3500);
  const tc = await T.text();
  check("trainer sees trial mode and its end date", /Teste/.test(tc) && /Fim do teste/.test(tc), tc.match(/Modalidade e versão \| [^|]+/)?.[0] ?? "");
  await T.go("/app/alunos/detalhe/?id=draft-pedro", 3500);
  await T.click("Gerar link de convite"); await sleep(1200);
  await T.click("Confirmar convite"); await sleep(3000);
  const tcap = await alerts(T);
  check("trial student cap blocks a new invite with a clear message", tcap.some((t) => /Limite de alunos do teste atingido/.test(t)), tcap.join(" | "));
  const invs = (await fsList("invites")).filter((d) => d.fields?.draftId?.stringValue === "draft-pedro");
  check("no invite document was created", invs.length === 0, String(invs.length));

  // ---- trial extension ----
  await detail();
  await setField(A, "Prorrogar teste", "Adicionar dias", "5");
  await setField(A, "Prorrogar teste", "Motivo", "ampliar teste");
  const extOk = await submit(A, "Prorrogar teste");
  await A.waitFor(`/Prazo do teste prorrogado/.test(document.body.innerText)`, 8000);
  check("trial extension is recorded", (await alerts(A)).some((t) => /Prazo do teste prorrogado/.test(t)), `form found=${extOk}; alerts=${(await alerts(A)).join(" | ")}; panel=${(await A.text()).split("Prorrogar teste grátis")[1]?.slice(0, 160)}`);

  // ---- paid plan, invoice, then an overdue invoice locks the trainer ----
  await detail();
  await setField(A, "Salvar termos", "Modalidade", "paid", "select"); await sleep(400);
  await setField(A, "Salvar termos", "Motivo da atribuição", "passando para plano pago");
  await submit(A, "Salvar termos"); await sleep(3500);
  await setField(A, "Emitir fatura manual", "Vencimento", iso(3));
  await setField(A, "Emitir fatura manual", "Motivo", "fatura do teste");
  await submit(A, "Emitir fatura manual"); await sleep(4000);
  check("invoice is issued", (await alerts(A)).some((t) => /Fatura .* emitida/.test(t)), (await alerts(A)).join(" | "));
  await T.go("/app/", 3500);
  check("trainer works normally with a current invoice", /Hoje/.test(await T.text("main")) && !/temporariamente bloqueada/.test(await T.text("main")));

  // time passes: the due date is in the past and the deadline has expired
  const invDocs = (await fsList("platformInvoices")).filter((d) => d.fields?.trainerUid?.stringValue === tid);
  check("the invoice document exists", invDocs.length === 1, String(invDocs.length));
  const invPath = invDocs[0]?.name.split("/documents/")[1];
  const pastDate = iso(-3);
  await fsPatch(invPath, { dueDate: { stringValue: pastDate } });
  await fsPatch(`users/${tid}`, { platformBillingUntil: { integerValue: String(Date.now() - 2 * 86400000) } });
  await T.go("/app/", 3500);
  const locked = await T.text("main");
  check("overdue invoice locks the trainer's area", /Conta temporariamente bloqueada/.test(locked), locked.slice(0, 120));
  check("lock screen has a way out (re-check) and sign-out", /Verificar novamente/.test(locked) && /Sair/.test(await T.text("body")));
  const t0 = Date.now();
  T.net.length = 0;
  await T.go("/app/conta/", 1500);
  await T.waitFor(`/Plano e faturas da plataforma/.test(document.body.innerText) && !/Carregando cobrança/.test(document.querySelector('main').innerText)`, 30000);
  const loadMs = Date.now() - t0;
  const consult = await T.text();
  console.log(`INFO  locked trainer: plan section loaded after ${loadMs} ms (slow only in this long single-profile run: emulator HTTP/1.1 artefact, see README "Browser tests")`);
  check("a locked trainer can still read their plan and invoice", /Plano e faturas da plataforma/.test(consult) && /Em aberto|2026-10/.test(consult), consult.split("Plano e faturas da plataforma")[1]?.slice(0, 200) + " | logs=" + T.logs.slice(0,4).join(" // "));
  await T.go("/app/alunos/", 2500);
  await T.waitFor(`/bloqueada|Alunos/.test(document.querySelector('main')?.innerText||'') && !/^Carregando/.test(document.querySelector('main')?.innerText||'')`, 12000);
  check("locked trainer cannot use the student list", /Conta temporariamente bloqueada/.test(await T.text("main")), (await T.text("main")).slice(0, 140));

  // extending an already-overdue due date must NOT restore access
  await detail();
  await setField(A, "Prorrogar vencimento", "Adicionar dias", "1");
  await setField(A, "Prorrogar vencimento", "Motivo", "prazo curto");
  await submit(A, "Prorrogar vencimento");
  await A.waitFor(`/Vencimento prorrogado/.test(document.body.innerText)`, 8000);
  const extNote = (await alerts(A)).join(" | ");
  await T.go("/app/", 2500);
  await T.waitFor(`/bloqueada|Hoje/.test(document.querySelector('main')?.innerText||'')`, 12000);
  check("an extension that is still in the past does not unlock", /Conta temporariamente bloqueada/.test(await T.text("main")), `ext notice=${extNote}; trainer sees=${(await T.text("main")).slice(0, 100)}`);

  // payment restores access
  await detail();
  await A.click("Registrar pagamento"); await sleep(3500);
  check("payment is recorded", (await alerts(A)).some((t) => /Pagamento registrado/.test(t)), (await alerts(A)).join(" | "));
  await T.go("/app/", 3500);
  const unlocked = await T.text("main");
  check("payment restores the trainer's access", !/temporariamente bloqueada/.test(unlocked) && /Hoje/.test(unlocked), unlocked.slice(0, 100));
  await T.go("/app/alunos/", 3500);
  check("and the student list works again", /Alunos/.test(await T.text("main")) && !/bloqueada/.test(await T.text("main")));

  const errs = [...new Set([...A.logs, ...T.logs])].filter((l) => !/favicon|404|400|Failed to load resource/.test(l));
  if (errs.length) console.log("INFO  browser errors:", errs.slice(0, 5).join(" || "));
} catch (e) {
  check("script completed", false, e.message);
} finally {
  A.close(); T.close();
}
process.exit(summary() ? 1 : 0);
