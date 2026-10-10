// node e2e/admin-focus.mjs — keyboard focus on the ADM screens: pressing Enter on an action button must leave focus on
// that button once the action finishes (a disabled control drops focus to <body>). Where the button legitimately goes away
// after success (the form closes, a dialog is confirmed) focus must land on the result message, never on <body>.
import { browser, check, summary, sleep, reseed, uidByEmail } from "./lib.mjs";

await reseed();
const tid = await uidByEmail("treinador@teste.dev");

const setField = (b, formMatch, label, value) => b.eval(`(()=>{const f=[...document.querySelectorAll('main form')].find(f=>new RegExp(${JSON.stringify(formMatch)},'i').test(f.innerText)); const l=f&&[...f.querySelectorAll('label')].find(x=>x.innerText.trim().startsWith(${JSON.stringify(label)})); const e=l&&l.querySelector('input,select'); if(!e) return false; const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true;})()`);
const notes = (b) => b.eval(`[...document.querySelectorAll('main [role=status], main [role=alert]')].map(e=>e.innerText.trim()).filter(Boolean).join(' | ')`);

/** Focus the button, press Enter like a keyboard user, wait for the action to finish, report where focus went. */
async function press(b, name, re, { key = "Enter", last = false } = {}) {
  const found = await b.eval(`(()=>{const all=[...document.querySelectorAll('main button')].filter(x=>new RegExp(${JSON.stringify(re)},'i').test(x.textContent)); const x=${last} ? all[all.length-1] : all[0]; if(!x) return false; x.focus(); return document.activeElement===x;})()`);
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

const setDialog = (b, label, value) => b.eval(`(()=>{const l=[...document.querySelectorAll('dialog[open] label')].find(x=>x.innerText.trim().startsWith(${JSON.stringify(label)})); const e=l&&l.querySelector('input'); if(!e) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);

/** The same, for a button inside the open dialog: confirming closes it, so focus goes back to the control that opened it (or to the result message) — never to <body>. */
async function pressInDialog(b, name, re) {
  const found = await b.eval(`(()=>{const x=[...document.querySelectorAll('dialog[open] button')].find(x=>new RegExp(${JSON.stringify(re)},'i').test(x.textContent)); if(!x) return false; x.focus(); return document.activeElement===x;})()`);
  if (!found) { check(`${name}: dialog button found and focusable`, false); return; }
  await b.key("Enter");
  await sleep(500);
  await b.waitFor(`![...document.querySelectorAll('main button')].some(x=>/…$/.test(x.textContent.trim()))`, 15000, 250);
  await sleep(900);
  const kept = await b.eval(`(()=>{const a=document.activeElement; return !!a && a!==document.body && (/^(status|alert)$/.test(a.getAttribute('role')||'') || a.tagName==='BUTTON');})()`);
  check(`${name}: focus returns to a control or the result message, not to <body>`, kept && !!(await notes(b)), await notes(b));
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
  await b.click("Novo plano"); await sleep(600);
  for (const [label, value] of [["Nome do plano", "Plano Teste"], ["Mensalidade (R$)", "49,90"], ["Alunos incluídos", "2"], ["Adicional mensal por aluno excedente", "6,50"], ["Máximo de códigos de convite ativos", "3"], ["Período de teste", "7"]]) await setField(b, "Novo plano", label, value);
  await press(b, "Plans: save a plan", "Salvar plano");
} catch (e) { check("planos scenario ran", false, e.message); } finally { b.close(); }

// ---------- the trainer's admin detail: plan, trial extension, pay (dialog), estorno (dialog), invite resolution ----------
b = await browser("adm-detail");
try {
  await b.login("admin@teste.dev");
  await b.go(`/admin/personais/detalhe/?id=${tid}`, 2500);
  await b.waitFor(`/Mensalidade/.test(document.body.innerText) && !/Carregando plano/.test(document.body.innerText)`, 40000);
  const opt = await b.eval(`(()=>{const s=[...document.querySelectorAll('main form select')].find(s=>/Plano/.test(s.closest('label')?.innerText||'')); return s&&s.options[1]?s.options[1].value:null})()`);
  check("a plan exists to assign", !!opt);
  if (opt) {
    await setField(b, "Cadastrar plano deste personal", "Plano", opt);
    await sleep(400);
    // after saving, this very button is relabelled "Salvar alterações": focus must stay on a button, never fall to <body>
    await press(b, "Detail: register the plan (trial)", "^(Cadastrar plano|Salvar alterações)$", { last: true });
    await setField(b, "Prorrogar teste", "Adicionar dias", "3");
    await setField(b, "Prorrogar teste", "Motivo", "foco");
    await press(b, "Detail: extend the trial", "^Prorrogar teste$");

    // Marcar como pago: a keyboard user lands inside the dialog, Escape returns to the button, Confirm lands on the result.
    const opened = await b.eval(`(()=>{const x=[...document.querySelectorAll('main button')].find(x=>/^Marcar como pago$/.test(x.textContent.trim())); if(!x) return false; x.focus(); return document.activeElement===x;})()`);
    check("Detail: the pay button is focusable", opened);
    await b.key("Enter"); await sleep(700);
    check("Detail: the pay dialog takes focus", await b.eval(`!!document.activeElement && !!document.activeElement.closest('dialog[open]')`));
    await b.key("Escape"); await sleep(500);
    check("Detail: Escape closes the pay dialog and returns focus to its button", await b.eval(`!document.querySelector('dialog[open]') && /^Marcar como pago$/.test(document.activeElement?.textContent?.trim()||'')`));
    await b.click("^Marcar como pago$"); await sleep(700);
    await pressInDialog(b, "Detail: confirm the payment", "^Confirmar pagamento$");

    await b.waitFor(`[...document.querySelectorAll('main button')].some(x=>/^Estornar$/.test(x.textContent.trim()))`, 15000);
    await b.click("^Estornar$"); await sleep(700);
    await setDialog(b, "Motivo", "foco do teclado");
    await pressInDialog(b, "Detail: confirm the estorno", "^Estornar$");

    // invite resolution: confirm() is auto-accepted by the harness
    await setField(b, "Resolver código", "Código de 8 caracteres", "AB12CD34");
    await setField(b, "Resolver código", "Motivo para resolver", "foco");
    await press(b, "Detail: resolve an invite code", "Resolver código");
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
