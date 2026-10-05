"use client";

import Link from "next/link";
import { useState } from "react";
import { filterStudentsByPause, matchesSearch, type StudentPauseFilter } from "../../../domain/students";
import { Avatar } from "../../_shared/Avatar";
import { useSession } from "../../SessionProvider";
import { useTrainerData } from "../useTrainerData";

// GOALS.md §23g: every student, searchable and filterable — the web's answer to the Android list,
// with what that list shows (name, goal, connection, a medical-notes flag), as the ALLU template's
// directory of cards (§23k).

type LinkFilter = "todos" | "conectados" | "aguardando";

export default function StudentsPage() {
  const { session } = useSession();
  if (session.status !== "signedIn") return null;
  return <Students trainerId={session.uid} />;
}

function Students({ trainerId }: { trainerId: string }) {
  const { data, reload } = useTrainerData(trainerId);
  const [search, setSearch] = useState("");
  const [pauseFilter, setPauseFilter] = useState<StudentPauseFilter>("active");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("todos");

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

  const pauseFiltered = filterStudentsByPause(data.snapshot.students, pauseFilter);
  const shown = pauseFiltered
    .filter((s) => linkFilter === "todos" || (linkFilter === "conectados") === s.linked)
    .filter((s) => matchesSearch(s.name, search))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <main>
      <header className="page-header">
        <div>
          <h1>Alunos</h1>
          <p className="header-subtitle">Perfis, objetivos e a situação de vínculo de cada aluno com você.</p>
        </div>
        <div className="page-actions">
          <Link className="button button-primary" href="/app/alunos/novo">
            Cadastrar aluno
          </Link>
        </div>
      </header>
      <div className="filters">
        <label className="grow">
          Buscar
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome do aluno" />
        </label>
        <label>
          Situação
          <select value={pauseFilter} onChange={(e) => setPauseFilter(e.target.value as StudentPauseFilter)}>
            <option value="active">Ativos</option>
            <option value="paused">Pausados</option>
            <option value="all">Todos</option>
          </select>
        </label>
        <label>
          Vínculo
          <select value={linkFilter} onChange={(e) => setLinkFilter(e.target.value as LinkFilter)}>
            <option value="todos">Todos</option>
            <option value="conectados">Conectados</option>
            <option value="aguardando">Aguardando conexão</option>
          </select>
        </label>
      </div>
      {shown.length === 0 ? (
        <p>Nenhum aluno encontrado.</p>
      ) : (
        <>
          <p className="directory-count">
            {shown.length} de {pauseFiltered.length} alunos
          </p>
          <section className="student-directory" aria-label="Diretório de alunos">
            {shown.map((s) => (
              <article className="directory-card" key={s.id}>
                <Avatar name={s.name} />
                <div>
                  <h2>
                    <Link href={`/app/alunos/detalhe?id=${encodeURIComponent(s.id)}`}>{s.name}</Link>
                  </h2>
                  <p>
                    Objetivo: {s.goal || "—"}
                    {s.trainingDays.length > 0 && ` · ${s.trainingDays.map((day) => day.slice(0, 3)).join(", ")}`}
                  </p>
                  <p className="status-line">
                    {s.paused && "Pausado · "}{s.linked ? "Conectado · conta vinculada" : "Cadastrado · aguardando conexão"}
                  </p>
                </div>
                {s.medicalNotes.trim() !== "" && <span className="attention">Restrição médica informada</span>}
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
