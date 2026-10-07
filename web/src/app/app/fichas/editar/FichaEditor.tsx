"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getFirebase } from "../../../../data/firebase";
import { trackActivity } from "../../../../data/activity";
import { loadExerciseCatalog } from "../../../../data/exerciseCatalog";
import { loadFormatPrompt } from "../../../../data/promptAssets";
import type { TrainerStudent } from "../../../../data/students";
import { FichaNotFound, createFicha, loadStudentFichas, saveFicha } from "../../../../data/workouts";
import { formatDate, localDate } from "../../../../domain/dates";
import type { Exercise } from "../../../../domain/exercise";
import { EDITOR_COPY } from "../../../../domain/editorCopy";
import { applyCatalogActivations, type ExerciseCatalog } from "../../../../domain/exerciseCatalog";
import { LEGACY_FICHA_NAME, MAX_FICHAS, fichaSaveErrors, type Ficha } from "../../../../domain/fichas";
import { kotlinTrim } from "../../../../domain/kotlin";
import { tidied } from "../../../../domain/reviewEdit";
import { parseWorkouts } from "../../../../domain/workoutParser";
import { ConfirmDialog } from "../../../_shared/ConfirmDialog";
import { useSession } from "../../../SessionProvider";
import { useTrainerData } from "../../useTrainerData";
import { TreinosEditor, type TreinoItem } from "./TreinosEditor";

// GOALS.md §34: making or editing a ficha — one screen for both. Top to bottom: the "Prompt de formatação de ficha"
// (a static text the trainer copies into their own AI), the Importador Inteligente (paste the AI's answer; each
// "Treino A/B/C…" title becomes a treino below), then the ficha itself: its name and its treinos. Nothing is written
// until "Salvar ficha"; then the whole ficha goes in one batch (data/workouts.ts). The site calls no AI.

/** A ficha being saved as new while the student already has the most the site keeps (MAX_FICHAS). */
interface OldestQuestion {
  /** The fichas that saving removes: the oldest one (oldest first would also list extras, which never happens in practice). */
  going: Ficha[];
  treinos: { name: string; exercises: Exercise[] }[];
  now: number;
}

type FormatPrompt = { status: "loading" } | { status: "error" } | { status: "ready"; text: string };

export function FichaEditor() {
  const { session } = useSession();
  const params = useSearchParams();
  const studentId = params.get("aluno") ?? "";
  const fichaId = params.get("ficha");
  if (session.status !== "signedIn") return null;
  return <Loader trainerId={session.uid} studentId={studentId} fichaId={fichaId} />;
}

function Loader({
  trainerId,
  studentId,
  fichaId,
}: {
  trainerId: string;
  studentId: string;
  fichaId: string | null;
}) {
  const { data } = useTrainerData(trainerId);
  const [existing, setExisting] = useState<Ficha | null | undefined>(fichaId ? undefined : null);

  useEffect(() => {
    if (!fichaId) return;
    let cancelled = false;
    loadStudentFichas(getFirebase().db, trainerId, studentId).then(
      (fichas) => !cancelled && setExisting(fichas.find((f) => f.id === fichaId) ?? null),
      () => !cancelled && setExisting(null),
    );
    return () => {
      cancelled = true;
    };
  }, [trainerId, studentId, fichaId]);

  if (data.status === "loading" || existing === undefined) return <p className="loading">Carregando…</p>;
  if (data.status === "error") return <p role="alert">{data.message}</p>;

  const account = data.snapshot.linked.find((l) => l.id === studentId);
  const draft = data.snapshot.drafts.find((d) => d.id === studentId);
  const student: TrainerStudent | null = account
    ? { kind: "linked", doc: account }
    : draft
      ? { kind: "draft", doc: draft }
      : null;
  const back = `/app/alunos/detalhe?id=${encodeURIComponent(studentId)}`;

  if (student === null) return <p>Aluno não encontrado.</p>;
  if (fichaId && existing === null) {
    return (
      <p>
        Ficha não encontrada. <Link href={back}>Voltar</Link>
      </p>
    );
  }
  // New fichas only for a connected student — see FichasSection for why.
  if (!existing && student.kind === "draft") {
    return (
      <p>
        Conecte {student.doc.name} pelo convite antes de montar fichas. <Link href={back}>Voltar</Link>
      </p>
    );
  }
  return <FichaForm trainerId={trainerId} student={student} existing={existing} back={back} timeZone={data.timeZone} />;
}

