"use client";

import { useState } from "react";
import { matchesSearch } from "../../../domain/students";
import { useSession } from "../../SessionProvider";
import { useTrainerData } from "../useTrainerData";

// GOALS.md §23g: every student, searchable and filterable — the web's answer to the Android list,
// with what that list shows (name, goal, connection, a medical-notes flag). Unstyled (phase 1).

type Filter = "todos" | "conectados" | "aguardando";

export default function StudentsPage() {
  const { session } = useSession();
  if (session.status !== "signedIn") return null;
  return <Students trainerId={session.uid} />;
}

function Students({ trainerId }: { trainerId: string }) {
  const { data, reload } = useTrainerData(trainerId);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");

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

  const shown = data.snapshot.students
    .filter((s) => filter === "todos" || (filter === "conectados") === s.linked)
    .filter((s) => matchesSearch(s.name, search))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <main>
      <h1>Alunos</h1>
      <p>
        <label>
          Buscar{" "}
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>{" "}
        <label>
          Mostrar{" "}
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="todos">Todos</option>
            <option value="conectados">Conectados</option>
            <option value="aguardando">Aguardando conexão</option>
          </select>
        </label>
      </p>
      {shown.length === 0 ? (
        <p>Nenhum aluno encontrado.</p>
      ) : (
        <table>
          <caption>
            {shown.length} de {data.snapshot.students.length} alunos
          </caption>
          <thead>
            <tr>
              <th scope="col">Nome</th>
              <th scope="col">Objetivo</th>
              <th scope="col">Situação</th>
              <th scope="col">Restrição médica</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.goal || "—"}</td>
                <td>{s.linked ? "Conectado" : "Aguardando conexão"}</td>
                <td>{s.medicalNotes.trim() !== "" ? "Sim" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
