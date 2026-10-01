"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getFirebase } from "../../../../data/firebase";
import { loadPromptAssets, type PromptAssets } from "../../../../data/promptAssets";
import type { TrainerStudent } from "../../../../data/students";
import { loadStudentWorkouts, newWorkout, saveWorkout, saveWorkouts } from "../../../../data/workouts";
import type { Exercise } from "../../../../domain/exercise";
import { buildFichaPrompt } from "../../../../domain/fichaPrompt";
import { kotlinTrim } from "../../../../domain/kotlin";
import { calculateEffectiveVolume, parseWorkouts } from "../../../../domain/workoutParser";
import { applyPaste, manualExercise, workoutErrors, type Workout } from "../../../../domain/workouts";
import { useSession } from "../../../SessionProvider";
import { useTrainerData } from "../../useTrainerData";
import { MultiFichaReview, type ReviewItem } from "./MultiFichaReview";

// GOALS.md §23g: building a ficha — PromptFichaScreen and ManualWorkoutScreen on one page, since a
// desktop has the room: copy the §15 prompt into any AI app, paste the reply into Smart Paste
// (name and exercises fill in), adjust by hand, save. Texts follow the Android screens.

const VOLUME = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function FichaEditor() {
  const { session } = useSession();
  const params = useSearchParams();
  const studentId = params.get("aluno") ?? "";
  const workoutId = params.get("id");
  if (session.status !== "signedIn") return null;
  return <Loader trainerId={session.uid} studentId={studentId} workoutId={workoutId} />;
}

function Loader({
  trainerId,
  studentId,
  workoutId,
}: {
  trainerId: string;
  studentId: string;
  workoutId: string | null;
}) {
  const { data } = useTrainerData(trainerId);
  const [existing, setExisting] = useState<Workout | null | undefined>(workoutId ? undefined : null);

  useEffect(() => {
    if (!workoutId) return;
    let cancelled = false;
    loadStudentWorkouts(getFirebase().db, trainerId, studentId).then(
      (workouts) => !cancelled && setExisting(workouts.find((w) => w.id === workoutId) ?? null),
      () => !cancelled && setExisting(null),
    );
    return () => {
      cancelled = true;
    };
  }, [trainerId, studentId, workoutId]);

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
  if (workoutId && existing === null) {
    return (
      <p>
        Ficha não encontrada. <Link href={back}>Voltar</Link>
      </p>
    );
  }
  // New fichas only for a connected student — see WorkoutsSection for why.
  if (!existing && student.kind === "draft") {
    return (
      <p>
        Conecte {student.doc.name} pelo convite antes de montar fichas. <Link href={back}>Voltar</Link>
      </p>
    );
  }
  return <FichaForm trainerId={trainerId} student={student} existing={existing} back={back} />;
}

