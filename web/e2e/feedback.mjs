// node e2e/feedback.mjs - GOALS.md sections 38h and 38i: how a session went. Ana saves a session on a 390 px phone and answers
// "Como foi o treino?" (effort, pain, a comment); the personal finds it in Registros (and "Só não vistas"), on "Hoje" (pain first)
// and on Ana's page, marks it seen and comments; Ana reads the comment (a banner on her home, "novo" in Evolução, then gone);
// the personal turns the WhatsApp card off and on and Ana's home follows. The seed already holds an answered session of Ana's
// (1 day ago) and Bruno's unseen pain (12 days ago). Needs the same bench as the other scripts (npm run dev:local).
import { browser, check, summary, sleep, reseed, uidByEmail, fsList, fsGet, fieldValue } from "./lib.mjs";

await reseed();
const ana = await uidByEmail("ana@teste.dev");
const trainer = await uidByEmail("treinador@teste.dev");
check("the seeded accounts exist", !!ana && !!trainer);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const feedbackId = `${ana}_${today}`;
const feedbackDoc = () => fsGet(`sessionFeedback/${feedbackId}`);
const f = (doc, key) => fieldValue(doc?.fields?.[key]);

const must = async (b, label, expression, ms = 30000) => {
  if (!(await b.waitFor(expression, ms))) throw new Error(`timed out waiting for: ${label}`);
};
const nav = (b, path) => b.eval(`window.next.router.push(${JSON.stringify(path)}); true`);
const setValue = (b, selector, value) =>
  b.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const clickText = (b, selector, re) =>
  b.eval(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => new RegExp(${JSON.stringify(re)}).test(x.textContent.trim())); if (!e) return false; e.click(); return true; })()`);

// ================= 1. Ana saves a session and answers "Como foi o treino?" =================
const A = await browser("ana-feedback", "mobile");
try {
  check("Ana signs in", (await A.login("ana@teste.dev")).startsWith("/aluno"));
  await nav(A, "/aluno/treino/?ficha=ficha-a");
  await must(A, "the log form", `document.body.innerText.includes('Salvar sessão')`);
  await A.eval(`(() => { const inputs = document.querySelectorAll('main form fieldset')[0].querySelectorAll('input'); for (const [i, v] of [[0, '40'], [1, '10']]) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inputs[i], v); inputs[i].dispatchEvent(new Event('input', { bubbles: true })); } return true; })()`);
  await sleep(300);
  await clickText(A, "main form button", "^Salvar sessão$");
  await must(A, "the question after saving", `document.body.innerText.includes('Como foi o treino?')`, 20000);
  check("'Treino registrado' stays, and the question comes right under it", await A.eval(`document.body.innerText.includes('Treino registrado') && !!document.querySelector('form.feedback-form')`));
  const words = await A.eval(`[...document.querySelectorAll('form.feedback-form .chips label')].map((l) => l.textContent.trim())`);
  check("the effort has five words and there is a pain box", JSON.stringify(words) === JSON.stringify(["Muito leve", "Leve", "Moderado", "Pesado", "Máximo", "Senti dor ou desconforto"]), JSON.stringify(words));
  check("'Enviar' and 'Pular' are there", (await A.eval(`[...document.querySelectorAll('form.feedback-form button')].map((b) => b.textContent.trim())`)).join(",") === "Enviar,Pular");
  check("the chips are at least 44 px tall", await A.eval(`[...document.querySelectorAll('form.feedback-form .chips label')].every((l) => l.getBoundingClientRect().height >= 44)`));
  await clickText(A, "form.feedback-form label", "^Pesado$");
  await clickText(A, "form.feedback-form label", "^Senti dor ou desconforto$");
  await setValue(A, "form.feedback-form textarea", "O ombro doeu no segundo exercício.");
  await sleep(200);
  await clickText(A, "form.feedback-form button", "^Enviar$");
  await must(A, "thanks", `document.body.innerText.includes('Obrigado!')`, 15000);
  const saved = await feedbackDoc();
  check(
    "the feedback is stored on the session's day: effort 8, pain, the comment, the aluno's side stamped by the server",
    f(saved, "effort") === "8" && f(saved, "pain") === true && f(saved, "studentComment") === "O ombro doeu no segundo exercício." && !!saved?.fields?.studentAt?.timestampValue && !saved?.fields?.trainerSeenAt,
    JSON.stringify(saved?.fields ?? null),
  );
  check("it names her trainer and herself", f(saved, "trainerId") === trainer && f(saved, "studentId") === ana && f(saved, "day") === today);
} catch (error) {
  check("Ana's first part completed", false, String(error.message ?? error));
}

// ================= 2. the personal: Registros, Hoje, Ana's page =================
const T = await browser("trainer-feedback", "desktop");
try {
  check("the personal signs in", (await T.login("treinador@teste.dev")).startsWith("/app"));

  // ---- Hoje: pain first ----
  await nav(T, "/app/");
  await must(T, "Hoje with the list", `location.pathname === '/app/' && !document.body.innerText.includes('Carregando') && !!document.querySelector('.attention-list')`);
  const rows = await T.eval(`[...document.querySelectorAll('.attention-list .attention-row')].map((r) => r.querySelector('.attention-name').textContent.trim() + ' / ' + r.querySelector('.attention-reason').textContent.trim() + ' / ' + r.querySelector('.attention-detail').textContent.trim())`);
  check("'Relatou dor' is the first row, with Ana's name and the session's day", /^Ana Costa \/ Relatou dor \/ Treino de \d\d\/\d\d\/\d{4} · esforço pesado$/.test(rows[0] ?? ""), JSON.stringify(rows));
  check("Bruno's older pain is not on Hoje (outside the week)", !rows.some((r) => /^Bruno Alves \/ Relatou dor/.test(r)));

  // ---- Registros ----
  await nav(T, "/app/registros/");
  await must(T, "Registros", `location.pathname === '/app/registros/' && !document.body.innerText.includes('Carregando') && document.querySelectorAll('.ledger-entry').length > 0`);
  await must(T, "the feedback in the book", `document.body.innerText.includes('O ombro doeu no segundo exercício.')`, 20000);
  const entry = () =>
    T.eval(`(() => { const e = [...document.querySelectorAll('.ledger-entry')].find((x) => x.innerText.includes('O ombro doeu no segundo exercício.')); return e ? e.innerText.replace(/\\n+/g, ' | ') : null; })()`);
  const anaEntry = await entry();
  check("Ana's session shows the effort word, the pain chip, her comment and 'Ainda não visto'", /Esforço: Pesado \(8\/10\)/.test(anaEntry ?? "") && /Relatou dor ou desconforto/.test(anaEntry ?? "") && /Ainda não visto/.test(anaEntry ?? ""), anaEntry ?? "");
  check("the buttons are 'Marcar como visto' and 'Comentar'", /Marcar como visto/.test(anaEntry ?? "") && /Comentar/.test(anaEntry ?? ""));

  // ---- Só não vistas ----
  await T.eval(`document.querySelector('.filters .check-line input').click(); true`);
  await sleep(500);
  const unseen = await T.eval(`[...document.querySelectorAll('.ledger-entry')].map((e) => e.querySelector('p').innerText.replace(/\\n+/g, ' '))`);
  check("'Só não vistas' keeps only Ana's new session and Bruno's old pain", unseen.length === 2 && unseen.some((t) => /Ana Costa/.test(t)) && unseen.some((t) => /Bruno Alves/.test(t)), JSON.stringify(unseen));
  check("Ana's answered session of yesterday is not among them", !(await T.text("main")).includes("Boa! Na próxima mantém a carga."));
  await T.eval(`document.querySelector('.filters .check-line input').click(); true`);
  await sleep(400);
  check("unticked, the whole book is back, with yesterday's answered session and the personal's comment", (await T.text("main")).includes("Boa! Na próxima mantém a carga."));

  // ---- mark seen, then comment ----
  await T.eval(`(() => { const e = [...document.querySelectorAll('.ledger-entry')].find((x) => x.innerText.includes('O ombro doeu no segundo exercício.')); [...e.querySelectorAll('button')].find((b) => /Marcar como visto/.test(b.textContent)).click(); return true; })()`);
  await must(T, "the entry marked seen", `(() => { const e = [...document.querySelectorAll('.ledger-entry')].find((x) => x.innerText.includes('O ombro doeu no segundo exercício.')); return !!e && /Visto pelo personal/.test(e.innerText) && !/Marcar como visto/.test(e.innerText); })()`, 15000);
  check("'Marcar como visto' writes only the personal's stamp (the aluno's side is untouched)", await (async () => {
    const d = await feedbackDoc();
    return !!d?.fields?.trainerSeenAt?.timestampValue && f(d, "effort") === "8" && f(d, "pain") === true && f(d, "studentComment") === "O ombro doeu no segundo exercício.";
  })());
  await T.eval(`(() => { const e = [...document.querySelectorAll('.ledger-entry')].find((x) => x.innerText.includes('O ombro doeu no segundo exercício.')); [...e.querySelectorAll('button')].find((b) => /^Comentar$/.test(b.textContent.trim())).click(); return true; })()`);
  await must(T, "the comment box", `!!document.querySelector('.feedback-comment-form textarea')`, 8000);
  await T.eval(`(() => { const e = document.querySelector('.feedback-comment-form button.button-primary'); e.click(); return true; })()`);
  check("an empty comment is refused with a word", await T.waitFor(`document.body.innerText.includes('Escreva o comentário antes de enviar.')`, 5000));
  await setValue(T, ".feedback-comment-form textarea", "Vamos olhar esse ombro na terça. Troque o supino por halteres até lá.");
  await sleep(200);
  await T.eval(`document.querySelector('.feedback-comment-form button.button-primary').click(); true`);
  await must(T, "the comment on screen", `document.body.innerText.includes('Troque o supino por halteres')`, 15000);
  const commented = await feedbackDoc();
  check("the comment is stored with the personal's stamp", f(commented, "trainerComment") === "Vamos olhar esse ombro na terça. Troque o supino por halteres até lá." && !!commented?.fields?.trainerAt?.timestampValue);

  // ---- Hoje no longer flags the pain (it was seen) ----
  await nav(T, "/app/");
  await must(T, "Hoje again", `location.pathname === '/app/' && !document.body.innerText.includes('Carregando') && !!document.querySelector('.attention-list')`);
  await sleep(500);
  check("once seen, Ana's pain leaves 'Hoje'", !(await T.eval(`[...document.querySelectorAll('.attention-row')].some((r) => /Ana Costa/.test(r.innerText) && /Relatou dor/.test(r.innerText))`)));

  // ---- Ana's page ----
  await nav(T, `/app/alunos/detalhe/?id=${ana}`);
  await must(T, "Ana's page", `location.pathname.startsWith('/app/alunos/detalhe') && !!document.querySelector('.student-summary') && document.body.innerText.includes('Anamnese') && !document.body.innerText.includes('Carregando')`);
  await sleep(1200);
  const summaryText = await T.text(".student-summary dl");
  check(
    "the summary header: último treino with the effort and the pain, the week, the horários, the contact and the anamnese",
    /Último treino \| \d\d\/\d\d\/\d{4} · esforço pesado ?Relatou dor/.test(summaryText) &&
      /Esta semana \| \d treinos? esta semana/.test(summaryText) &&
      /Horários \| Seg, Qua, Sex · 07:00/.test(summaryText) &&
      /Contato \| WhatsApp · Ligar/.test(summaryText) &&
      /Anamnese \| em dia \(\d\d\/\d\d\/\d{4}\)/.test(summaryText),
    summaryText,
  );
  const order = await T.eval(`['fichas','treinos','progressao','medidas','anamneses','mensalidade','permissoes','dados','gerenciar'].map((id) => { const e = document.getElementById(id); return e ? e.getBoundingClientRect().top + window.scrollY : -1; })`);
  check("the sections follow U9's order: Fichas, Treinos, Progressão, Medidas, Anamneses, Mensalidade, Permissões, Dados, Gerenciar", order.every((y, i) => y >= 0 && (i === 0 || y > order[i - 1])), JSON.stringify(order));
  const firstFichas = await T.eval(`document.getElementById('fichas').getBoundingClientRect().top < window.innerHeight`);
  check("at 1440 px the header and Fichas share the first screen", firstFichas);
  const treinos = await T.text("#treinos");
  check("'Treinos' lists the session with the aluno's report and the personal's comment", /Treinos/.test(treinos) && /Esforço: Pesado/.test(treinos) && /Troque o supino por halteres/.test(treinos), treinos.slice(0, 300));
  check("'Pausar aluno' moved under 'Gerenciar aluno'", await T.eval(`!!document.querySelector('#gerenciar') && /Pausar aluno/.test(document.querySelector('#gerenciar').innerText) && document.querySelector('#gerenciar h2').textContent === 'Gerenciar aluno'`));
} catch (error) {
  check("the personal's part completed", false, String(error.message ?? error));
}

// ================= 3. Ana reads the comment =================
try {
  await A.go("/aluno/", 3500);
  await must(A, "Ana's home", `location.pathname === '/aluno/' && !document.body.innerText.includes('Carregando') && document.body.innerText.includes('Olá,')`);
  check("her home says the personal commented, with the day", await A.eval(`/Comentário do seu personal/.test(document.body.innerText) && /Seu personal comentou seu treino de \\d\\d\\/\\d\\d\\./.test(document.body.innerText)`));
  await clickText(A, "main a", "^Ver o comentário$");
  await must(A, "Evolução with the feedback", `location.pathname === '/aluno/evolucao/' && document.body.innerText.includes('Troque o supino por halteres')`, 30000);
  const evolucao = await A.text("#treinos");
  check("in Evolução the session shows her effort, the pain, her words, '✓ Visto pelo personal' and the comment marked 'novo'", /Seu esforço: Pesado/.test(evolucao) && /Relatou dor/.test(evolucao) && /O ombro doeu/.test(evolucao) && /✓ Visto pelo personal/.test(evolucao) && /Seu personal comentou: Vamos olhar esse ombro/.test(evolucao) && /novo/.test(evolucao), evolucao);
  const cards = await A.eval(`[...document.querySelectorAll('#treinos .session-list > li')].map((li) => li.innerText.replace(/\\n+/g, ' | '))`);
  check(
    "yesterday's answered session is the second card, shows the personal's comment and has no 'novo' (she had read it)",
    /Boa! Na próxima mantém a carga\./.test(cards[1] ?? "") && !/novo/.test(cards[1] ?? "") && /novo/.test(cards[0] ?? ""),
    JSON.stringify(cards),
  );
  await sleep(1500);
  const read = await feedbackDoc();
  check("opening it stamps 'studentSeenAt' (and nothing else changes)", !!read?.fields?.studentSeenAt?.timestampValue && f(read, "effort") === "8" && f(read, "trainerComment") === "Vamos olhar esse ombro na terça. Troque o supino por halteres até lá.");
  await A.go("/aluno/", 3500);
  await must(A, "Ana's home again", `location.pathname === '/aluno/' && !document.body.innerText.includes('Carregando') && document.body.innerText.includes('Olá,')`);
  check("the banner is gone once she opened it", !(await A.eval(`/Seu personal comentou seu treino/.test(document.body.innerText)`)));
  const wa = await A.eval(`(() => { const a = [...document.querySelectorAll('main a')].find((x) => /Falar com/.test(x.textContent)); return a ? { text: a.textContent.trim(), href: a.href, rel: a.rel, target: a.target } : null; })()`);
  check("the seeded contact card shows 'Falar com Treinador no WhatsApp' as an external link", wa?.text === "Falar com Treinador no WhatsApp" && wa.href === "https://wa.me/5511999990000" && /noopener/.test(wa.rel) && wa.target === "_blank", JSON.stringify(wa));
} catch (error) {
  check("Ana's second part completed", false, String(error.message ?? error));
}

// ================= 4. the personal turns the WhatsApp card off and on =================
try {
  await nav(T, "/app/conta/");
  await must(T, "the contact card on the account page", `!!document.getElementById('trainer-contact-title') && /Ligado/.test(document.querySelector('[aria-labelledby=trainer-contact-title]').innerText)`, 30000);
  check("the card shows as on, pre-filled with the name and the number", await T.eval(`(() => { const s = document.querySelector('[aria-labelledby=trainer-contact-title]'); const inputs = s.querySelectorAll('input'); return inputs[0].value === 'Treinador de teste' && inputs[1].value === '5511999990000'; })()`));
  await T.eval(`(() => { const s = document.querySelector('[aria-labelledby=trainer-contact-title]'); [...s.querySelectorAll('button')].find((b) => /^Desligar$/.test(b.textContent.trim())).click(); return true; })()`);
  await must(T, "turned off", `/Desligado/.test(document.querySelector('[aria-labelledby=trainer-contact-title]').innerText)`, 15000);
  check("turning it off deletes the document", (await fsGet(`trainerContacts/${trainer}`)) === null);
  await A.go("/aluno/", 3500);
  await must(A, "Ana's home without the card", `location.pathname === '/aluno/' && !document.body.innerText.includes('Carregando') && document.body.innerText.includes('Olá,')`);
  check("Ana no longer sees 'Falar com …'", !(await A.eval(`/Falar com/.test(document.body.innerText)`)));
  // wrong number, then a right one
  await setValue(T, "[aria-labelledby=trainer-contact-title] input[inputmode=tel]", "123");
  await T.eval(`[...document.querySelectorAll('[aria-labelledby=trainer-contact-title] button')].find((b) => /Mostrar meu WhatsApp/.test(b.textContent)).click(); true`);
  check("a number that is not Brazilian is refused with a word", await T.waitFor(`/WhatsApp brasileiro com DDD/.test(document.querySelector('[aria-labelledby=trainer-contact-title]').innerText)`, 5000));
  await setValue(T, "[aria-labelledby=trainer-contact-title] input[inputmode=tel]", "(21) 98888-7777");
  await T.eval(`[...document.querySelectorAll('[aria-labelledby=trainer-contact-title] button')].find((b) => /Mostrar meu WhatsApp/.test(b.textContent)).click(); true`);
  await must(T, "turned on", `/Ligado/.test(document.querySelector('[aria-labelledby=trainer-contact-title]').innerText)`, 15000);
  const card = await fsGet(`trainerContacts/${trainer}`);
  check("the card is stored with digits only and the server's time", f(card, "whatsapp") === "5521988887777" && f(card, "name") === "Treinador de teste" && !!card?.fields?.updatedAt?.timestampValue, JSON.stringify(card?.fields ?? null));
  await A.go("/aluno/", 3500);
  await must(A, "Ana's home with the card", `location.pathname === '/aluno/' && !document.body.innerText.includes('Carregando') && document.body.innerText.includes('Olá,')`);
  check("Ana's button follows the new number", await A.eval(`[...document.querySelectorAll('main a')].some((a) => a.href === 'https://wa.me/5521988887777')`));
} catch (error) {
  check("the contact card part completed", false, String(error.message ?? error));
}

// ================= 5. Bruno's unseen pain, from the seed =================
const brunoDocs = (await fsList("sessionFeedback")).filter((d) => /bruno|_/.test(d.name) && f(d, "pain") === true && f(d, "studentId") !== ana);
check("Bruno's pain report from the seed is still unseen in Firestore", brunoDocs.length === 1 && !brunoDocs[0].fields.trainerSeenAt);

check("no page errors (Ana)", A.logs.length === 0, [...new Set(A.logs)].join(" || "));
check("no page errors (personal)", T.logs.length === 0, [...new Set(T.logs)].join(" || "));
A.close();
T.close();
process.exit(summary() ? 1 : 0);
