"use client";

import Link from "next/link";
import { useSession } from "../../SessionProvider";
import { useStudentData } from "../useStudentData";
import { AnamnesisForm } from "./AnamnesisForm";

// GOALS.md §23h → §38g: the anamnese — the PAR-Q+ self-assessment grown into a health history (see AnamnesisForm).
// Offered only while the trainer's request is pending and self-assessment is granted, as on the phone; sending it
// writes one assessment and clears the request in the same batch (data/assessments.ts).

export default function AssessmentPage() {
  const { session } = useSession();
  if (session.status !== "signedIn") return null;
  return <Assessment uid={session.uid} />;
}

function Assessment({ uid }: { uid: string }) {
  const { data, invalidate } = useStudentData(uid);
  if (data.status === "loading") return <p className="loading">Carregando…</p>;
  if (data.status === "error") return <p role="alert">{data.message}</p>;
  if (!data.profile.pendingAssessmentRequest || !data.profile.canSelfAssess) {
    return (
      <main>
        <h1>Anamnese</h1>
        <p>Nenhuma anamnese pendente.</p>
        <p>
          <Link href="/aluno">Voltar para as fichas</Link>
        </p>
      </main>
    );
  }
  return <AnamnesisForm uid={uid} profile={data.profile} onSent={invalidate} />;
}