function FichaForm({
  trainerId,
  student,
  existing,
  back,
  timeZone,
}: {
  trainerId: string;
  student: TrainerStudent;
  existing: Ficha | null;
  back: string;
  timeZone: string;
}) {
  const router = useRouter();
  const [formatPrompt, setFormatPrompt] = useState<FormatPrompt>({ status: "loading" });
  const [catalog, setCatalog] = useState<ExerciseCatalog | "error" | "loading">("loading");
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [name, setName] = useState(existing ? (existing.legacy ? LEGACY_FICHA_NAME : existing.name) : "");
  const [items, setItems] = useState<TreinoItem[]>(
    () => existing?.treinos.map((t) => ({ key: t.id, id: t.id, name: t.name, exercises: t.exercises })) ?? [],
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState<OldestQuestion | null>(null);

  // Fetched up front, so "Copiar prompt" can copy inside the click itself — some browsers refuse a clipboard write
  // that waits on a network request first.
  useEffect(() => {
    let cancelled = false;
    loadFormatPrompt().then(
      (text) => !cancelled && setFormatPrompt({ status: "ready", text }),
      () => !cancelled && setFormatPrompt({ status: "error" }),
    );
    loadExerciseCatalog(getFirebase().db, trainerId).then(
      (loaded) => !cancelled && setCatalog(loaded),
      () => !cancelled && setCatalog("error"),
    );
    return () => {
      cancelled = true;
    };
  }, [trainerId]);

  async function copyPrompt(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Prompt copiado! Cole na sua IA de preferência.");
    } catch {
      setCopyStatus("Não foi possível copiar — abra “Ver o texto do prompt”, selecione e copie à mão.");
    }
  }

  /** The AI's answer replaces the treinos below (a text with no exercise changes nothing). Saving is separate. */
  function paste(text: string) {
    setPasted(text);
    const parsed = parseWorkouts(text);
    if (parsed.workouts.length === 0) {
      setWarnings(
        text.trim() === "" ? [] : ["Não encontrei exercícios nesse texto. Peça à IA no formato do prompt acima."],
      );
      return;
    }
    setWarnings(parsed.warnings);
    setItems(parsed.workouts.map((w) => ({ key: crypto.randomUUID(), id: null, name: w.name, exercises: w.exercises })));
  }

  async function trackSaved(now: number) {
    await trackActivity(getFirebase().db, trainerId, "fichaSaved", now, timeZone);
  }

  async function create(treinos: OldestQuestion["treinos"], now: number) {
    const { db } = getFirebase();
    await createFicha(db, trainerId, student.doc.id, { name, treinos }, now);
    await trackSaved(now);
    router.push(back);
  }

  async function confirmOldest() {
    if (question === null) return;
    const { treinos, now } = question;
    setQuestion(null);
    setBusy(true);
    try {
      await create(treinos, now);
    } catch {
      setErrors(["Não foi possível salvar a ficha. Nada foi alterado — tente de novo."]);
      setBusy(false);
    }
  }

  async function save(now: number) {
    if (catalog === "loading") {
      setErrors([EDITOR_COPY.waitToSave]);
      return;
    }
    const found = fichaSaveErrors(name, items);
    setErrors(found);
    if (found.length > 0) return;
    // The exercise data's muscles go onto every treino, new and edited, before anything is stored.
    const treinos = items.map((item) => ({
      id: item.id,
      name: kotlinTrim(item.name),
      exercises: tidied(catalog !== "error" ? applyCatalogActivations(item.exercises, catalog) : item.exercises),
    }));
    setBusy(true);
    try {
      const { db } = getFirebase();
      if (existing) {
        await saveFicha(db, trainerId, student.doc.id, existing.id, { name, treinos }, now);
        await trackSaved(now);
        router.push(back);
        return;
      }
      // Nothing is ever deleted on a guess: if what the student has cannot be read, nothing is saved.
      let current: Ficha[];
      try {
        current = await loadStudentFichas(db, trainerId, student.doc.id);
      } catch {
        setErrors(["Não foi possível conferir as fichas do aluno. Nada foi salvo — tente de novo."]);
        setBusy(false);
        return;
      }
      if (current.length >= MAX_FICHAS) {
        setQuestion({ going: current.slice(MAX_FICHAS - 1), treinos, now });
        setBusy(false);
        return;
      }
      await create(treinos, now);
    } catch (error) {
      setErrors([
        error instanceof FichaNotFound
          ? "Esta ficha já não existe. Volte para a lista do aluno."
          : "Não foi possível salvar a ficha. Nada foi alterado — tente de novo.",
      ]);
      setBusy(false);
    }
  }

  const when = (ficha: Ficha) => formatDate(localDate(ficha.updatedAt, timeZone));

  return (
    <main>
      <p className="eyebrow">
        <Link href={back}>← {student.doc.name}</Link>
      </p>
      <h1>{existing ? "Editar ficha" : "Nova ficha"}</h1>

      <section>
        <h2>Prompt de formatação de ficha</h2>
        <p>
          Cole este texto na IA que você usa, junto com o seu pedido, para ela devolver a ficha no formato que o site
          entende.
        </p>
        <button
          type="button"
          disabled={formatPrompt.status !== "ready"}
          onClick={() => {
            if (formatPrompt.status === "ready") void copyPrompt(formatPrompt.text);
          }}
        >
          Copiar prompt
        </button>
        {formatPrompt.status === "error" && (
          <p role="alert">Não foi possível carregar o prompt. Recarregue a página.</p>
        )}
        {copyStatus && <p role="status">{copyStatus}</p>}
        {formatPrompt.status === "ready" && (
          <details>
            <summary>Ver o texto do prompt</summary>
            <textarea readOnly value={formatPrompt.text} rows={14} aria-label="Prompt de formatação" />
          </details>
        )}
      </section>

      <section>
        <h2>Importador Inteligente</h2>
        <p>Cole aqui a resposta da IA. Cada título (Treino A, B, C…) vira um treino abaixo.</p>
        <textarea
          value={pasted}
          onChange={(e) => paste(e.target.value)}
          rows={8}
          aria-label="Texto para importar"
          placeholder={"Ex:\nTreino A\nSupino 3x12\nTreino B\nBiceps 12x4"}
        />
        {warnings.length > 0 && (
          <ul role="status">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Ficha</h2>
        <p>
          <label>
            Nome da ficha
            <input value={name} placeholder="Ex: Hipertrofia – outubro" onChange={(e) => setName(e.target.value)} />
          </label>
        </p>
        {existing?.legacy && (
          <p role="note">Esta ficha foi criada antes dos nomes de ficha; ao salvar, ela passa a ter o nome acima.</p>
        )}
        <TreinosEditor items={items} catalog={catalog} onChange={setItems} />
        {errors.length > 0 && (
          <ul role="alert">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="button-primary"
          disabled={busy || catalog === "loading"}
          onClick={() => void save(Date.now())}
        >
          {busy ? "Salvando…" : catalog === "loading" ? EDITOR_COPY.loading : "Salvar ficha"}
        </button>
      </section>

      <ConfirmDialog
        open={question !== null}
        title={`Você já tem ${MAX_FICHAS} fichas`}
        yesLabel="Excluir a mais antiga e salvar"
        noLabel="Cancelar"
        onYes={() => void confirmOldest()}
        onNo={() => setQuestion(null)}
      >
        {question && (
          <p>
            Ao salvar, {question.going.length === 1 ? "a mais antiga" : "as mais antigas"} —{" "}
            {question.going.map((ficha) => `“${ficha.name}”, modificada em ${when(ficha)}`).join("; ")} —{" "}
            {question.going.length === 1 ? "será excluída" : "serão excluídas"} para sempre. Esse processo não pode ser
            desfeito.
          </p>
        )}
      </ConfirmDialog>
    </main>
  );
}
