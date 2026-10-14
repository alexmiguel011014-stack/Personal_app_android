// node e2e/interacao.mjs [--shots <dir>] - GOALS.md section 38 (aluno <-> personal), the anamnese (38g) so far:
// the personal sends it from the aluno's page (letting the aluno answer when that was off) and can warn by WhatsApp;
// the aluno answers on a phone with taps only - PAR-Q+ unanswered at first, follow-ups only after a "Sim", "Continuar"
// saying how many answers are missing, a reload mid-way losing nothing, a review and a consent; Firestore is read after
// the send; the personal reads the report (points of attention first, in order), prints it (print media), brings the
// aluno's profile up to date after a confirmation; the aluno finds it under "Minhas avaliacoes".
// Needs the same bench as the other scripts (npm run dev:local, or the shifted one: EMULATOR_PORT_SHIFT / E2E_BASE).
import { mkdirSync } from "node:fs";
import { browser, check, summary, sleep, reseed, uidByEmail, fsList, fsGet, fieldValue } from "./lib.mjs";

const shotsAt = process.argv.includes("--shots") ? process.argv[process.argv.indexOf("--shots") + 1] : null;
if (shotsAt) mkdirSync(shotsAt, { recursive: true });
const J = (value) => JSON.stringify(value);

await reseed();
const diego = await uidByEmail("diego@teste.dev");
const ana = await uidByEmail("ana@teste.dev");
check("the seeded alunos exist", !!diego && !!ana);

const must = async (b, label, expression, ms = 40000) => {
  if (!(await b.waitFor(expression, ms))) throw new Error(`timed out waiting for: ${label}`);
};
const nav = (b, path) => b.eval(`window.next.router.push(${J(path)}); true`);
const noHorizontalScroll = (b) => b.eval(`document.documentElement.scrollWidth <= window.innerWidth`);
const shot = async (b, name) => {
  if (shotsAt) await b.shot(name, shotsAt);
};

