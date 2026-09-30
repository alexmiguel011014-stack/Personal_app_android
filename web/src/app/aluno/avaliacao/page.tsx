"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { submitAssessment } from "../../../data/assessments";
import { getFirebase } from "../../../data/firebase";
import { PAR_Q, emptyAnswers } from "../../../domain/assessments";
import { LEVELS, TRAINING_DAYS } from "../../../domain/studentProfile";
import type { LinkedStudentDoc } from "../../../domain/students";
import { useSession } from "../../SessionProvider";
import { useStudentData } from "../useStudentData";

// GOALS.md §23h: the PAR-Q+ self-assessment — StudentAssessmentScreen. Offered only while the
// trainer's request is pending and self-assessment is granted, as on the phone; sends one
// assessment and clears the request in the same batch (data/assessments.ts).

export default function AssessmentPage() {
  const { session } = useSession();
  if (session.status !== "signedIn") return null;
  return <Assessment uid={session.uid} />;
}

function Assessment({ uid }: { uid: string }) {
  const { data } = useStudentData(uid);
  if (data.status === "loading") return <p className="loading">Carregando…</p>;
  if (data.status === "error") return <p role="alert">{data.message}</p>;
  if (!data.profile.pendingAssessmentRequest || !data.profile.canSelfAssess) {
    return (
      <main>
        <h1>Autoavaliação</h1>
        <p>Nenhuma autoavaliação pendente.</p>
        <p>
          <Link href="/aluno">Voltar para as fichas</Link>
        </p>
      </main>
    );
  }
  return <AssessmentForm uid={uid} profile={data.profile} />;
}

function AssessmentForm({ uid, profile }: { uid: string; profile: LinkedStudentDoc }) {
  const [answers, setAnswers] = useState<Record<string, boolean>>(emptyAnswers);
  const [goal, setGoal] = useState(profile.goal);
  const [level, setLevel] = useState(profile.experienceLevel);
  const [days, setDays] = useState<string[]>(profile.trainingDays);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A level the trainer's form doesn't offer (typed on an older version) stays selectable.
  const levels: string[] = LEVELS.includes(profile.experienceLevel as (typeof LEVELS)[number]) || profile.experienceLevel === ""
    ? [...LEVELS]
    : [...LEVELS, profile.experienceLevel];

  async function send(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await submitAssessment(
        getFirebase().db,
        uid,
        profile.trainerId,
        answers,
        {
          goal: goal.trim(),
          experienceLevel: level.trim(),
          trainingDays: TRAINING_DAYS.filter((day) => days.includes(day)),
        },
        Date.now(),
      );
      setSent(true);
    } catch {
      setError("Não foi possível enviar. Verifique a conexão e tente de novo.");
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <main>
        <h1>Autoavaliação</h1>
        <p role="status">Autoavaliação enviada. Seu personal já pode ver — obrigado!</p>
        <p>
          <Link href="/aluno">Voltar para as fichas</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <p className="eyebrow">
        <Link href="/aluno">← Fichas</Link>
      </p>
      <h1>Autoavaliação</h1>
      <p>
        Seu personal pediu esta autoavaliação. Responda com sinceridade — uma resposta &quot;sim&quot; não impede o
        treino, ela ajuda a montar uma ficha segura para você.
      </p>
      <form onSubmit={(e) => void send(e)}>
        {PAR_Q.map((question, index) => (
          <fieldset key={question.key}>
            <legend>
              {index + 1}. {question.text}
            </legend>
            <label>
              <input
                type="radio"
                name={question.key}
                checked={answers[question.key] === false}
                onChange={() => setAnswers({ ...answers, [question.key]: false })}
              />{" "}
              Não
            </label>{" "}
            <label>
              <input
                type="radio"
                name={question.key}
                checked={answers[question.key] === true}
                onChange={() => setAnswers({ ...answers, [question.key]: true })}
              />{" "}
              Sim
            </label>
          </fieldset>
        ))}
        <p>
          <label>
            Objetivo <input value={goal} onChange={(e) => setGoal(e.target.value)} />
          </label>
        </p>
        <fieldset>
          <legend>Nível de experiência</legend>
          {levels.map((option) => (
            <label key={option}>
              <input type="radio" name="level" checked={level === option} onChange={() => setLevel(option)} /> {option}{" "}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Dias de treino</legend>
          {TRAINING_DAYS.map((day) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={days.includes(day)}
                onChange={(e) => setDays(e.target.checked ? [...days, day] : days.filter((d) => d !== day))}
              />{" "}
              {day}{" "}
            </label>
          ))}
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Enviando…" : "Enviar para o personal"}
        </button>
      </form>
    </main>
  );
}
