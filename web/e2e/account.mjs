// node e2e/account.mjs <trainer|student> [desktop|mobile] — GOALS.md §29: phone, e-mail, password, avatar, keyboard, 390 px.
import { browser, check, summary, sleep, reseed, uidByEmail, fsGet, fieldValue, authSignIn, oobCodes, avatarObjects } from "./lib.mjs";

const role = process.argv[2] ?? "trainer";
const vp = process.argv[3] ?? "desktop";
const OLD = role === "trainer" ? "treinador@teste.dev" : "ana@teste.dev";
const NEW = role === "trainer" ? "treinador.novo@teste.dev" : "ana.nova@teste.dev";
const PATH = role === "trainer" ? "/app/conta/" : "/aluno/conta/";
const HOME = role === "trainer" ? "/app/" : "/aluno/";
const NEWPASS = "novaSenha456";

await reseed();
const uid = await uidByEmail(OLD);
check(`[${role}] seeded account found`, !!uid, uid ?? "");

const b = await browser(role, vp);
const fillIn = async (submitText, label, text) => {
  const ok = await b.eval(`(()=>{const f=[...document.querySelectorAll('main form')].find(f=>[...f.querySelectorAll('button[type=submit]')].some(x=>new RegExp(${JSON.stringify(submitText)},'i').test(x.textContent))); const l=f&&[...f.querySelectorAll('label')].find(x=>x.innerText.trim().startsWith(${JSON.stringify(label)})); const e=l&&l.querySelector('input'); if(!e) return false; e.focus(); e.select&&e.select(); return true;})()`);
  if (!ok) throw new Error(`field ${label} in form ${submitText} not found`);
  if (text === "") await b.eval(`(()=>{const e=document.activeElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,''); e.dispatchEvent(new Event('input',{bubbles:true}));})()`); else await b.type(text, { replace: false });
};
const submitForm = async (submitText) => b.eval(`(()=>{const f=[...document.querySelectorAll('main form')].find(f=>[...f.querySelectorAll('button[type=submit]')].some(x=>new RegExp(${JSON.stringify(submitText)},'i').test(x.textContent))); if(!f) return false; f.querySelector('button[type=submit]').click(); return true;})()`);
const notes = () => b.eval(`[...document.querySelectorAll('main [role=status], main [role=alert]')].map(e=>e.innerText.trim()).filter(Boolean)`);