// ---------- the aluno's side: taps ----------
const tap = async (b, legend, option) => {
  const result = await b.eval(`(() => {
    const f = [...document.querySelectorAll('fieldset.q')].find((x) => x.querySelector('legend')?.innerText.trim().startsWith(${J(legend)}));
    if (!f) return 'no question: ' + ${J(legend)};
    const l = [...f.querySelectorAll('label.chip')].find((x) => x.innerText.trim() === ${J(option)});
    if (!l) return 'no option: ' + ${J(option)} + ' in ' + ${J(legend)};
    l.click();
    return true;
  })()`);
  if (result !== true) throw new Error(String(result));
};
const typeIn = async (b, label, value) => {
  const result = await b.eval(`(() => {
    const l = [...document.querySelectorAll('label.q.field')].find((x) => x.querySelector('span')?.innerText.trim().startsWith(${J(label)}));
    const e = l && l.querySelector('input,textarea');
    if (!e) return 'no field: ' + ${J(label)};
    const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${J(value)});
    e.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  if (result !== true) throw new Error(String(result));
};
const checked = (b, legend, option) =>
  b.eval(`(() => { const f = [...document.querySelectorAll('fieldset.q')].find((x) => x.querySelector('legend')?.innerText.trim().startsWith(${J(legend)})); const l = f && [...f.querySelectorAll('label.chip')].find((x) => x.innerText.trim() === ${J(option)}); return !!l && l.querySelector('input').checked; })()`);
const primary = (b) => b.eval(`(() => { const x = document.querySelector('.step-actions button.button-primary'); return x ? { text: x.textContent.trim(), disabled: x.disabled } : null; })()`);
const next = async (b) => {
  if (!(await b.click("^(Continuar|Revisar)$", ".step-actions"))) throw new Error("Continuar not found");
  await sleep(500);
};
const stepTitle = (b) => b.eval(`document.querySelector('main h2')?.innerText ?? ''`);

// ---------- Firestore, read straight from the emulator ----------
const assessmentsOf = async (studentId) => (await fsList("assessments")).filter((d) => fieldValue(d.fields?.studentId) === studentId);
const userField = async (uid, key) => fieldValue((await fsGet(`users/${uid}`))?.fields?.[key]);
const listOf = (field) => (field?.arrayValue?.values ?? []).map((v) => fieldValue(v));
const answersOf = (doc) => doc.fields?.anamnesis?.mapValue?.fields?.answers?.mapValue?.fields ?? {};

// ================= 1. the personal sends it =================
const T = await browser("personal", "desktop");
try {
  check("the personal signs in", (await T.login("treinador@teste.dev")).startsWith("/app"));
  await must(T, "the dashboard", `location.pathname === '/app/' && !document.body.innerText.includes('Carregando')`);
  check("'Hoje' lists Diego as an 'Avaliação pendente' in 'Precisa de você' while his request is open", /Diego Rocha \| O aluno ainda não respondeu \| Avaliação pendente/.test(await T.text("main")));

  await nav(T, `/app/alunos/detalhe/?id=${ana}`);
  await must(T, "Ana's page", `location.search.includes('id=${ana}') && document.body.innerText.includes('Permissões do aluno')`);
  check("the old 'Solicitar autoavaliação' is now 'Enviar anamnese'", await T.eval(`[...document.querySelectorAll('main button')].some((b) => b.textContent.trim() === 'Enviar anamnese') && !/Solicitar autoavalia/.test(document.body.innerText)`));
  check("the aluno's number is a WhatsApp link and a call link (GOALS.md 38c, D2)", await T.eval(`(() => { const dd = [...document.querySelectorAll('main dd')].find((d) => /11999990000/.test(d.innerText)); const links = dd ? [...dd.querySelectorAll('a')].map((a) => a.getAttribute('href')) : []; return links.includes('https://wa.me/5511999990000') && links.includes('tel:+5511999990000'); })()`));
  check("with the permission off, nothing is written before the confirmation", (await userField(ana, "pendingAssessmentRequest")) !== true);
  await T.click("^Enviar anamnese$");
  await must(T, "the confirmation", `!!document.querySelector('dialog.confirm[open]')`, 8000);
  check("it asks to release the permission and send, in one confirmation", await T.eval(`/Liberar e enviar/.test(document.querySelector('dialog.confirm[open]').innerText)`));
  await T.eval(`[...document.querySelectorAll('dialog.confirm button')].find((b) => /^Liberar e enviar$/.test(b.textContent.trim())).click(); true`);
  await must(T, "the request sent", `document.body.innerText.includes('Anamnese enviada')`, 15000);
  check("Firestore: the permission is on and the request is pending", (await userField(ana, "canSelfAssess")) === true && (await userField(ana, "pendingAssessmentRequest")) === true);
  const wa = await T.eval(`[...document.querySelectorAll('main a')].find((a) => /Avisar no WhatsApp/.test(a.textContent))?.href ?? null`);
  check("'Avisar no WhatsApp' is a wa.me link to the aluno's number", !!wa && wa.startsWith("https://wa.me/5511999990000?text="), String(wa).slice(0, 80));
  const waText = wa ? decodeURIComponent(wa.split("?text=")[1] ?? "") : "";
  check("the message names the aluno and the page — and nothing about health", /^Oi, Ana!/.test(waText) && /\/aluno\/avaliacao\/$/.test(waText) && !/PAR-Q|dor|medic|cirurg|sa[uú]de/i.test(waText), waText);
  await shot(T, "01-personal-enviar-anamnese");
  await T.eval(`window.__keep = true; true`);

  // ================= 2. the aluno answers, on a phone =================
  const S = await browser("aluno", "mobile");
  try {
    check("Diego signs in (he has a pending request)", (await S.login("diego@teste.dev")).startsWith("/aluno"));
    await must(S, "his home", `location.pathname === '/aluno/' && !document.body.innerText.includes('Carregando')`);
    check("the home says 'Anamnese pendente'", await S.eval(`document.body.innerText.includes('Anamnese pendente')`));
    check("an aluno with no ficha is told what happens next", await S.eval(`/Seu personal ainda não montou sua ficha\\. Assim que montar, ela aparece aqui\\./.test(document.body.innerText)`));
    await nav(S, "/aluno/avaliacao/");
    await must(S, "the first step", `document.body.innerText.includes('Prontidão para o exercício')`);
    check("the page is the anamnese, not the old self-assessment", await S.eval(`document.querySelector('main h1')?.innerText.trim() === 'Anamnese' && /leva uns 5 minutos/.test(document.body.innerText)`));
    const none = await S.eval(`[...document.querySelectorAll('fieldset.q input')].filter((i) => i.checked).length`);
    check("PAR-Q+ starts with no answer selected (it used to start as 'Não' on all seven)", none === 0, String(none));
    const first = await primary(S);
    check("'Continuar' is disabled and the screen says how many answers are missing", first?.disabled === true && /Faltam 7 respostas/.test(await S.text("main")), JSON.stringify(first));
    check("no horizontal scroll on the phone", await noHorizontalScroll(S));
    await shot(S, "02-aluno-prontidao-vazia");

    for (let i = 1; i <= 7; i++) await tap(S, `${i}. `, i === 5 ? "Sim" : "Não");
    check("one 'Sim' shows the guidance, and the button is open", /não impede o treino/.test(await S.text("main")) && (await primary(S))?.disabled === false);
    await shot(S, "03-aluno-prontidao-sim");
    await next(S);

    // ---- Saúde: follow-ups appear only after the answer that needs them ----
    check("step 2 is Saúde, and no follow-up is shown yet", (await stepTitle(S)) === "Saúde" && !(await S.eval(`document.body.innerText.includes('Quais?') || document.body.innerText.includes('Onde?')`)));
    const missingSaude = await S.text("main");
    check("it says what is missing (Faltam N respostas)", /Faltam [345] respostas/.test(missingSaude), missingSaude.match(/Falta[^|]*/)?.[0]);
    await tap(S, "Você tem ou já teve alguma destas condições?", "Hipertensão");
    await tap(S, "Você tem ou já teve alguma destas condições?", "Outra");
    await must(S, "the follow-up", `document.body.innerText.includes('Qual outra condição?')`, 5000);
    await typeIn(S, "Qual outra condição?", "Enxaqueca");
    await tap(S, "Usa algum medicamento de uso contínuo?", "Sim");
    await must(S, "medication follow-up", `document.body.innerText.includes('Quais?')`, 5000);
    await typeIn(S, "Quais?", "Losartana");
    await tap(S, "Já fez alguma cirurgia?", "Não");
    await tap(S, "Sente dor ou tem alguma lesão hoje?", "Sim");
    await must(S, "pain follow-ups", `document.body.innerText.includes('Onde?') && document.body.innerText.includes('A dor piora')`, 5000);
    check("'Continuar' stays closed while the pain follow-ups are unanswered", (await primary(S))?.disabled === true);

    // ---- a reload in the middle loses nothing ----
    await sleep(600);
    await S.go("/aluno/avaliacao/", 3500);
    await must(S, "the resume question", `document.body.innerText.includes('Você tem uma anamnese em andamento')`, 30000);
    check("after a reload it offers to continue where the aluno stopped", await S.eval(`/etapa 2 de 6/.test(document.body.innerText) && [...document.querySelectorAll('button')].some((b) => /Continuar de onde parei/.test(b.textContent))`));
    await shot(S, "04-aluno-continuar-de-onde-parei");
    await S.click("Continuar de onde parei");
    await must(S, "step 2 again", `document.querySelector('main h2')?.innerText === 'Saúde'`, 8000);
    check("the answers are all still there", (await checked(S, "Você tem ou já teve alguma destas condições?", "Hipertensão")) && (await checked(S, "Usa algum medicamento de uso contínuo?", "Sim")) && (await checked(S, "Sente dor ou tem alguma lesão hoje?", "Sim")));
    check("including the typed text", await S.eval(`[...document.querySelectorAll('label.q.field input')].some((i) => i.value === 'Losartana') && [...document.querySelectorAll('label.q.field input')].some((i) => i.value === 'Enxaqueca')`));

    await tap(S, "Onde?", "Joelho");
    await tap(S, "Onde?", "Lombar");
    await tap(S, "A dor piora quando você se movimenta?", "Sim");
    const askedPregnancy = await S.eval(`document.body.innerText.includes('Está gestante')`);
    if (askedPregnancy) await tap(S, "Está gestante", "Não");
    check("a man is not asked about pregnancy (Diego)", askedPregnancy === false || (await userField(diego, "gender")) !== "Masculino");
    await shot(S, "05-aluno-saude");
    await next(S);

    // ---- Hábitos, Rotina, Objetivos, Medidas ----
    check("step 3 is Hábitos", (await stepTitle(S)) === "Hábitos");
    await tap(S, "Você fuma?", "Sim");
    await tap(S, "Bebe álcool?", "Às vezes");
    await tap(S, "Quantas horas dorme", "Menos de 5 h");
    await tap(S, "Como é a qualidade", "Ruim");
    await tap(S, "Como está seu nível de estresse?", "Alto");
    await tap(S, "No trabalho", "Sentado");
    await next(S);
    check("step 4 is Experiência e rotina", (await stepTitle(S)) === "Experiência e rotina");
    await tap(S, "Há quanto tempo você treina", "6 meses a 2 anos");
    await tap(S, "O que você pratica hoje?", "Musculação");
    for (const day of ["Segunda", "Quarta", "Sexta"]) await tap(S, "Em quais dias você pode treinar?", day);
    await tap(S, "Quanto tempo tem por treino?", "60 min");
    await tap(S, "Onde vai treinar?", "Academia");
    await next(S);
    check("step 5 is Objetivos", (await stepTitle(S)) === "Objetivos");
    await tap(S, "Qual é o seu objetivo principal?", "Força");
    await tap(S, "Em quanto tempo quer ver resultado?", "6 meses");
    await typeIn(S, "Algum exercício que você não gosta", "Agachamento búlgaro");
    await typeIn(S, "O que mais seu personal deveria saber?", "Tenho medo de lesionar o joelho de novo.");
    check("the optional text fields did not block 'Continuar'", (await primary(S))?.disabled === false);
    await next(S);
    check("step 6 is Medidas, and nothing in it is required", (await stepTitle(S)) === "Medidas" && (await primary(S))?.disabled === false);
    await typeIn(S, "Peso", "82,5");
    await typeIn(S, "Altura", "178");
    await typeIn(S, "Ano de nascimento", "1992");
    await next(S);

    // ---- review and consent ----
    check("the review lists the answers and offers 'Editar' per section", (await stepTitle(S)) === "Revisar e enviar" && (await S.eval(`document.body.innerText.includes('Hipertensão') && document.body.innerText.includes('82,5 kg') && document.querySelectorAll('.review-card button').length >= 5`)));
    const submit = () => S.eval(`(() => { const b = document.querySelector('.step-actions button[type=submit]'); return b ? b.disabled : null; })()`);
    check("'Enviar' stays closed until both consent boxes are ticked", (await submit()) === true);
    await S.eval(`document.querySelectorAll('fieldset.consent input')[0].click(); true`);
    check("one box is not enough", (await submit()) === true);
    await S.eval(`document.querySelectorAll('fieldset.consent input')[1].click(); true`);
    check("both boxes open it", (await submit()) === false);
    await shot(S, "06-aluno-revisar-e-consentir");
    check("no horizontal scroll on the review", await noHorizontalScroll(S));
    await S.click("^Enviar para o personal$", ".step-actions");
    await must(S, "the confirmation", `document.body.innerText.includes('Anamnese enviada')`, 20000);
    check("the aluno sees the confirmation", true);

    // ---- what was stored ----
    const sent = (await assessmentsOf(diego)).find((d) => d.fields?.anamnesis);
    check("Firestore: one assessment with the anamnese", !!sent);
    const answers = sent ? answersOf(sent) : {};
    check("it keeps the PAR-Q+ where the phone reads it, with the 'sim' on the joint question", !!sent && JSON.parse(fieldValue(sent.fields.parQAnswersJson)).bone_joint === true && JSON.parse(fieldValue(sent.fields.parQAnswersJson)).heart_condition === false);
    check("the answers are stored", fieldValue(answers.goal) === "Força" && fieldValue(answers.stress) === "Alto" && fieldValue(answers.medication_which) === "Losartana" && listOf(answers.pain_regions).join() === "Lombar,Joelho", JSON.stringify(Object.keys(answers)));
    check("numbers are stored as numbers (comma decimal read)", Number(fieldValue(answers.weight_kg)) === 82.5 && Number(fieldValue(answers.birth_year)) === 1992);
    check("the consent is stored with its version and the SERVER's time", fieldValue(sent?.fields?.consentVersion) === "anamnese-v1" && !!sent?.fields?.consentAt?.timestampValue, JSON.stringify(sent?.fields?.consentAt));
    check("the summary fields are the snapshot of the answers (objetivo, nível, dias)", fieldValue(sent?.fields?.goal) === "Força" && fieldValue(sent?.fields?.experienceLevel) === "Interm." && listOf(sent?.fields?.trainingDays).join() === "Segunda,Quarta,Sexta");
    check("the request is cleared on his profile, in the same batch", (await userField(diego, "pendingAssessmentRequest")) === false && (await userField(diego, "lastAssessmentId")) === sent?.name.split("/").pop());
    check("the draft is gone from the device after sending", await S.eval(`localStorage.getItem('allu:draft:anamnese:${diego}') === null`));
    const stored = JSON.stringify(sent?.fields ?? {});
    check("nothing about the anamnese reached the dashboard summaries (trainerStats / trainerActivity)", !/Losartana|Hipertens|joelho/i.test(JSON.stringify([...(await fsList("trainerStats")), ...(await fsList("trainerActivity"))])) && stored.length < 10000, `${stored.length} bytes`);

    // ================= 3. the personal reads the report =================
    await nav(T, `/app/alunos/detalhe/?id=${diego}`);
    await must(T, "Diego's page", `location.search.includes('id=${diego}') && document.body.innerText.includes('Anamneses e autoavaliações') && !document.body.innerText.includes('Carregando')`);
    check("his page lists the anamnese with the number of points of attention", await T.eval(`/Anamnese · /.test(document.body.innerText) && /ponto\\(s\\) de atenção/.test(document.body.innerText)`));
    check("and no pending request is shown any more", await T.eval(`!document.body.innerText.includes('aguardando o aluno responder')`));
    await T.click("^Ver relatório$");
    await must(T, "the report", `location.pathname.startsWith('/app/alunos/anamnese') && document.body.innerText.includes('Atenção') && !document.body.innerText.includes('Carregando')`);
    const flagTexts = await T.eval(`[...document.querySelectorAll('.flags li')].map((li) => li.querySelector('strong').innerText.trim())`);
    check("'Atenção' comes first, in the planned order, each point with a word", flagTexts.length >= 7 && /^Importante · PAR-Q\+/.test(flagTexts[0]) && flagTexts.slice(1).map((t) => t.split(" · ")[1]).join("|") === "Condições de saúde|Usa medicamento|Dor ou lesão hoje|Fumante|Dorme pouco|Estresse alto", flagTexts.join(" | "));
    check("the header says 'Anamnese nº 1', the date and that it is the first", await T.eval(`/Anamnese nº 1/.test(document.querySelector('.report-head').innerText) && /primeira do aluno/.test(document.querySelector('.report-head').innerText)`));
    check("the answers are there by section, and the free text under 'Nas palavras do aluno'", await T.eval(`['Saúde', 'Hábitos', 'Experiência e rotina', 'Objetivos', 'Medidas', 'Nas palavras do aluno'].every((h) => [...document.querySelectorAll('.report h2')].some((x) => x.innerText.trim() === h)) && document.body.innerText.includes('Tenho medo de lesionar')`));
    check("the consent line shows when and which text", await T.eval(`/Consentimento dado em .* · texto anamnese-v1/.test(document.querySelector('.report-consent')?.innerText ?? '')`));
    await shot(T, "07-personal-relatorio");

    // ---- printing: the shell and the buttons go away, the words stay ----
    await T.cdp("Emulation.setEmulatedMedia", { media: "print" });
    await sleep(400);
    const printed = await T.eval(`(() => {
      const visible = (sel) => { const e = document.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none'; };
      return { rail: visible('.rail'), actions: visible('.report-actions'), report: visible('.report'), bg: getComputedStyle(document.body).backgroundColor, flag: getComputedStyle(document.querySelector('.flag-alert')).backgroundColor };
    })()`);
    check("in print media the navigation and the buttons are gone and the report stays", printed.rail === false && printed.actions === false && printed.report === true, JSON.stringify(printed));
    check("and it is black on white (the alert has no colour fill)", printed.bg === "rgb(255, 255, 255)" && printed.flag === "rgb(255, 255, 255)", JSON.stringify(printed));
    await T.cdp("Emulation.setEmulatedMedia", { media: "" });

    // ---- bring the profile up to date, after seeing what changes ----
    const before = { goal: await userField(diego, "goal"), level: await userField(diego, "experienceLevel") };
    await T.click("^Atualizar dados do aluno$");
    await must(T, "the confirmation", `!!document.querySelector('dialog.confirm[open]')`, 8000);
    const listed = await T.eval(`document.querySelector('dialog.confirm[open]').innerText`);
    check("it lists exactly what changes, field by field", /Objetivo/.test(listed) && /Nível/.test(listed) && /Dias de treino/.test(listed) && /Restrições médicas/.test(listed), listed.replace(/\n+/g, " | ").slice(0, 220));
    check("nothing was written before the confirmation", (await userField(diego, "goal")) === before.goal);
    await T.eval(`[...document.querySelectorAll('dialog.confirm button')].find((b) => /^Atualizar$/.test(b.textContent.trim())).click(); true`);
    await must(T, "the notice", `document.body.innerText.includes('Dados do aluno atualizados')`, 15000);
    check("Firestore: objetivo, nível and dias now follow the anamnese", (await userField(diego, "goal")) === "Força" && (await userField(diego, "experienceLevel")) === "Interm.");
    check("and the restrictions are written in words", /Hipertensão/.test(String(await userField(diego, "medicalNotes"))) && /Dor ou lesão hoje: Lombar, Joelho/.test(String(await userField(diego, "medicalNotes"))), String(await userField(diego, "medicalNotes")));
    check("the button goes quiet once there is nothing left to change", await T.eval(`[...document.querySelectorAll('.report-actions button')].find((b) => /Atualizar dados do aluno/.test(b.textContent))?.disabled === true`));
    check("'Nova ficha' is one click away", await T.eval(`[...document.querySelectorAll('.report-actions a')].some((a) => /Nova ficha/.test(a.textContent) && a.href.includes('/app/fichas/editar/?aluno=${diego}'))`));

    // ================= 4. the aluno finds it again =================
    await nav(S, "/aluno/evolucao/");
    await must(S, "Evolução", `document.body.innerText.includes('Minhas avaliações') && !document.body.innerText.includes('Carregando')`);
    check("'Minhas avaliações' lists the anamnese with a link to it", await S.eval(`/Anamnese · 1 resposta\\(s\\) “sim”/.test(document.body.innerText) && [...document.querySelectorAll('main a')].some((a) => a.textContent.trim() === 'Ver')`));
    await S.click("^Ver$");
    await must(S, "his report", `location.pathname.startsWith('/aluno/anamnese') && document.body.innerText.includes('Atenção') && !document.body.innerText.includes('Carregando')`);
    check("he reads the same report, with print but without the personal's actions", await S.eval(`[...document.querySelectorAll('.report-actions button, .report-actions a')].map((x) => x.textContent.trim()).join('|') === 'Imprimir / salvar PDF'`));
    check("no horizontal scroll on the phone", await noHorizontalScroll(S));
    await shot(S, "08-aluno-minha-anamnese");

    // ================= 5. the next one shows what changed =================
    await nav(T, `/app/alunos/detalhe/?id=${diego}`);
    await must(T, "Diego's page", `location.search.includes('id=${diego}') && document.body.innerText.includes('Permissões do aluno')`);
    await T.click("^Enviar anamnese$");
    await must(T, "request pending", `document.body.innerText.includes('Anamnese enviada')`, 15000);
    check("a second request can be sent (the history is kept, nothing is overwritten)", (await userField(diego, "pendingAssessmentRequest")) === true && (await assessmentsOf(diego)).length === 1);
  } finally {
    S.close();
  }
  // ================= 6. the aluno's log form: a draft, sessions as cards, correct, delete =================
  const A = await browser("ana", "mobile");
  try {
    check("Ana signs in", (await A.login("ana@teste.dev")).startsWith("/aluno"));
    await must(A, "her home", `location.pathname === '/aluno/' && !document.body.innerText.includes('Carregando')`);
    const rowInput = (fieldset, index) => `(() => { const f = document.querySelectorAll('main form fieldset')[${fieldset}]; return f.querySelectorAll('input')[${index}]; })()`;
    const fill = (b, fieldset, index, value) =>
      b.eval(`(() => { const e = ${rowInput(fieldset, index)}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${J(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    const valueOf = (b, fieldset, index) => b.eval(`${rowInput(fieldset, index)}.value`);

    await nav(A, "/aluno/treino/?ficha=ficha-a");
    await must(A, "the log form", `document.body.innerText.includes('Salvar sessão')`);
    await fill(A, 0, 0, "40"); await fill(A, 0, 1, "10"); await fill(A, 0, 2, "42,5"); await fill(A, 0, 3, "8");
    await sleep(800);
    check("a draft is kept on the device while typing", await A.eval(`localStorage.getItem('allu:draft:log:${ana}:ficha-a') !== null`));
    await A.go("/aluno/treino/?ficha=ficha-a", 3500);
    await must(A, "the draft question", `document.body.innerText.includes('Você tem um treino não salvo')`, 30000);
    check("after a reload it offers the unsaved session, with its time", await A.eval(`/Você tem um treino não salvo de \\d\\d:\\d\\d\\./.test(document.body.innerText)`));
    await A.click("^Descartar$");
    await must(A, "a blank form", `document.body.innerText.includes('Salvar sessão')`, 8000);
    check("'Descartar' starts blank and removes the draft", (await valueOf(A, 0, 0)) === "" && (await A.eval(`localStorage.getItem('allu:draft:log:${ana}:ficha-a') === null`)));
    await fill(A, 0, 0, "40"); await fill(A, 0, 1, "10"); await fill(A, 0, 2, "42,5"); await fill(A, 0, 3, "8");
    await sleep(800);
    await A.go("/aluno/treino/?ficha=ficha-a", 3500);
    await must(A, "the draft question", `document.body.innerText.includes('Você tem um treino não salvo')`, 30000);
    await A.click("^Continuar$");
    await must(A, "the form again", `document.body.innerText.includes('Salvar sessão')`, 8000);
    check("'Continuar' brings every typed value back", (await valueOf(A, 0, 0)) === "40" && (await valueOf(A, 0, 1)) === "10" && (await valueOf(A, 0, 2)) === "42,5" && (await valueOf(A, 0, 3)) === "8");
    await A.click("^Salvar sessão$");
    await must(A, "saved", `document.body.innerText.includes('Treino registrado')`, 20000);
    check("saving removes the draft from the device", await A.eval(`localStorage.getItem('allu:draft:log:${ana}:ficha-a') === null`));
    const todayLogs = async () => (await fsList("workoutLogs")).filter((d) => fieldValue(d.fields?.studentId) === ana && Date.now() - Number(fieldValue(d.fields?.date)) < 12 * 3_600_000);
    check("Firestore: one document for the one exercise typed", (await todayLogs()).length === 1);
    const firstId = (await todayLogs())[0]?.name.split("/").pop();

    // ---- Evolução: sessions as cards, with the treino's name ----
    await nav(A, "/aluno/evolucao/");
    await must(A, "Evolução", `document.body.innerText.includes('Atividade recente') && !document.body.innerText.includes('Carregando')`);
    const titles = () => A.eval(`[...document.querySelectorAll('.session-list > li')].map((li) => li.querySelector('h3').innerText.trim())`);
    const first = await titles();
    check("'Atividade recente' opens on the newest three sessions, one card each (not one row per exercise), titled with the treino", first.length === 3 && first.every((c) => /Ficha A/.test(c)), first.join(" | "));
    const block = await A.eval(`Math.round([...document.querySelectorAll('main section')].find((s) => s.querySelector('h2')?.innerText.trim() === 'Atividade recente').getBoundingClientRect().height)`);
    check("and that block is much shorter on a phone (the old table of ten exercise rows took about 1,300 px; the whole page gets shorter with 38f's charts)", block < 900, `${block}px`);
    await shot(A, "09-aluno-evolucao-sessoes");
    await A.click("^Ver mais sessões$");
    await sleep(300);
    const cards = await titles();
    check("'Ver mais sessões' lists up to eight", cards.length >= 5 && cards.length <= 8, `${cards.length} sessions`);
    const actions = await A.eval(`[...document.querySelectorAll('.session-list > li')].map((li) => [...li.querySelectorAll('.session-actions a, .session-actions button')].map((x) => x.textContent.trim()).join('+'))`);
    check("only the sessions of the last seven days offer 'Corrigir' and 'Excluir sessão'", actions[0] === "Corrigir+Excluir sessão" && actions.filter((a) => a !== "").length === 4, JSON.stringify(actions));

    // ---- correct today's session ----
    await A.eval(`document.querySelector('.session-list > li .session-actions a').click(); true`);
    await must(A, "the correction form", `location.search.includes('sessao=') && document.body.innerText.includes('Salvar correção')`, 20000);
    check("the correction starts from what was saved", (await valueOf(A, 0, 0)) === "40" && (await valueOf(A, 0, 2)) === "42.5");
    await fill(A, 0, 0, "45");
    await A.click("^Salvar correção$");
    await must(A, "corrected", `document.body.innerText.includes('Sessão corrigida')`, 20000);
    const corrected = (await todayLogs())[0];
    check("Firestore: the same document now holds the corrected set", corrected?.name.endsWith(firstId) && /"weight":"45"/.test(fieldValue(corrected.fields.performedSetsJson)), fieldValue(corrected?.fields?.performedSetsJson));
    check("and there is still just one log for today", (await todayLogs()).length === 1);

    // ---- delete it ----
    const before = (await fsList("workoutLogs")).filter((d) => fieldValue(d.fields?.studentId) === ana).length;
    await nav(A, "/aluno/evolucao/");
    await must(A, "Evolução", `document.querySelectorAll('.session-list > li').length > 0 && !document.body.innerText.includes('Carregando')`);
    await A.eval(`[...document.querySelector('.session-list > li .session-actions').querySelectorAll('button')].find((b) => /Excluir sessão/.test(b.textContent)).click(); true`);
    await must(A, "the confirmation", `!!document.querySelector('dialog.confirm[open]')`, 8000);
    check("it warns that this cannot be undone", await A.eval(`/Esse processo não pode ser desfeito\./.test(document.querySelector('dialog.confirm[open]').innerText)`));
    await A.eval(`[...document.querySelectorAll('dialog.confirm button')].find((b) => /^Cancelar$/.test(b.textContent.trim())).click(); true`);
    await sleep(500);
    check("'Cancelar' deletes nothing", (await todayLogs()).length === 1);
    await A.eval(`[...document.querySelector('.session-list > li .session-actions').querySelectorAll('button')].find((b) => /Excluir sessão/.test(b.textContent)).click(); true`);
    await must(A, "the confirmation", `!!document.querySelector('dialog.confirm[open]')`, 8000);
    await A.eval(`[...document.querySelectorAll('dialog.confirm button')].find((b) => /^Excluir$/.test(b.textContent.trim())).click(); true`);
    await sleep(2500);
    check("Firestore: today's session is gone and Ana's other sessions are untouched", (await todayLogs()).length === 0 && (await fsList("workoutLogs")).filter((d) => fieldValue(d.fields?.studentId) === ana).length === before - 1);
    check("another aluno's logs were not touched", (await fsList("workoutLogs")).filter((d) => fieldValue(d.fields?.studentId) === diego).length === 3);
  } finally {
    A.close();
  }

  const errors = [...T.logs];
  check("no browser errors on the personal's screens", errors.length === 0, errors.join(" | ").slice(0, 300));
} catch (error) {
  check("script completed", false, `${error?.message ?? error}`);
} finally {
  T.close();
}
process.exit(summary() > 0 ? 1 : 0);
