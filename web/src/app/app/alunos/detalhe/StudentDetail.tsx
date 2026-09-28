"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { getFirebase } from "../../../../data/firebase";
import {
  generateInvite,
  requestAssessment,
  setStudentPermissions,
  updateStudentProfile,
  type TrainerStudent,
} from "../../../../data/students";
import type { StudentProfile } from "../../../../domain/studentProfile";
import { useSession } from "../../../SessionProvider";
import { useTrainerData } from "../../useTrainerData";
import { StudentForm } from "../StudentForm";
import { AssessmentsSection } from "./AssessmentsSection";
import { BillingSection } from "./BillingSection";
import { MeasurementsSection } from "./MeasurementsSection";
import { ProgressSection } from "../../../_shared/ProgressSection";
import { WorkoutsSection } from "./WorkoutsSection";

// GOALS.md §23g: a student's page — profile, and either the invite (a draft) or the §17 permissions
// (a connected account), then the mensalidade, fichas, self-assessments, measurements and training
// progress. A draft shows only what it can have: it has no account, so no sessions or
// self-assessments of its own. Loading it keeps this month's charges current, as the dashboard does.

export function StudentDetail() {
  const { session } = useSession();
  const id = useSearchParams().get("id") ?? "";
  if (session.status !== "signedIn") return null;
  return <Detail trainerId={session.uid} studentId={id} />;
}

function Detail({ trainerId, studentId }: { trainerId: string; studentId: string }) {
  const { data, reload } = useTrainerData(trainerId, { ensureCharges: true });
  const [editing, setEditing] = useState(false);

  if (data.status === "loading") return <p>Carregando…</p>;
  if (data.status === "error") {
    return (
      <main>
        <p role="alert">{data.message}</p>
        <button type="button" onClick={reload}>
          Tentar de novo
        </button>
      </main>
    );
  }

  const draft = data.snapshot.drafts.find((d) => d.id === studentId);
  const account = data.snapshot.linked.find((l) => l.id === studentId);
  const student: TrainerStudent | null = account
    ? { kind: "linked", doc: account }
    : draft
      ? { kind: "draft", doc: draft }
      : null;

  if (student === null) {
    return (
      <main>
        <p>Aluno não encontrado.</p>
        <p>
          <Link href="/app/alunos">Voltar para a lista</Link>
        </p>
      </main>
    );
  }

  const profile: StudentProfile = {
    name: student.doc.name,
    gender: student.doc.gender,
    phone: student.doc.phone,
    goal: student.doc.goal,
    experienceLevel: student.doc.experienceLevel,
    medicalNotes: student.doc.medicalNotes,
    trainingDays: student.doc.trainingDays,
  };

  return (
    <main>
      <p>
        <Link href="/app/alunos">← Alunos</Link>
      </p>
      <h1>{profile.name}</h1>
      <p>{student.kind === "linked" ? "Conectado" : "Aguardando conexão"}</p>

      <section>
        <h2>Dados</h2>
        {editing ? (
          <StudentForm
            initial={profile}
            submitLabel="Salvar"
            onSubmit={async (next) => {
              await updateStudentProfile(getFirebase().db, trainerId, student, next);
              setEditing(false);
              reload();
            }}
          />
        ) : (
          <>
            <dl>
              <dt>Sexo</dt>
              <dd>{profile.gender}</dd>
              <dt>Telefone</dt>
              <dd>{profile.phone || "—"}</dd>
              <dt>Objetivo</dt>
              <dd>{profile.goal || "—"}</dd>
              <dt>Nível</dt>
              <dd>{profile.experienceLevel || "—"}</dd>
              <dt>Restrições médicas</dt>
              <dd>{profile.medicalNotes || "—"}</dd>
              <dt>Dias de treino</dt>
              <dd>{profile.trainingDays.join(", ") || "—"}</dd>
            </dl>
            <button type="button" onClick={() => setEditing(true)}>
              Editar
            </button>
          </>
        )}
      </section>

      {student.kind === "draft" ? (
        <InviteSection trainerId={trainerId} student={student} />
      ) : (
        <PermissionsSection studentId={student.doc.id} account={student.doc} onChanged={reload} />
      )}

      <BillingSection
        trainerId={trainerId}
        studentId={student.doc.id}
        snapshot={data.snapshot}
        today={data.today}
        timeZone={data.timeZone}
        onChanged={reload}
      />

      <WorkoutsSection
        trainerId={trainerId}
        studentId={student.doc.id}
        connected={student.kind === "linked"}
        timeZone={data.timeZone}
      />

      {student.kind === "linked" && (
        <AssessmentsSection trainerId={trainerId} studentId={student.doc.id} timeZone={data.timeZone} />
      )}

      <MeasurementsSection
        trainerId={trainerId}
        studentId={student.doc.id}
        connected={student.kind === "linked"}
        timeZone={data.timeZone}
      />

      {student.kind === "linked" && (
        <ProgressSection
          logs={data.snapshot.logs.filter((log) => log.studentId === student.doc.id)}
          timeZone={data.timeZone}
        />
      )}
    </main>
  );
}

function InviteSection({ trainerId, student }: { trainerId: string; student: Extract<TrainerStudent, { kind: "draft" }> }) {
  const [link, setLink] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function create() {
    setStatus(null);
    try {
      const code = await generateInvite(getFirebase().db, trainerId, student.doc, Date.now());
      setLink(`${window.location.origin}/convite?c=${code}`);
    } catch {
      setStatus("Não foi possível gerar o convite. Tente de novo.");
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Link copiado.");
    } catch {
      setStatus("Não foi possível copiar — selecione o link e copie à mão.");
    }
  }

  return (
    <section>
      <h2>Convite</h2>
      <p>Envie o link ao aluno: ele cria a conta e fica conectado a você.</p>
      {link === null ? (
        <button type="button" onClick={() => void create()}>
          Gerar link de convite
        </button>
      ) : (
        <p>
          <a href={link}>{link}</a>{" "}
          <button type="button" onClick={() => void copy(link)}>
            Copiar
          </button>
        </p>
      )}
      {status && <p role="status">{status}</p>}
    </section>
  );
}

function PermissionsSection({
  studentId,
  account,
  onChanged,
}: {
  studentId: string;
  account: Extract<TrainerStudent, { kind: "linked" }>["doc"];
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function run(write: () => Promise<void>) {
    setError(null);
    try {
      await write();
      onChanged();
    } catch {
      setError("Não foi possível salvar. Tente de novo.");
    }
  }

  const db = () => getFirebase().db;
  return (
    <section>
      <h2>Permissões do aluno</h2>
      <p>
        <label>
          <input
            type="checkbox"
            checked={account.canSelfAssess}
            onChange={(e) => void run(() => setStudentPermissions(db(), studentId, e.target.checked, account.canLogBiometrics))}
          />{" "}
          Pode fazer autoavaliação (PAR-Q+)
        </label>
      </p>
      <p>
        <label>
          <input
            type="checkbox"
            checked={account.canLogBiometrics}
            onChange={(e) => void run(() => setStudentPermissions(db(), studentId, account.canSelfAssess, e.target.checked))}
          />{" "}
          Pode registrar as próprias medidas
        </label>
      </p>
      {account.pendingAssessmentRequest ? (
        <p>Autoavaliação solicitada — aguardando o aluno.</p>
      ) : (
        <p>
          <button
            type="button"
            disabled={!account.canSelfAssess}
            onClick={() => void run(() => requestAssessment(db(), studentId))}
          >
            Solicitar autoavaliação
          </button>
          {!account.canSelfAssess && " (libere a autoavaliação antes)"}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
