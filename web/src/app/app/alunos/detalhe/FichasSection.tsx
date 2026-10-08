"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getFirebase } from "../../../../data/firebase";
import { FichaNotFound, deleteFicha, loadStudentFichas } from "../../../../data/workouts";
import { formatDate, localDate } from "../../../../domain/dates";
import { MAX_FICHAS, type Ficha } from "../../../../domain/fichas";
import { ConfirmDialog } from "../../../_shared/ConfirmDialog";

// GOALS.md §34: a student's fichas as simple cards — the name the trainer gave, the date it was last modified, and
// Editar / Excluir. A ficha is a named set of treinos (domain/fichas.ts); to see what is inside, the trainer opens
// Editar, which is the same screen as "Nova ficha". Newest first; the student keeps at most MAX_FICHAS.
//
// New fichas only for a connected student, on purpose — stricter than Android. A ficha is keyed to the student's id,
// and claiming an invite gives the student a *new* id (their account's uid), so a ficha made for the draft stays on
// the draft and the student never sees it after joining.

type State = { status: "loading" } | { status: "error" } | { status: "ready"; fichas: Ficha[] };

export function FichasSection({
  trainerId,
  studentId,
  connected,
  timeZone,
}: {
  trainerId: string;
  studentId: string;
  connected: boolean;
  timeZone: string;
}) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Ficha | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStudentFichas(getFirebase().db, trainerId, studentId).then(
      (fichas) => !cancelled && setState({ status: "ready", fichas }),
      () => !cancelled && setState({ status: "error" }),
    );
    return () => {
      cancelled = true;
    };
  }, [trainerId, studentId, version]);

  async function confirmDelete() {
    if (deleting === null) return;
    const ficha = deleting;
    setDeleting(null);
    setError(null);
    try {
      await deleteFicha(getFirebase().db, trainerId, studentId, ficha.id);
    } catch (failure) {
      setError(
        failure instanceof FichaNotFound
          ? "A ficha já não existe — a lista foi atualizada."
          : "Não foi possível excluir. Tente de novo.",
      );
      if (!(failure instanceof FichaNotFound)) return;
    }
    setVersion((v) => v + 1);
  }

  const editorUrl = (fichaId?: string) =>
    `/app/fichas/editar?aluno=${encodeURIComponent(studentId)}${fichaId ? `&ficha=${encodeURIComponent(fichaId)}` : ""}`;

  return (
    <section>
      <h2>Fichas</h2>
      {connected ? (
        <>
          <p>
            <Link href={editorUrl()}>Nova ficha</Link>
          </p>
          <p className="section-footnote">
            Até {MAX_FICHAS} fichas por aluno — ao criar a terceira, a mais antiga é excluída.
          </p>
        </>
      ) : (
        <p>
          Conecte o aluno pelo convite antes de montar fichas: uma ficha feita para o cadastro ainda não
          conectado fica presa a ele, e o aluno não a vê depois de entrar.
        </p>
      )}
      {state.status === "loading" && <p className="loading">Carregando…</p>}
      {state.status === "error" && <p role="alert">Não foi possível carregar as fichas.</p>}
      {state.status === "ready" && state.fichas.length === 0 && <p>Nenhuma ficha ainda.</p>}
      {state.status === "ready" &&
        state.fichas.map((ficha) => (
          <article key={ficha.id}>
            <h3>{ficha.name}</h3>
            <p>Modificada em {formatDate(localDate(ficha.updatedAt, timeZone))}</p>
            <p>
              <Link className="button" href={editorUrl(ficha.id)}>
                Editar
              </Link>{" "}
              <button type="button" aria-label={`Excluir a ficha ${ficha.name}`} onClick={() => setDeleting(ficha)}>
                Excluir
              </button>
            </p>
          </article>
        ))}
      {error && <p role="alert">{error}</p>}

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Excluir a ficha “${deleting.name}”?` : "Excluir a ficha?"}
        yesLabel="Excluir"
        noLabel="Cancelar"
        onYes={() => void confirmDelete()}
        onNo={() => setDeleting(null)}
      >
        {deleting && (
          <p>
            Esse processo não pode ser desfeito. O aluno deixa de ver {deleting.treinos.length === 1 ? "o treino" : `os ${deleting.treinos.length} treinos`}{" "}
            desta ficha; o histórico de cargas dele não é apagado.
          </p>
        )}
      </ConfirmDialog>
    </section>
  );
}
