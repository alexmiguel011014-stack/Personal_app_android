"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { loadMyAssessments } from "../../../data/assessments";
import { getFirebase } from "../../../data/firebase";
import type { Assessment } from "../../../domain/assessments";
import { AnamnesisReport } from "../../_shared/AnamnesisReport";
import { browserTimeZone } from "../../_shared/browserTimeZone";
import { useSession } from "../../SessionProvider";
import { useStudentData } from "../useStudentData";

// GOALS.md §38g: "Minha anamnese" — the aluno reads (and can print or save as PDF) what they sent. The same report the
// personal sees, without the personal's actions. /aluno/anamnese?id=… (a query parameter: the site is a static export).

export function MyAnamnesis() {
  const { session } = useSession();
  const id = useSearchParams().get("id") ?? "";
  if (session.status !== "signedIn") return null;
  return <Loaded uid={session.uid} assessmentId={id} />;
}

type State = { status: "loading" } | { status: "error" } | { status: "ready"; assessments: Assessment[] };

function Loaded({ uid, assessmentId }: { uid: string; assessmentId: string }) {
  const { data } = useStudentData(uid);
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

  if (data.status === "loading" || state.status === "loading") return <p className="loading">Carregando…</p>;
  if (data.status === "error") return <p role="alert">{data.message}</p>;
  if (state.status === "error") return <p role="alert">Não foi possível carregar sua anamnese.</p>;

  const index = state.assessments.findIndex((assessment) => assessment.id === assessmentId);
  if (index === -1) {
    return (
      <main>
        <p>Anamnese não encontrada.</p>
        <p>
          <Link href="/aluno/evolucao">Voltar para a evolução</Link>
        </p>
      </main>
    );
  }
  return (
    <main>
      <p className="eyebrow no-print">
        <Link href="/aluno/evolucao">← Evolução</Link>
      </p>
      <AnamnesisReport
        assessment={state.assessments[index]}
        previous={state.assessments[index + 1] ?? null}
        studentName={data.profile.name}
        number={state.assessments.length - index}
        timeZone={browserTimeZone()}
      >
        <button type="button" onClick={() => window.print()}>
          Imprimir / salvar PDF
        </button>
      </AnamnesisReport>
    </main>
  );
}