function FichaForm({
  trainerId,
  student,
  existing,
  back,
}: {
  trainerId: string;
  student: TrainerStudent;
  existing: Workout | null;
  back: string;
}) {
  const router = useRouter();
  const [assets, setAssets] = useState<PromptAssets | "error" | null>(null);
  const [request, setRequest] = useState("");
  const [prompt, setPrompt] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [name, setName] = useState(existing?.name ?? "");
  const [exercises, setExercises] = useState<Exercise[]>(existing?.exercises ?? []);
  const [newName, setNewName] = useState("");
  const [newSets, setNewSets] = useState("");
  const [newReps, setNewReps] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // GOALS.md §25: set when the pasted answer holds two or more treinos (new fichas only).
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  const [reviewWarnings, setReviewWarnings] = useState<string[]>([]);
  const [reviewErrors, setReviewErrors] = useState<string[]>([]);

  // Fetched up front, so "Copiar prompt" can copy inside the click itself — some browsers refuse a
  // clipboard write that waits on a network request first.
  useEffect(() => {
    let cancelled = false;
    loadPromptAssets().then(
      (loaded) => !cancelled && setAssets(loaded),
      () => !cancelled && setAssets("error"),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyPrompt(loaded: PromptAssets) {
    const text = buildFichaPrompt(loaded.template, loaded.volumeReference, student.doc, request);
    setPrompt(text);
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Prompt copiado! Cole na sua IA de preferência.");
    } catch {
      setCopyStatus("Não foi possível copiar — selecione o prompt abaixo e copie à mão.");
    }
  }

  function paste(text: string) {
    setPasted(text);
    setReviewErrors([]);
    // Several treinos in one answer: the phone's paste would pile them into one ficha, so the web
    // splits them and shows a review instead. An existing ficha is always a single one.
    if (!existing) {
      const parsed = parseWorkouts(text);
      if (parsed.workouts.length >= 2) {
        setReview(
          parsed.workouts.map((w, i) => ({
            key: `${i}-${w.name}`,
            name: w.name,
            include: true,
            exercises: w.exercises,
          })),
        );
        setReviewWarnings(parsed.warnings);
        return;
      }
    }
    setReview(null);
    setReviewWarnings([]);
    const next = applyPaste(text, { name, exercises });
    setName(next.name);
    setExercises(next.exercises);
  }

  function addExercise(event: FormEvent) {
    event.preventDefault();
    const result = manualExercise(newName, newSets, newReps);
    if ("error" in result) {
      setAddError(result.error);
      return;
    }
    setExercises([...exercises, result.exercise]);
    setNewName("");
    setNewSets("");
    setNewReps("");
    setAddError(null);
  }

  async function save() {
    const found = workoutErrors(name, exercises);
    setErrors(found);
    if (found.length > 0) return;
    setBusy(true);
    try {
      const now = Date.now();
      const workout = existing
        ? { ...existing, name: kotlinTrim(name), exercises } // ManualWorkoutScreen: existing.copy(name, exercises)
        : newWorkout(trainerId, student.doc.id, kotlinTrim(name), exercises, now);
      await saveWorkout(getFirebase().db, trainerId, workout, now);
      router.push(back);
    } catch {
      setErrors(["Não foi possível salvar a ficha. Tente de novo."]);
      setBusy(false);
    }
  }

  async function saveAll() {
    if (review === null) return;
    const chosen = review.filter((item) => item.include);
    const found = chosen.flatMap((item) =>
      workoutErrors(item.name, item.exercises).map((error) => `${item.name || "Treino sem nome"}: ${error}`),
    );
    setReviewErrors(found);
    if (found.length > 0 || chosen.length === 0) return;
    setBusy(true);
    try {
      const now = Date.now();
      // createdAt falls from the first treino to the last, so the trainer's newest-first list reads A, B, C.
      const workouts = chosen.map((item, index) =>
        newWorkout(trainerId, student.doc.id, kotlinTrim(item.name), item.exercises, now + (chosen.length - 1 - index)),
      );
      await saveWorkouts(getFirebase().db, trainerId, workouts, now);
      router.push(back);
    } catch {
      setReviewErrors(["Não foi possível salvar as fichas. Nenhuma foi gravada — tente de novo."]);
      setBusy(false);
    }
  }

  const volume = Object.entries(calculateEffectiveVolume(exercises)).sort(([, a], [, b]) => b - a);

  return (
    <main>
      <p className="eyebrow">
        <Link href={back}>← {student.doc.name}</Link>
      </p>
      <h1>{existing ? "Editar ficha" : "Nova ficha"}</h1>

      <section>
        <h2>Pedir à IA (opcional)</h2>
        <p>
          1. Descreva o que você quer abaixo. 2. Copie o prompt. 3. Cole em qualquer IA que você já usa (ChatGPT,
          Gemini, Claude...). 4. Cole a resposta dela no Importador Inteligente mais abaixo.
        </p>
        <p>
          <label>
            O que você quer nesta ficha?{" "}
            <textarea
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              rows={3}
              placeholder="Ex: treino de costas e bíceps, foco em volume, 12 séries efetivas de costas na semana..."
            />
          </label>
        </p>
        <button
          type="button"
          disabled={assets === null || assets === "error"}
          onClick={() => {
            if (assets !== null && assets !== "error") void copyPrompt(assets);
          }}
        >
          Copiar prompt
        </button>
        {assets === "error" && <p role="alert">Não foi possível carregar o modelo do prompt. Recarregue a página.</p>}
        {copyStatus && <p role="status">{copyStatus}</p>}
        {prompt !== null && (
          <p>
            <textarea readOnly value={prompt} rows={10} aria-label="Prompt" />
          </p>
        )}
      </section>

      <section>
        <h2>Importador Inteligente</h2>
        <p>Cole o texto (ex: Biceps 12x4) abaixo para identificar os exercícios automaticamente.</p>
        <textarea
          value={pasted}
          onChange={(e) => paste(e.target.value)}
          rows={8}
          aria-label="Texto para importar"
          placeholder={"Ex:\nFicha A\nSupino 3x12\nBiceps 12x4"}
        />
      </section>

      {review !== null ? (
        <MultiFichaReview
          items={review}
          warnings={reviewWarnings}
          errors={reviewErrors}
          busy={busy}
          onChange={setReview}
          onSave={() => void saveAll()}
          onCancel={() => {
            setReview(null);
            setReviewWarnings([]);
            setReviewErrors([]);
          }}
        />
      ) : (
        <>
          <section>
            <h2>Ficha</h2>
            <p>
              <label>
                Nome do treino (ex: Ficha A) <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
            </p>
            <h3>Lista de exercícios ({exercises.length})</h3>
            {exercises.length === 0 ? (
              <p>Nenhum exercício ainda.</p>
            ) : (
              <table className="stack">
                <thead>
                  <tr>
                    <th scope="col">Exercício</th>
                    <th scope="col">Séries</th>
                    <th scope="col">Reps</th>
                    <th scope="col">Músculos</th>
                    <th scope="col">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {exercises.map((exercise, index) => (
                    <tr key={index}>
                      <td data-label="Exercício">{exercise.name}</td>
                      <td data-label="Séries">{exercise.sets}</td>
                      <td data-label="Reps">{exercise.reps}</td>
                      <td data-label="Músculos">
                        {exercise.muscleActivation
                          ? Object.entries(exercise.muscleActivation)
                              .map(([muscle, coefficient]) => `${muscle} ${coefficient}`)
                              .join(", ")
                          : "—"}
                      </td>
                      <td data-label="">
                        <button type="button" onClick={() => setExercises(exercises.filter((_, i) => i !== index))}>
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <form onSubmit={addExercise}>
              <fieldset>
                <legend>Novo exercício</legend>
                <label>
                  Nome <input value={newName} onChange={(e) => setNewName(e.target.value)} />
                </label>{" "}
                <label>
                  Séries <input inputMode="numeric" value={newSets} onChange={(e) => setNewSets(e.target.value)} />
                </label>{" "}
                <label>
                  Reps <input value={newReps} onChange={(e) => setNewReps(e.target.value)} />
                </label>{" "}
                <button type="submit">Adicionar</button>
                {addError && <p role="alert">{addError}</p>}
              </fieldset>
            </form>

            {volume.length > 0 && (
              <>
                <h3>Volume efetivo por músculo (nesta ficha)</h3>
                <p>Faixa ideal de referência (intermediário): ~12-20 séries efetivas/semana por músculo.</p>
                <dl>
                  {volume.map(([muscle, sets]) => (
                    <div key={muscle}>
                      <dt>{muscle}</dt>
                      <dd>{VOLUME.format(sets)} séries efetivas</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </section>

          {errors.length > 0 && (
            <ul role="alert">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          <button type="button" className="button-primary" disabled={busy} onClick={() => void save()}>
            {busy ? "Salvando…" : "Salvar ficha"}
          </button>
        </>
      )}
    </main>
  );
}