try {
  // ---------- sign in and reach the account page ----------
  check(`[${role}] signs in and lands in its own area`, (await b.login(OLD)) === HOME, await b.url());
  await b.go(PATH, 3500);
  check(`[${role}] account page opens from the profile entry`, await b.eval(`!!document.querySelector('a[aria-label*="conta"][href*="/conta"]')`));
  check(`[${role}] sign-out is a separate control`, await b.eval(`[...document.querySelectorAll('button')].some(x=>/^Sair$/.test(x.textContent.trim()))`));
  check(`[${role}] tab title is the page's own`, /Minha conta/.test(await b.eval("document.title")), await b.eval("document.title"));

  // ---------- keyboard: order, names, visible focus ----------
  await b.go(PATH, 3000);
  const stops = [];
  for (let i = 0; i < 45; i++) {
    await b.key("Tab");
    const s = await b.eval(`(()=>{const e=document.activeElement; if(!e||e===document.body) return null; const cs=getComputedStyle(e); const name=(e.labels&&e.labels[0]?e.labels[0].innerText:'')||e.getAttribute('aria-label')||e.textContent||e.getAttribute('placeholder')||''; return {tag:e.tagName, type:e.type||'', name:name.trim().replace(/\\s+/g,' ').slice(0,40), outline: parseFloat(cs.outlineWidth)>0 && cs.outlineStyle!=='none', main: !!e.closest('main'), href:e.getAttribute('href')||''};})()`);
    if (s && s.tag !== 'NEXTJS-PORTAL') stops.push(s);
  }
  const mainStops = stops.filter((s) => s.main);
  check(`[${role}] keyboard: first stop is the skip link`, stops[0]?.href === "#conteudo" || /pular/i.test(stops[0]?.name ?? ""), JSON.stringify(stops[0]));
  const needed = ["Telefone", "Novo e-mail", "Senha atual", "Nova senha", "Confirme a nova senha"];
  for (const n of needed) check(`[${role}] keyboard reaches "${n}"`, mainStops.some((s) => s.name.startsWith(n)));
  check(`[${role}] keyboard: every stop has an accessible name`, stops.every((s) => s.name.length > 0), stops.filter((s) => !s.name).map((s) => s.tag + ":" + s.type).join(","));
  check(`[${role}] keyboard: every stop shows a focus outline`, stops.every((s) => s.outline), stops.filter((s) => !s.outline).map((s) => s.name).join(","));

  // ---------- phone ----------
  await b.go(PATH, 3000);
  await fillIn("Salvar telefone", "Telefone", "11987654321");
  await b.key("Enter");
  check(`[${role}] phone saves with a status message`, await b.waitFor(`!!document.querySelector('main [role=status]') && /Telefone salvo/.test(document.body.innerText)`, 6000));
  const f1 = await b.eval(`(()=>{const e=document.activeElement; return e? e.tagName+':'+(e.type||''):'none'})()`);
  check(`[${role}] focus stays on the phone field after saving`, f1.startsWith("INPUT"), f1);
  check(`[${role}] phone is formatted`, await b.eval(`document.querySelector('input[type=tel]').value`) === "+55 (11) 98765-4321");
  const phoneDoc = await fsGet(`users/${uid}`);
  check(`[${role}] phone persisted in Firestore`, /11987654321|5511987654321/.test(JSON.stringify(fieldValue(phoneDoc?.fields?.phone))), JSON.stringify(fieldValue(phoneDoc?.fields?.phone)));
  await fillIn("Salvar telefone", "Telefone", "123"); await b.key("Enter");
  await sleep(900);
  const bad = await notes();
  check(`[${role}] invalid phone is refused with an alert`, bad.some((t) => /telefone/i.test(t)), bad.join(" | "));
  const inv = await b.eval(`(()=>{const e=document.querySelector('input[type=tel]'); return {invalid:e.getAttribute('aria-invalid'), desc:e.getAttribute('aria-describedby'), focus:document.activeElement===e}})()`);
  check(`[${role}] focus stays on the invalid phone field`, inv.focus);
  console.log(`INFO  [${role}] aria-invalid=${inv.invalid} aria-describedby=${inv.desc}`);
  await fillIn("Salvar telefone", "Telefone", ""); await b.key("Enter");
  await sleep(1200);
  const cleared = await fsGet(`users/${uid}`);
  check(`[${role}] empty phone is accepted and cleared`, (fieldValue(cleared?.fields?.phone) ?? "") === "", JSON.stringify(fieldValue(cleared?.fields?.phone)));

  // ---------- e-mail change ----------
  await b.go(PATH, 3000);
  await fillIn("Enviar confirmação", "Novo e-mail", NEW);
  await fillIn("Enviar confirmação", "Senha atual", "errada000");
  await submitForm("Enviar confirmação");
  await sleep(2200);
  const e1 = await notes();
  check(`[${role}] e-mail change with a wrong password is refused`, e1.some((t) => /senha/i.test(t)) && !(await oobCodes()).some((c) => c.requestType === "VERIFY_AND_CHANGE_EMAIL"), e1.join(" | "));
  await fillIn("Enviar confirmação", "Senha atual", "senha123");
  await submitForm("Enviar confirmação");
  await sleep(3000);
  const e2 = await b.text();
  check(`[${role}] e-mail change shows "pending, old address stays active"`, /continua ativo/i.test(e2) || /Aguardando/i.test(e2), e2.slice(0, 160));
  check(`[${role}] old address still signs in before confirmation`, await authSignIn(OLD, "senha123"));
  check(`[${role}] new address does not exist yet`, !(await authSignIn(NEW, "senha123")));
  const code = (await oobCodes()).filter((c) => c.requestType === "VERIFY_AND_CHANGE_EMAIL" && c.newEmail === NEW).pop();
  check(`[${role}] confirmation link was issued for the new address`, !!code);
  if (code) {
    await b.go(code.oobLink, 4500);
    const back = await b.waitFor(`/Atual:\\s*${NEW.replace(/\./g, "\\.")}/.test(document.querySelector('main')?.innerText||'')`, 15000);
    check(`[${role}] returns to the account page showing the new address`, !!back, await b.url());
    await sleep(1500);
    const mirror = await fsGet(`users/${uid}`);
    check(`[${role}] Firestore profile mirrors the confirmed address`, fieldValue(mirror?.fields?.email) === NEW, String(fieldValue(mirror?.fields?.email)));
    check(`[${role}] new address signs in, old one no longer does`, (await authSignIn(NEW, "senha123")) && !(await authSignIn(OLD, "senha123")));
    if (role === "trainer") {
      // the ADM's trainer directory (fresh browser: the local emulator is HTTP/1.1 and chokes on reused profiles)
      const adm = await browser("adm-dir", vp);
      try {
        await adm.login("admin@teste.dev");
        await adm.go("/admin/personais/", 2500);
        const seen = await adm.waitFor(`document.querySelector('main').innerText.includes(${JSON.stringify(NEW)})`, 30000);
        check(`[trainer] the ADM's trainer directory lists the new address`, !!seen, (await adm.text()).slice(0, 200));
        check(`[trainer] ... and no longer lists the old one`, !(await adm.text()).includes(OLD));
      } finally { adm.close(); }
    }
  }

  // ---------- password ----------
  await b.go(PATH, 3500);
  await fillIn("Alterar senha", "Senha atual", "senha123");
  await fillIn("Alterar senha", "Nova senha", NEWPASS);
  await fillIn("Alterar senha", "Confirme a nova senha", "diferente999");
  await submitForm("Alterar senha"); await sleep(1000);
  check(`[${role}] password: mismatch is refused`, (await notes()).some((t) => /diferentes|confirma/i.test(t)));
  await fillIn("Alterar senha", "Senha atual", "errada000");
  await fillIn("Alterar senha", "Nova senha", NEWPASS);
  await fillIn("Alterar senha", "Confirme a nova senha", NEWPASS);
  await submitForm("Alterar senha"); await sleep(2200);
  check(`[${role}] password: wrong current password is refused`, (await notes()).some((t) => /não confere|incorret|inválid/i.test(t)), (await notes()).join(" | "));
  check(`[${role}] password: unchanged after a refusal`, await authSignIn(NEW, "senha123"));
  await fillIn("Alterar senha", "Senha atual", "senha123");
  await fillIn("Alterar senha", "Nova senha", NEWPASS);
  await fillIn("Alterar senha", "Confirme a nova senha", NEWPASS);
  await submitForm("Alterar senha"); await sleep(2500);
  check(`[${role}] password: change succeeds`, (await notes()).some((t) => /Senha alterada/i.test(t)));
  check(`[${role}] password: fields are cleared`, await b.eval(`[...document.querySelectorAll('main input[type=password]')].every(i=>i.value==='')`));
  check(`[${role}] password: new one works, old one does not`, (await authSignIn(NEW, NEWPASS)) && !(await authSignIn(NEW, "senha123")));

  // ---------- avatar ----------
  await b.go(PATH, 3500);
  const png = await b.png("#c33");
  await b.chooseFile(png); await sleep(3500);
  check(`[${role}] avatar: upload confirmed in the UI`, (await notes()).some((t) => /Imagem da conta atualizada/i.test(t)) || /atualizada/i.test(await b.text()), (await notes()).join(" | "));
  const obj1 = await avatarObjects(uid);
  check(`[${role}] avatar: stored only under the owner's own path`, obj1.length === 1 && obj1[0] === `account-avatars/${uid}/profile`, obj1.join(","));
  check(`[${role}] avatar: shown in the profile chip`, await b.eval(`!![...document.querySelectorAll('[style*=background-image]')].length`));
  await b.chooseFile(await b.png("#33c")); await sleep(3000);
  check(`[${role}] avatar: replace keeps a single object`, (await avatarObjects(uid)).length === 1);
  await b.chooseFile({ name: "x.txt", type: "text/plain", size: 5 }); await sleep(900);
  check(`[${role}] avatar: a text file is refused`, /JPG, PNG ou WebP/.test(await b.text()) && (await notes()).some((t) => /Escolha uma imagem/i.test(t)));
  await b.chooseFile({ name: "big.png", type: "image/png", size: 2.5 * 1024 * 1024 }); await sleep(900);
  check(`[${role}] avatar: a 2.5 MB file is refused`, (await notes()).some((t) => /até 2 MB/i.test(t)));
  check(`[${role}] avatar: refusals changed nothing`, (await avatarObjects(uid)).length === 1);

  if (role === "student") {
    // the trainer must not be able to read the student's private image
    const t = await browser("trainer-view", vp);
    try {
      await t.login("treinador@teste.dev");
      await t.go("/app/alunos/", 5000);
      const hasPhoto = await t.eval(`[...document.querySelectorAll('main .directory-card')].filter(c=>/Ana/.test(c.innerText)).some(c=>c.querySelector('[style*=background-image]'))`);
      check(`[student] the trainer sees initials, not the student's private photo`, hasPhoto === false, String(hasPhoto));
    } finally { t.close(); }
  }

  const removed = await b.click("Remover imagem"); await sleep(3000);
  check(`[${role}] avatar: removed, back to initials, object deleted`, removed && (await avatarObjects(uid)).length === 0 && !(await b.eval(`!![...document.querySelectorAll('main [style*=background-image]')].length`)));

  // ---------- phone-width audit ----------
  if (vp === "mobile") {
    const a = await b.eval(`(()=>{const vw=document.documentElement.clientWidth; const small=[...document.querySelectorAll('a,button,input,select,textarea')].filter(e=>{const r=e.getBoundingClientRect(); return r.width&&r.height&&e.type!=='file'&&r.height<44}).map(e=>(e.getAttribute('aria-label')||e.innerText||e.type).trim().slice(0,24)+':'+Math.round(e.getBoundingClientRect().height)); const sm=[...document.querySelectorAll('main input:not([type=file]),main select')].filter(e=>parseFloat(getComputedStyle(e).fontSize)<16).length; return {over:document.documentElement.scrollWidth>vw, small, sm}})()`);
    check(`[${role}] 390px: no horizontal overflow`, !a.over);
    check(`[${role}] 390px: controls are at least 44px`, a.small.length === 0, a.small.join(", "));
    check(`[${role}] 390px: form fields are 16px`, a.sm === 0);
  }
  if (b.logs.length) console.log("INFO  browser errors:", [...new Set(b.logs)].slice(0, 5).join(" || "));
} catch (e) {
  check(`[${role}] script completed`, false, e.message);
} finally {
  b.close();
}
process.exit(summary() ? 1 : 0);
