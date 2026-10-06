// node e2e/admin-focus.mjs — keyboard focus on the ADM screens: pressing Enter on an action button must leave focus on
// that button once the action finishes (a disabled control drops focus to <body>). Where the button legitimately goes away
// after success (the form closes, the invoice is paid) focus must land on the result message, never on <body>.
import { browser, check, summary, sleep, reseed, uidByEmail } from "./lib.mjs";

await reseed();
const tid = await uidByEmail("treinador@teste.dev");
const iso = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

const setField = (b, formMatch, label, value) => b.eval(`(()=>{const f=[...document.querySelectorAll('main form')].find(f=>new RegExp(${JSON.stringify(formMatch)},'i').test(f.innerText)); const l=f&&[...f.querySelectorAll('label')].find(x=>x.innerText.trim().startsWith(${JSON.stringify(label)})); const e=l&&l.querySelector('input,select'); if(!e) return false; const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true;})()`);
const notes = (b) => b.eval(`[...document.querySelectorAll('main [role=status], main [role=alert]')].map(e=>e.innerText.trim()).filter(Boolean).join(' | ')`);

/** Focus the button, press Enter like a keyboard user, wait for the action to finish, report where focus went. */
async function press(b, name, re, { key = "Enter" } = {}) {
  const found = await b.eval(`(()=>{const x=[...document.querySelectorAll('main button')].find(x=>new RegExp(${JSON.stringify(re)},'i').test(x.textContent)); if(!x) return false; x.focus(); return document.activeElement===x;})()`);
  if (!found) { check(`${name}: button found and focusable`, false); return; }
  await b.key(key);
  await sleep(500);
  // done = the busy label ("Salvando…", "Emitindo…", …) is gone, or the button itself is gone
  await b.waitFor(`![...document.querySelectorAll('main button')].some(x=>/…$/.test(x.textContent.trim()))`, 15000, 250);
  await sleep(900);
  const after = await b.eval(`(()=>{const a=document.activeElement; const still=[...document.querySelectorAll('main button')].some(x=>new RegExp(${JSON.stringify(re)},'i').test(x.textContent)); return {tag:a?a.tagName:'none', text:(a&&a.textContent||'').trim().slice(0,30), still, ok: !!a && a.tagName==='BUTTON' && new RegExp(${JSON.stringify(re)},'i').test(a.textContent), onMessage: !!a && /^(status|alert)$/.test(a.getAttribute('role')||'')};})()`);
  if (after.ok) check(`${name}: focus stays on the button`, true);
  else if (!after.still) check(`${name}: the button went away, focus moves to the result message`, after.onMessage, `focus is on ${after.tag} — ${await notes(b)}`);
  else check(`${name}: focus stays on the button`, false, `focus is on ${after.tag} "${after.text}" — ${await notes(b)}`);
}

// ---------- /admin/conta ----------
let b = await browser("adm-conta");
try {
  await b.login("admin@teste.dev");
  await b.go("/admin/conta/", 3000);
  await press(b, "ADM account: send reset link", "Enviar link para redefinir senha");
} catch (e) { check("conta scenario ran", false, e.message); } finally { b.close(); }

// ---------- /admin/planos ----------
b = await browser("adm-planos");
try {
  await b.login("admin@teste.dev");
  await b.go("/admin/planos/", 3000);
  await setField(b, "Padrão do teste", "Máximo de alunos vinculados", "2");
  await setField(b, "Padrão do teste", "Duração do teste", "7");
  await setField(b, "Padrão do teste", "Motivo da alteração", "foco do teclado");
  await press(b, "Plans: save the trial default", "Salvar padrão do teste");
  await b.click("Novo plano"); await sleep(600);
  const vals = ["Plano Teste", "49,90", "2", "6,50", "criação de teste", "3", "2", "7"];
  const labels = ["Nome do plano", "Mensalidade base", "Alunos incluídos", "Adicional mensal", "Motivo da alteração", "Máximo de códigos", "Máximo de alunos durante o teste", "Duração do teste deste plano"];
  for (let i = 0; i < labels.length; i++) await setField(b, "Novo modelo", labels[i], vals[i]);
  await press(b, "Plans: save a template", "Salvar modelo");
} catch (e) { check("planos scenario ran", false, e.message); } finally { b.close(); }

// ---------- the trainer's admin detail: terms, trial extension, invoice, due date, payment, invite resolution ----------
b = await browser("adm-detail");
try {
  await b.login("admin@teste.dev");
  await b.go(`/admin/personais/detalhe/?id=${tid}`, 2500);
  await b.waitFor(`/Assinatura e cobrança/.test(document.body.innerText) && !/Carregando termos/.test(document.body.innerText)`, 40000);
  const opt = await b.eval(`(()=>{const s=[...document.querySelectorAll('main form select')].find(s=>/Modelo de origem/.test(s.closest('label')?.innerText||'')); return s&&s.options[1]?s.options[1].value:null})()`);
  check("a plan template exists to assign", !!opt);
  if (opt) {
    await setField(b, "Salvar termos", "Modelo de origem", opt);
    await sleep(400);
    await setField(b, "Salvar termos", "Motivo da atribuição", "foco do teclado");
    await press(b, "Detail: assign terms (trial)", "Salvar termos e registrar auditoria");
    await setField(b, "Prorrogar teste", "Adicionar dias", "3");
    await setField(b, "Prorrogar teste", "Motivo", "foco");
    await press(b, "Detail: extend the trial", "^Prorrogar teste$");
    await setField(b, "Salvar termos", "Modalidade", "paid");
    await setField(b, "Salvar termos", "Motivo da atribuição", "passando para pago");
    await press(b, "Detail: assign terms (paid)", "Salvar termos e registrar auditoria");
    await setField(b, "Emitir fatura manual", "Vencimento", iso(3));
    await setField(b, "Emitir fatura manual", "Motivo", "fatura de foco");
    await press(b, "Detail: issue the invoice", "^Emitir fatura$");
    await setField(b, "Prorrogar vencimento", "Adicionar dias", "2");
    await setField(b, "Prorrogar vencimento", "Motivo", "foco");
    await press(b, "Detail: extend the due date", "^Prorrogar vencimento$");
    // invite resolution: confirm() is auto-accepted by the harness
    await setField(b, "Resolver código", "Código de 8 caracteres", "AB12CD34");
    await setField(b, "Resolver código", "Motivo para resolver", "foco");
    await press(b, "Detail: resolve an invite code", "Resolver código");
    await press(b, "Detail: register the payment", "Registrar pagamento");
  }
} catch (e) { check("detail scenario ran", false, e.message); } finally { b.close(); }

// ---------- /admin/personais/novo and /admin/solicitacoes ----------
b = await browser("adm-novo");
try {
  await b.login("admin@teste.dev");
  await b.go("/admin/personais/novo/", 3000);
  await setField(b, "Criar personal", "Nome", "Personal de Foco");
  await setField(b, "Criar personal", "E-mail", "foco.personal@gmail.com");
  await press(b, "New trainer: create", "^Criar personal$");
  await b.go("/admin/solicitacoes/", 3000);
  await setField(b, "Promover", "UID", tid);
  await press(b, "Requests: promote by UID", "Promover conta");
} catch (e) { check("novo/solicitações scenario ran", false, e.message); } finally { b.close(); }

process.exit(summary() ? 1 : 0);
