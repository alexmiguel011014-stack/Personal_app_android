"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { formatCents } from "../../../../domain/payments";
import { countActiveInvitesFromOtherClients, countActivePlatformInvites, isPlatformInviteActive, type PlatformInviteRecord } from "../../../../domain/platformInvites";
import { getFirebase } from "../../../../data/firebase";
import {
  requestAssessment,
  setCanAddSets,
  setStudentPermissions,
  setStudentPaused,
  updateStudentProfile,
  type TrainerStudent,
} from "../../../../data/students";
import { cancelWebsiteInvite, createWebsiteInvite, loadWebsiteInviteUsage, WebsiteInviteLimitError, WebsiteInvitePriceConfirmation, type WebsiteInviteUsage, platformInviteFromDocument } from "../../../../data/platformInvites";
import { trackActivity } from "../../../../data/activity";
import type { StudentProfile } from "../../../../domain/studentProfile";
import { useSession } from "../../../SessionProvider";
import { useTrainerData } from "../../useTrainerData";
import { StudentForm } from "../StudentForm";
import { AssessmentsSection } from "./AssessmentsSection";
import { BillingSection } from "./BillingSection";
import { MeasurementsSection } from "./MeasurementsSection";
import { Avatar } from "../../../_shared/Avatar";
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
  const [pauseBusy, setPauseBusy] = useState(false);
  const [pauseStatus, setPauseStatus] = useState<string | null>(null);

  if (data.status === "loading") return <p className="loading">Carregando…</p>;
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
      <p className="eyebrow">
        <Link href="/app/alunos">← Alunos</Link>
      </p>
      <div className="profile-heading">
        <Avatar name={profile.name} />
        <div>
          <h1>{profile.name}</h1>
          <p>
            <span className={`status-pill${student.kind === "linked" ? "" : " is-pending"}`}>
              {student.doc.paused ? "Pausado" : student.kind === "linked" ? "Conectado" : "Aguardando conexão"}
            </span>
          </p>
        </div>
      </div>
      <p>
        <button
          type="button"
          disabled={pauseBusy}
          onClick={async () => {
            setPauseBusy(true);
            setPauseStatus(null);
            try {
              await setStudentPaused(getFirebase().db, student, !student.doc.paused);
              setPauseStatus(student.doc.paused ? "Aluno reativado." : "Aluno pausado.");
              reload();
            } catch (error) {
              setPauseStatus(error instanceof Error ? error.message : "Não foi possível alterar a situação do aluno.");
            } finally {
              setPauseBusy(false);
            }
          }}
        >
          {pauseBusy ? "Salvando…" : student.doc.paused ? "Reativar aluno" : "Pausar aluno"}
        </button>
      </p>
      <p className="section-footnote">
        A pausa afeta o diretório e os indicadores do painel; o aluno mantém acesso aos treinos e registros, e as cobranças continuam normalmente.
      </p>
      {pauseStatus && <p role="status">{pauseStatus}</p>}

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
        <InviteSection trainerId={trainerId} student={student} timeZone={data.timeZone} />
      ) : (
        <PermissionsSection trainerId={trainerId} studentId={student.doc.id} account={student.doc} timeZone={data.timeZone} onChanged={reload} />
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

function InviteSection({
  trainerId,
  student,
  timeZone,
}: {
  trainerId: string;
  student: Extract<TrainerStudent, { kind: "draft" }>;
  timeZone: string;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [usage, setUsage] = useState<WebsiteInviteUsage | null>(null);
  const [invites, setInvites] = useState<PlatformInviteRecord[]>([]);
  const [liveInviteCounts, setLiveInviteCounts] = useState<{ active: number; otherClients: number } | null>(null);
  const [liveLinkedStudentSeats, setLiveLinkedStudentSeats] = useState<number | null>(null);
  const [priceConfirmation, setPriceConfirmation] = useState<number | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);

  useEffect(() => {
    const db = getFirebase().db;
    let cancelled = false;
    void loadWebsiteInviteUsage(db, trainerId).then((current) => {
      if (!cancelled) setUsage(current);
    }).catch((error: unknown) => {
      if (!cancelled) setStatus(error instanceof Error ? error.message : "Não foi possível carregar os limites de convite.");
    }).finally(() => { if (!cancelled) setLoadingUsage(false); });
    const stopInvites = onSnapshot(query(collection(db, "invites"), where("trainerId", "==", trainerId)), (snapshot) => {
      const records = snapshot.docs.map((item) => platformInviteFromDocument(item.id, item.data())).filter((item): item is PlatformInviteRecord => item !== null);
      const now = Date.now();
      setInvites(records.filter((invite) => isPlatformInviteActive(invite, now)));
      setLiveInviteCounts({
        active: countActivePlatformInvites(records, trainerId, now),
        otherClients: countActiveInvitesFromOtherClients(records, trainerId, now),
      });
    }, (error) => setStatus(error.message.includes("permission")
      ? "As regras do Firestore ainda não liberam a consulta de convites deste personal."
      : "Não foi possível acompanhar os convites ativos."));
    const stopLinked = onSnapshot(query(collection(db, "users"), where("role", "==", "STUDENT"), where("trainerId", "==", trainerId)), (snapshot) => {
      setLiveLinkedStudentSeats(snapshot.size);
    });
    return () => { cancelled = true; stopInvites(); stopLinked(); };
  }, [trainerId]);

  useEffect(() => {
    if (!usage) return;
    const nextExpiry = invites
      .map((invite) => invite.expiresAt)
      .filter((expiresAt): expiresAt is number => expiresAt != null && expiresAt > Date.now())
      .sort((a, b) => a - b)[0];
    if (nextExpiry === undefined) return;
    const timer = window.setTimeout(() => {
      const now = Date.now();
      const active = countActivePlatformInvites(invites, trainerId, now);
      const otherClients = countActiveInvitesFromOtherClients(invites, trainerId, now);
      setInvites(invites.filter((invite) => isPlatformInviteActive(invite, now)));
      setLiveInviteCounts({ active, otherClients });
      setUsage((current) => current ? {
        ...current,
        activeInviteCodes: active,
        pendingInviteReservations: active,
        activeInvitesFromOtherClients: otherClients,
      } : current);
    }, Math.max(1, nextExpiry - Date.now() + 1));
    return () => window.clearTimeout(timer);
  }, [invites, trainerId, usage]);

  const displayedUsage = usage && liveInviteCounts && liveLinkedStudentSeats !== null ? {
    ...usage,
    activeInviteCodes: liveInviteCounts.active,
    pendingInviteReservations: liveInviteCounts.active,
    activeInvitesFromOtherClients: liveInviteCounts.otherClients,
    linkedStudentSeats: liveLinkedStudentSeats,
    includedSeatsRemaining: Math.max(0, usage.subscription.terms.includedStudentSeats - liveLinkedStudentSeats),
  } : usage;

  async function create(acceptedExtraCents = 0) {
    setStatus(null);
    setPriceConfirmation(null);
    try {
      const { db } = getFirebase();
      const now = Date.now();
      const result = await createWebsiteInvite(db, trainerId, student.doc, now, acceptedExtraCents);
      const code = result.code;
      const nextLink = `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/convite/?c=${code}`;
      setLink(nextLink);
      await trackActivity(db, trainerId, "inviteGenerated", now, timeZone);
    } catch (error) {
      if (error instanceof WebsiteInvitePriceConfirmation) {
        setPriceConfirmation(error.extraMonthlyCents);
        setStatus(`Se o aluno aceitar o convite, o custo mensal estimado aumenta em ${formatCents(error.extraMonthlyCents)}.`);
      } else if (error instanceof WebsiteInviteLimitError || error instanceof Error) {
        setStatus(error.message);
      } else setStatus("Não foi possível gerar o convite. Tente de novo.");
    }
  }

  async function cancel(code: string) {
    if (!window.confirm("Cancelar este código? O link deixará de funcionar.")) return;
    setStatus(null);
    try {
      await cancelWebsiteInvite(getFirebase().db, trainerId, code);
      setStatus("Convite cancelado; o código ativo foi liberado.");
      setLink(null);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Não foi possível cancelar o convite."); }
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
      {student.doc.paused && <p role="status">Este cadastro está pausado. O convite só poderá ser aceito depois de reativar o aluno.</p>}
      <p>Envie o link ao aluno: ele cria a conta e fica conectado a você.</p>
      {loadingUsage ? <p role="status">Carregando limites de convites…</p> : displayedUsage && <dl>
        <div><dt>Códigos ativos</dt><dd>{displayedUsage.activeInviteCodes}/{displayedUsage.subscription.terms.maxActiveInviteCodes}</dd></div>
        <div><dt>Alunos vinculados</dt><dd>{displayedUsage.linkedStudentSeats} · {displayedUsage.includedSeatsRemaining} vagas incluídas restantes</dd></div>
        {displayedUsage.subscription.mode === "trial" && <div><dt>Vagas reservadas no teste</dt><dd>{displayedUsage.linkedStudentSeats + displayedUsage.pendingInviteReservations}/{displayedUsage.subscription.terms.trialMaxStudentSeats}</dd></div>}
        {displayedUsage.activeInvitesFromOtherClients > 0 && <div><dt>Convites de outros clientes</dt><dd>{displayedUsage.activeInvitesFromOtherClients} (contados no limite)</dd></div>}
      </dl>}
      {link === null ? (
        <button type="button" onClick={() => void create()} disabled={student.doc.paused || loadingUsage || !displayedUsage}>
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
      {priceConfirmation !== null && <button type="button" onClick={() => void create(priceConfirmation)}>
        Confirmar convite · adicional mensal {formatCents(priceConfirmation)} se o aluno aceitar
      </button>}
      {invites.filter((invite) => invite.draftId === student.doc.id).length > 0 && <ul aria-label={`Convites ativos de ${student.doc.name}`}>
        {invites.filter((invite) => invite.draftId === student.doc.id).map((invite) => (
          <li key={invite.id}>Código {invite.id}{invite.expiresAt === null || invite.expiresAt === undefined ? " · sem vencimento" : ` · vence ${new Date(invite.expiresAt).toLocaleString("pt-BR")}`} <button type="button" onClick={() => void cancel(invite.id)}>Cancelar</button></li>
        ))}
      </ul>}
      {status && <p role="status">{status}</p>}
    </section>
  );
}

function PermissionsSection({
  trainerId,
  studentId,
  account,
  timeZone,
  onChanged,
}: {
  trainerId: string;
  studentId: string;
  account: Extract<TrainerStudent, { kind: "linked" }>["doc"];
  timeZone: string;
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
            onChange={(e) =>
              void run(() => setStudentPermissions(db(), studentId, e.target.checked, account.canLogBiometrics))
            }
          />{" "}
          Pode fazer autoavaliação (PAR-Q+)
        </label>
      </p>
      <p>
        <label>
          <input
            type="checkbox"
            checked={account.canLogBiometrics}
            onChange={(e) =>
              void run(() => setStudentPermissions(db(), studentId, account.canSelfAssess, e.target.checked))
            }
          />{" "}
          Pode registrar as próprias medidas
        </label>
      </p>
      <p>
        <label>
          <input
            type="checkbox"
            checked={account.canAddSets}
            onChange={(e) => void run(() => setCanAddSets(db(), studentId, e.target.checked))}
          />{" "}
          Pode adicionar séries extras ao registrar o treino
        </label>
      </p>
      <p className="section-footnote">
        Desligado por padrão: o aluno registra só as séries da ficha. Ligado, ele pode acrescentar séries (com
        confirmação) e remover só as que ele mesmo acrescentou — as séries da ficha nunca saem.
      </p>
      {account.pendingAssessmentRequest ? (
        <p>Autoavaliação solicitada — aguardando o aluno.</p>
      ) : (
        <p>
          <button
            type="button"
            disabled={!account.canSelfAssess}
            onClick={() => void run(async () => {
              const now = Date.now();
              await requestAssessment(db(), studentId);
              await trackActivity(db(), trainerId, "assessmentRequested", now, timeZone);
            })}
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
