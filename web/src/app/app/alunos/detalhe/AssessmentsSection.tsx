"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadStudentAssessments } from "../../../../data/assessments";
import { getFirebase } from "../../../../data/firebase";
import { anamnesisFlags } from "../../../../domain/anamnesis";
import { flaggedQuestions, type Assessment } from "../../../../domain/assessments";
import { formatDateTime } from "../../../../domain/dates";

// GOALS.md §23g: the phone's "Autoavaliações" (AssessmentCard) — every PAR-Q+ the student sent,
// newest first, with the "sim" answers spelled out: those are what the trainer must look at.

type State = { status: "loading" } | { status: "error" } | { status: "ready"; assessments: Assessment[] };

export function AssessmentsSection({
  trainerId,
  studentId,
  timeZone,
}: {
  trainerId: string;
  studentId: string;
  timeZone: string;
}) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadStudentAssessments(getFirebase().db, trainerId, studentId).then(
      (assessments) => !cancelled && setState({ status: "ready", assessments }),
      () => !cancelled && setState({ status: "error" }),
    );
    return () => {
      cancelled = true;
    };
  }, [trainerId, studentId]);

  return (
    <section>
      <h2>Anamneses e autoavaliações</h2>
      {state.status === "loading" && <p className="loading">Carregando…</p>}
      {state.status === "error" && <p role="alert">Não foi possível carregar as anamneses.</p>}
      {state.status === "ready" && state.assessments.length === 0 && <p>Nenhuma anamnese ou autoavaliação enviada ainda.</p>}
      {state.status === "ready" &&
        state.assessments.map((assessment) => {
          const flagged = flaggedQuestions(assessment);
          return (
            <article key={assessment.id}>
              <h3>
                {assessment.anamnesis ? "Anamnese" : "Autoavaliação"} · {formatDateTime(assessment.submittedAt, timeZone)}
              </h3>
              {assessment.anamnesis && (
                <p>
                  {(() => {
                    const points = anamnesisFlags(assessment.parQAnswers, assessment.anamnesis).length;
                    return points === 0 ? "Nenhum ponto de atenção." : `${points} ponto(s) de atenção.`;
                  })()}{" "}
                  <Link className="button" href={`/app/alunos/anamnese?aluno=${encodeURIComponent(studentId)}&id=${encodeURIComponent(assessment.id)}`}>
                    Ver relatório
                  </Link>
                </p>
              )}
              <p>
                Objetivo: {assessment.goal || "—"} · Nível: {assessment.experienceLevel || "—"}
              </p>
              <p>Dias: {assessment.trainingDays.join(", ") || "—"}</p>
              {flagged.length === 0 ? (
                <p>PAR-Q+: nenhuma resposta &quot;sim&quot;.</p>
              ) : (
                <>
                  <p>
                    <strong>
                      PAR-Q+: {flagged.length} resposta(s) &quot;sim&quot; — avalie antes de prescrever:
                    </strong>
                  </p>
                  <ul>
                    {flagged.map((question) => (
                      <li key={question.key}>{question.text}</li>
                    ))}
                  </ul>
                </>
              )}
            </article>
          );
        })}
    </section>
  );
}
