"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { loadStudentAssessments } from "../../../../data/assessments";
import { getFirebase } from "../../../../data/firebase";
import { updateStudentProfile } from "../../../../data/students";
import { profilePatchChanges, profilePatchFrom } from "../../../../domain/anamnesis";
import type { Assessment } from "../../../../domain/assessments";
import { normalizeProfile, type StudentProfile } from "../../../../domain/studentProfile";
import { AnamnesisReport } from "../../../_shared/AnamnesisReport";
import { ConfirmDialog } from "../../../_shared/ConfirmDialog";
import { useSession } from "../../../SessionProvider";
import { useTrainerData } from "../../useTrainerData";

// GOALS.md §38g (D19): /app/alunos/anamnese?aluno=…&id=… — one anamnese as a report, with the personal's actions:
// print / save as PDF (the browser does it; nothing is stored, the Spark plan has no file storage), bring the
// aluno's profile up to date (only on a click, after a list of exactly what changes), and start a new ficha.

export function TrainerAnamnesis() {
  const { session } = useSession();
  const params = useSearchParams();
  if (session.status !== "signedIn") return null;
  return <Loaded trainerId={session.uid} studentId={params.get("aluno") ?? ""} assessmentId={params.get("id") ?? ""} />;
}

type State = { status: "loading" } | { status: "error" } | { status: "ready"; assessments: Assessment[] };

function Loaded({ trainerId, studentId, assessmentId }: { trainerId: string; studentId: string; assessmentId: string }) {
  const { data, reload } = useTrainerData(trainerId);
  const [state, setState] = useState<State>({ status: "loading" });
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (data.status === "loading" || state.status === "loading") return <p className="loading">Carregando…</p>;
  if (data.status === "error") return <p role="alert">{data.message}</p>;
  if (state.status === "error") return <p role="alert">Não foi possível carregar a anamnese.</p>;

  const student = data.snapshot.linked.find((linked) => linked.id === studentId);
  const index = state.assessments.findIndex((assessment) => assessment.id === assessmentId);
  const back = `/app/alunos/detalhe?id=${encodeURIComponent(studentId)}`;
  if (!student || index === -1) {
    return (
      <main>
        <p>{student ? "Anamnese não encontrada." : "Aluno não encontrado."}</p>
        <p>
          <Link href="/app/alunos">Voltar para a lista</Link>
        </p>
      </main>
    );
  }

  const assessment = state.assessments[index];
  const previous = state.assessments[index + 1] ?? null;
  const current: StudentProfile = {
    name: student.name,
    gender: student.gender,
    phone: student.phone,
    goal: student.goal,
    experienceLevel: student.experienceLevel,
    medicalNotes: student.medicalNotes,
    trainingDays: student.trainingDays,
  };
  const patch = assessment.anamnesis ? profilePatchFrom(assessment.parQAnswers, assessment.anamnesis) : {};
  const changes = profilePatchChanges(current, patch);

  async function applyPatch() {
    setConfirming(false);
    setError(null);
    setNotice(null);
    try {
      await updateStudentProfile(getFirebase().db, trainerId, { kind: "linked", doc: student! }, normalizeProfile({ ...current, ...patch }));
      setNotice("Dados do aluno atualizados.");
      reload();
    } catch {
      setError("Não foi possível atualizar os dados do aluno. Tente de novo.");
    }
  }

  return (
    <main>
      <p className="eyebrow no-print">
        <Link href={back}>← {student.name}</Link>
      </p>
      <AnamnesisReport assessment={assessment} previous={previous} studentName={student.name} number={state.assessments.length - index} timeZone={data.timeZone}>
        <button type="button" onClick={() => window.print()}>
          Imprimir / salvar PDF
        </button>
        {assessment.anamnesis && (
          <button type="button" disabled={changes.length === 0} onClick={() => setConfirming(true)}>
            Atualizar dados do aluno
          </button>
        )}
        <Link className="button" href={`/app/fichas/editar?aluno=${encodeURIComponent(studentId)}`}>
          Nova ficha
        </Link>
      </AnamnesisReport>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      <ConfirmDialog
        open={confirming}
        title="Atualizar os dados do aluno?"
        yesLabel="Atualizar"
        noLabel="Cancelar"
        onNo={() => setConfirming(false)}
        onYes={() => void applyPatch()}
      >
        <p>Estas informações do cadastro vão mudar, a partir das respostas da anamnese:</p>
        <ul>
          {changes.map((change) => (
            <li key={change.field}>
              <strong>{change.label}:</strong> {change.before} → {change.after}
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </main>
  );
}
