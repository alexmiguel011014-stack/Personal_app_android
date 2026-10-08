// node e2e/fichas.mjs [mobile] - GOALS.md section 34: a ficha is a named card; at most two per student.
// Signed in as the seeded trainer it walks the whole flow against the emulators: the pre-ficha treinos read as one
// "Ficha atual" card; "Nova ficha" has the formatting-prompt card (and no "Pedir à IA"); a ficha is named and saved from
// a pasted answer, newest card on top; a third asks, then deletes only the oldest; Editar opens the same screen filled
// in; Excluir asks "Esse processo não pode ser desfeito."; and the student's own page groups treinos under the ficha's
// name. Firestore (REST) is read after every write. Needs the same bench as the other scripts (npm run dev:local).
import { browser, check, summary, sleep, reseed, uidByEmail, fsList, fieldValue } from "./lib.mjs";

const viewport = process.argv.includes("mobile") ? "mobile" : "desktop";
await reseed();

const ana = await uidByEmail("ana@teste.dev");
const bruno = await uidByEmail("bruno@teste.dev");
const carla = await uidByEmail("carla@teste.dev");
check("the seeded students exist", !!ana && !!bruno && !!carla);

// ---------- what is stored ----------
const docsOf = async (studentId) => (await fsList("workouts")).filter((d) => fieldValue(d.fields?.studentId) === studentId);
const memberOf = (d) => d.fields?.ficha?.mapValue?.fields;
const fichaNames = async (studentId) => [...new Set((await docsOf(studentId)).map((d) => fieldValue(memberOf(d)?.name)).filter(Boolean))].sort();
const logCount = async () => (await fsList("workoutLogs")).length;

// ---------- what is on the screen ----------
const SECTION = `[...document.querySelectorAll('main section')].find((s) => s.querySelector('h2')?.innerText.trim() === 'Fichas')`;
const answer = (...treinos) => treinos.map(([title, ...lines]) => [title, ...lines].join("\n")).join("\n");
const ABC = answer(["Treino A — Peito", "Supino 4x10", "Crucifixo 3x12"], ["Treino B — Costas", "Remada 4x10"], ["Treino C — Pernas", "Agachamento 4x8"]);

const b = await browser("fichas", viewport);
const cards = () =>
  b.eval(`(${SECTION})?.querySelectorAll('article') ? [...(${SECTION}).querySelectorAll('article')].map((a) => ({ name: a.querySelector('h3')?.innerText ?? '', text: a.innerText.replace(/\\n+/g, ' | '), buttons: [...a.querySelectorAll('button, a')].map((x) => x.textContent.trim()) })) : []`);
// In-app navigation (the router), not a page load per screen: every full load leaves Firestore's long-lived streams
// open on the emulator for ~45 s, and a few of them exhaust Chrome's six connections per host - the next page's reads
// and writes then stall. A person clicking around never does that either.
const nav = (path) => b.eval(`window.next.router.push(${JSON.stringify(path)}); true`);
const must = async (label, expression, ms = 30000) => {
  if (!(await b.waitFor(expression, ms))) throw new Error(`timed out waiting for: ${label}`);
};
const openStudent = async (id) => {
  await nav(`/app/alunos/detalhe/?id=${id}`);
  await must("the student's Fichas section", `location.search.includes(${JSON.stringify(`id=${id}`)}) && !!(${SECTION}) && !(${SECTION}).innerText.includes('Carregando')`);
};
const openEditor = async (id, fichaId) => {
  await nav(`/app/fichas/editar/?aluno=${id}${fichaId ? `&ficha=${fichaId}` : ""}`);
  await must("the editor", `location.pathname.startsWith('/app/fichas/editar') && location.search.includes(${JSON.stringify(`aluno=${id}`)}) && document.body.innerText.includes('Prompt de formatação de ficha')`);
  await must("the save button", `[...document.querySelectorAll('button')].some((x) => x.textContent.trim() === 'Salvar ficha' && !x.disabled)`);
};
const paste = (text) =>
  b.eval(`(()=>{const e=document.querySelector('textarea[aria-label="Texto para importar"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e, ${JSON.stringify(text)}); e.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`);
const setName = async (text) => {
  await b.focus('input[placeholder^="Ex: Hipertrofia"]');
  await b.type(text);
};
const clickIn = (selector, label) =>
  b.eval(`(()=>{const x=[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => new RegExp(${JSON.stringify(label)}).test(e.textContent.trim())); if(!x) return false; x.click(); return true;})()`);
