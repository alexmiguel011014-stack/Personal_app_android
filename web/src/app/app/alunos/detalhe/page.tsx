import type { Metadata } from "next";
import { Suspense } from "react";
import { StudentDetail } from "./StudentDetail";

// GOALS.md §23g: one student, at /app/alunos/detalhe?id=… — a query parameter because the site is a
// static export (§23f); useSearchParams needs this Suspense boundary for the static build.
export const metadata: Metadata = { title: "Aluno" };

export default function StudentDetailPage() {
  return (
    <Suspense fallback={<p className="loading">Carregando…</p>}>
      <StudentDetail />
    </Suspense>
  );
}
