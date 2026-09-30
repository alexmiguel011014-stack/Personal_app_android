import type { Metadata } from "next";
import { Suspense } from "react";
import { FichaEditor } from "./FichaEditor";

// GOALS.md §23g: /app/fichas/editar?aluno=<id>[&id=<ficha>] — query parameters, static export (§23f).
export const metadata: Metadata = { title: "Ficha de treino" };

export default function FichaEditorPage() {
  return (
    <Suspense fallback={<p className="loading">Carregando…</p>}>
      <FichaEditor />
    </Suspense>
  );
}
