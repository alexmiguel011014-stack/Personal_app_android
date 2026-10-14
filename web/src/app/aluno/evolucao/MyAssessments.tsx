"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadMyAssessments } from "../../../data/assessments";
import { getFirebase } from "../../../data/firebase";
import { flaggedQuestions, type Assessment } from "../../../domain/assessments";
import { formatDate, localDate } from "../../../domain/dates";

// GOALS.md §38f/§38g: "Minhas avaliações" — what the aluno has sent their personal (anamneses and plain PAR-Q+
// self-assessments), newest first; an anamnese opens as a report they can read and print. A handful of documents.

type State = { status: "loading" } | { status: "error" } | { status: "ready"; assessments: Assessment[] };

export function MyAssessments({ uid, timeZone }: { uid: string; timeZone: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadMyAssessments(getFirebase().db, uid).then(
      (assessments) => !cancelled && setState({ status: "ready", assessments }),
      () => !cancelled && setState({ status: "error" }),
    );
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return (
    <section>
      <h2>Minhas avaliações</h2>
      {state.status === "loading" && <p className="loading">Carregando…</p>}
      {state.status === "error" && <p role="alert">Não foi possível carregar suas avaliações.</p>}
      {state.status === "ready" && state.assessments.length === 0 && <p>Você ainda não enviou nenhuma anamnese ou autoavaliação.</p>}
      {state.status === "ready" && state.assessments.length > 0 && (
        <ul>
          {state.assessments.map((assessment) => {
            const yes = flaggedQuestions(assessment).length;
            return (
              <li key={assessment.id}>
                {formatDate(localDate(assessment.submittedAt, timeZone))} — {assessment.anamnesis ? "Anamnese" : "Autoavaliação"} ·{" "}
                {yes === 0 ? "nenhuma resposta “sim”" : `${yes} resposta(s) “sim”`}
                {assessment.anamnesis && (
                  <>
                    {" · "}
                    <Link href={`/aluno/anamnese?id=${encodeURIComponent(assessment.id)}`}>Ver</Link>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