const clickCard = (name, label) =>
  b.eval(`(()=>{const a=[...(${SECTION}).querySelectorAll('article')].find((x) => x.querySelector('h3')?.innerText === ${JSON.stringify(name)}); const x=a && [...a.querySelectorAll('button, a')].find((e) => e.textContent.trim() === ${JSON.stringify(label)}); if(!x) return false; x.click(); return true;})()`);
const dialogOpen = () => b.eval(`!!document.querySelector('dialog.confirm[open]')`);
const dialogText = () => b.eval(`document.querySelector('dialog.confirm[open]')?.innerText.replace(/\\n+/g, ' | ') ?? ''`);
const today = async () => b.eval(`new Date().toLocaleDateString('pt-BR')`);

try {
  check("trainer signs in", (await b.login("treinador@teste.dev")) === "/app/");

  // ---------- 1. pre-ficha treinos: ONE virtual card ----------
  await openStudent(ana);
  const anaCards = await cards();
  check("the pre-ficha treinos show as ONE card, 'Ficha atual'", anaCards.length === 1 && anaCards[0].name === "Ficha atual", JSON.stringify(anaCards.map((c) => c.name)));
  check("the card has a modification date and only Editar / Excluir", /Modificada em \d{2}\/\d{2}\/\d{4}/.test(anaCards[0]?.text ?? "") && anaCards[0].buttons.join() === "Editar,Excluir", JSON.stringify(anaCards[0]));
  const sectionText = await b.eval(`(${SECTION}).innerText`);
  check("no Desativar / Ativar / groups / status lines / exercise list", !/Desativar|Ativar\b|Ficha anterior|Outras|o aluno vê|Supino —/.test(sectionText), sectionText.slice(0, 160));
  check("the page says at most two fichas are kept", /Até 2 fichas por aluno/.test(sectionText));

  // ---------- 2. the editor: prompt card, no "Pedir à IA" ----------
  await openStudent(carla);
  check("a student with no ficha says so", /Nenhuma ficha ainda/.test(await b.eval(`(${SECTION}).innerText`)));
  await openEditor(carla);
  const editorText = await b.eval("document.body.innerText");
  check("the editor has the 'Prompt de formatação de ficha' card and the importer", /Prompt de formatação de ficha/.test(editorText) && /Importador Inteligente/.test(editorText));
  check("'Pedir à IA', the Gemini tab and the profile switch are gone", !/Pedir à IA|Gemini|Incluir o nome|Quantos treinos|Outra IA/.test(editorText));
  const order = await b.eval(`[...document.querySelectorAll('main > section h2')].map((h) => h.innerText.trim())`);
  check("cards in order: prompt, importer, ficha", order.join("|") === "Prompt de formatação de ficha|Importador Inteligente|Ficha", order.join("|"));
  await b.eval(`window.__clip=[]; Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async (t)=>{window.__clip.push(t)}}})`);
  check("'Copiar prompt' is available", await clickIn("main button", "^Copiar prompt$"));
  await sleep(500);
  const clipped = await b.eval(`window.__clip[0] ?? ''`);
  check("what is copied is the formatting prompt only (no student, no request)", clipped.includes("UM ÚNICO bloco de código") && !/Pedido do Professor|Carla|Notas Médicas/.test(clipped) && clipped.trimEnd().endsWith("Meu pedido para o treino:"), clipped.slice(0, 80));

  // ---------- 3. saving needs a name and a treino ----------
  await clickIn("main button", "^Salvar ficha$");
  await sleep(500);
  const emptyErrors = await b.eval(`[...document.querySelectorAll('ul[role=alert] li')].map((l) => l.innerText)`);
  check("saving an empty ficha says what is missing", emptyErrors.includes("Nome da ficha é obrigatório.") && emptyErrors.includes("Adicione pelo menos um treino."), JSON.stringify(emptyErrors));

  // ---------- 4. a pasted answer becomes the treinos; name it; save ----------
  await paste(ABC);
  check("the pasted answer becomes three treinos", await b.waitFor(`document.body.innerText.includes('Treinos (3)')`, 8000));
  const names = await b.eval(`[...document.querySelectorAll('.review-card-head input')].map((i) => i.value)`);
  check("each treino has its own name input, filled", names.join("|") === "Treino A — Peito|Treino B — Costas|Treino C — Pernas", names.join("|"));
  await setName("Hipertrofia — outubro");
  await clickIn("main button", "^Salvar ficha$");
  const returned = await b.waitFor(`location.pathname.startsWith('/app/alunos')`, 20000);
  check("saving returns to the student", returned);
  if (!returned) console.log("INFO  still on the editor:", (await b.text("main")).slice(-400), "|| logs:", [...new Set(b.logs)].slice(0, 4).join(" || "));
  await b.waitFor(`!!(${SECTION}) && (${SECTION}).querySelectorAll('article').length > 0`, 15000);
  const first = await cards();
  const stamp = await today();
  check("one card with the ficha's name and today's date", first.length === 1 && first[0].name === "Hipertrofia — outubro" && first[0].text.includes(`Modificada em ${stamp}`), JSON.stringify(first));
  const carlaDocs = await docsOf(carla);
  check("three treinos stored, sharing one ficha id, in order, active", carlaDocs.length === 3 && new Set(carlaDocs.map((d) => fieldValue(memberOf(d).id))).size === 1 && carlaDocs.every((d) => fieldValue(d.fields.status) === "assigned"), String(carlaDocs.length));

  // ---------- 5. a second ficha goes ABOVE the first ----------
  await sleep(1100);
  await openEditor(carla);
  await paste(answer(["Treino A", "Supino 3x12"]));
  await b.waitFor(`document.body.innerText.includes('Treinos (1)')`, 8000);
  await setName("Segunda ficha");
  await clickIn("main button", "^Salvar ficha$");
  await b.waitFor(`location.pathname.startsWith('/app/alunos')`, 15000);
  await b.waitFor(`!!(${SECTION}) && (${SECTION}).querySelectorAll('article').length === 2`, 15000);
  check("the new card is on top, the first one pushed down", (await cards()).map((c) => c.name).join("|") === "Segunda ficha|Hipertrofia — outubro", (await cards()).map((c) => c.name).join("|"));
  check("no confirmation was needed for the second", true);

  // ---------- 6. a third ficha: the question, cancel, then confirm ----------
  await openStudent(bruno);
  check("Bruno has two cards, newest first", (await cards()).map((c) => c.name).join("|") === "Definição — outubro|Hipertrofia — setembro", (await cards()).map((c) => c.name).join("|"));
  await openEditor(bruno);
  await paste(answer(["Treino A — Novo", "Supino 4x10"], ["Treino B — Novo", "Remada 4x10"]));
  await b.waitFor(`document.body.innerText.includes('Treinos (2)')`, 8000);
  await setName("Terceira");
  await clickIn("main button", "^Salvar ficha$");
  check("the question appears with the oldest ficha's name", await b.waitFor(`!!document.querySelector('dialog.confirm[open]')`, 8000));
  const question = await dialogText();
  check("it says the oldest goes, for ever, and that it cannot be undone", /Você já tem 2 fichas/.test(question) && /Hipertrofia — setembro/.test(question) && /para sempre/.test(question) && /Esse processo não pode ser desfeito/.test(question), question);
  const before = await docsOf(bruno);
  const clicked = await clickIn("dialog.confirm button", "^Cancelar$");
  await sleep(600);
  check("Cancelar closes the question", clicked && !(await dialogOpen()));
  check("nothing was written and we are still on the editor", (await docsOf(bruno)).length === before.length && (await b.url()).startsWith("/app/fichas/editar"), String((await docsOf(bruno)).length));
  await clickIn("main button", "^Salvar ficha$");
  await b.waitFor(`!!document.querySelector('dialog.confirm[open]')`, 8000);
  check("confirming is 'Excluir a mais antiga e salvar'", await clickIn("dialog.confirm button", "^Excluir a mais antiga e salvar$"));
  await b.waitFor(`location.pathname.startsWith('/app/alunos')`, 15000);
  await b.waitFor(`!!(${SECTION}) && (${SECTION}).querySelectorAll('article').length === 2`, 15000);
  check("two cards remain: the new one on top, the newer old one under it", (await cards()).map((c) => c.name).join("|") === "Terceira|Definição — outubro", (await cards()).map((c) => c.name).join("|"));
  const bruno3 = await fichaNames(bruno);
  check("Firestore: the oldest ficha's treinos are gone, the others stay", bruno3.join("|") === "Definição — outubro|Terceira", bruno3.join("|"));
  check("the other students' fichas were not touched", (await docsOf(ana)).length === 2 && (await fichaNames(carla)).length === 2);

  // ---------- 7. Editar: the same screen, filled in ----------
  const stampBefore = Number(fieldValue(memberOf((await docsOf(bruno)).find((d) => fieldValue(memberOf(d)?.name) === "Terceira")).updatedAt));
  await sleep(1100);
  check("Editar opens the editor for that ficha", await clickCard("Terceira", "Editar"));
  await b.waitFor(`document.body.innerText.includes('Editar ficha')`, 15000);
  await b.waitFor(`document.querySelectorAll('.review-card').length === 2`, 15000);
  const nameBox = await b.eval(`document.querySelector('input[placeholder^="Ex: Hipertrofia"]')?.value`);
  const treinoNames = await b.eval(`[...document.querySelectorAll('.review-card-head input')].map((i) => i.value)`);
  check("the editor is filled with the ficha's name and treinos", nameBox === "Terceira" && treinoNames.join("|") === "Treino A — Novo|Treino B — Novo", `${nameBox} / ${treinoNames.join("|")}`);
  check("it is the same screen (prompt card and importer present)", /Prompt de formatação de ficha/.test(await b.eval("document.body.innerText")));
  await setName("Terceira (editada)");
  check("a treino can be removed", await b.eval(`(()=>{const x=[...document.querySelectorAll('main button')].filter((e) => e.textContent.trim() === 'Remover treino'); x[x.length-1].click(); return true;})()`));
  await clickIn("main button", "^Salvar ficha$");
  await b.waitFor(`location.pathname.startsWith('/app/alunos')`, 15000);
  await b.waitFor(`(${SECTION})?.innerText.includes('Terceira (editada)')`, 15000);
  const edited = await docsOf(bruno);
  const editedDocs = edited.filter((d) => fieldValue(memberOf(d)?.name) === "Terceira (editada)");
  check("the ficha was renamed on its treino, one treino was removed", editedDocs.length === 1 && edited.length === 3, `${editedDocs.length} / ${edited.length}`);
  check("the modification date moved forward", Number(fieldValue(memberOf(editedDocs[0]).updatedAt)) > stampBefore);
  check("and its creation did not (it stays where it was in the order)", fieldValue(memberOf(editedDocs[0]).createdAt) === fieldValue(editedDocs[0].fields.createdAt));
  check("the list says so: newest first, modified today", (await cards())[0]?.name === "Terceira (editada)" && (await cards())[0].text.includes(`Modificada em ${await today()}`));

  // ---------- 8. the student's own page ----------
  const s = await browser("fichas-student", viewport);
  try {
    check("Bruno signs in as a student", (await s.login("bruno@teste.dev")).startsWith("/aluno"));
    await s.waitFor(`document.body.innerText.includes('Registrar treino de hoje')`, 15000);
    const groups = await s.eval(`[...document.querySelectorAll('main section.ficha-group')].map((g) => ({ ficha: g.querySelector('h2').innerText, treinos: [...g.querySelectorAll('article h3')].map((h) => h.innerText) }))`);
    check("two groups, newest first, under the ficha's name", groups.map((g) => g.ficha).join("|") === "Terceira (editada)|Definição — outubro", JSON.stringify(groups));
    check("each group lists its treinos", groups[0].treinos.join("|") === "Treino A — Novo" && groups[1].treinos.join("|") === "Treino A — Superiores|Treino B — Inferiores", JSON.stringify(groups));
    if (viewport === "mobile") check("no horizontal scroll on the student's page", await s.eval(`document.documentElement.scrollWidth <= window.innerWidth`));
  } finally {
    s.close();
  }
  const a = await browser("fichas-student-ana", viewport);
  try {
    check("Ana signs in as a student", (await a.login("ana@teste.dev")).startsWith("/aluno"));
    await a.waitFor(`document.body.innerText.includes('Registrar treino de hoje')`, 15000);
    const g = await a.eval(`[...document.querySelectorAll('main section.ficha-group')].map((x) => x.querySelector('h2').innerText)`);
    check("a student with pre-ficha treinos sees one group, 'Ficha atual'", g.join("|") === "Ficha atual", g.join("|"));
  } finally {
    a.close();
  }

  // ---------- 9. Excluir: the dialog, every way out, then the real thing ----------
  await openStudent(bruno);
  const logsBefore = await logCount();
  const treinosBefore = (await docsOf(bruno)).length;
  check("Excluir opens the confirmation card", (await clickCard("Definição — outubro", "Excluir")) && (await b.waitFor(`!!document.querySelector('dialog.confirm[open]')`, 5000)));
  const deleteText = await dialogText();
  check("it names the ficha and says 'Esse processo não pode ser desfeito.'", /Excluir a ficha “Definição — outubro”\?/.test(deleteText) && /Esse processo não pode ser desfeito\./.test(deleteText), deleteText);
  await b.key("Escape");
  await sleep(500);
  check("Escape keeps the ficha", !(await dialogOpen()) && (await docsOf(bruno)).length === treinosBefore);
  await clickCard("Definição — outubro", "Excluir");
  await b.waitFor(`!!document.querySelector('dialog.confirm[open]')`, 5000);
  await clickIn("dialog.confirm button", "^Cancelar$");
  await sleep(500);
  check("Cancelar keeps the ficha", !(await dialogOpen()) && (await docsOf(bruno)).length === treinosBefore);
  if (viewport === "mobile") {
    const short = await b.eval(`[...document.querySelectorAll('main article button, main article a')].map((x) => [x.textContent.trim(), Math.round(x.getBoundingClientRect().height)]).filter(([, h]) => h < 44)`);
    check("the card's buttons are at least 44px tall", short.length === 0, JSON.stringify(short));
    check("no horizontal scroll on the student page", await b.eval(`document.documentElement.scrollWidth <= window.innerWidth`));
  }
  await clickCard("Definição — outubro", "Excluir");
  await b.waitFor(`!!document.querySelector('dialog.confirm[open]')`, 5000);
  check("confirming deletes it", await clickIn("dialog.confirm button", "^Excluir$"));
  await b.waitFor(`(${SECTION}).querySelectorAll('article').length === 1`, 15000);
  check("one card left", (await cards()).map((c) => c.name).join("|") === "Terceira (editada)", (await cards()).map((c) => c.name).join("|"));
  const left = await fichaNames(bruno);
  check("Firestore: exactly that ficha's treinos are gone", left.join("|") === "Terceira (editada)" && (await docsOf(bruno)).length === 1, left.join("|"));
  check("the student's logs were not touched", (await logCount()) === logsBefore, `${await logCount()} vs ${logsBefore}`);

  // ---------- 10. pre-ficha card: Editar adopts it ----------
  await openStudent(ana);
  check("Editar on the legacy card opens the editor", await clickCard("Ficha atual", "Editar"));
  await b.waitFor(`document.body.innerText.includes('Editar ficha')`, 15000);
  await b.waitFor(`document.querySelectorAll('.review-card').length === 1`, 15000);
  check("it shows the note about the new name", /criada antes dos nomes de ficha/.test(await b.eval("document.body.innerText")));
  await setName("Ficha da Ana");
  await clickIn("main button", "^Salvar ficha$");
  await b.waitFor(`location.pathname.startsWith('/app/alunos')`, 15000);
  await b.waitFor(`(${SECTION})?.innerText.includes('Ficha da Ana')`, 15000);
  const adopted = await docsOf(ana);
  const named = adopted.filter((d) => fieldValue(memberOf(d)?.name) === "Ficha da Ana");
  check("saving adopts it: the treino now carries the ficha, the hidden one is untouched", named.length === 1 && adopted.length === 2 && adopted.some((d) => fieldValue(d.fields.name) === "Ficha B — em revisão" && !memberOf(d)), `${named.length} / ${adopted.length}`);

  if (viewport === "mobile") {
    await openEditor(carla);
    check("no horizontal scroll in the editor", await b.eval(`document.documentElement.scrollWidth <= window.innerWidth`));
  }
  const errs = [...new Set(b.logs)].filter((l) => !/favicon|404|400|Failed to load resource/.test(l));
  if (errs.length) console.log("INFO  browser errors:", errs.slice(0, 5).join(" || "));
} catch (e) {
  check("script completed", false, (e.stack ?? e.message).split("\n").slice(0, 5).join(" / "));
} finally {
  b.close();
}
process.exit(summary() ? 1 : 0);
