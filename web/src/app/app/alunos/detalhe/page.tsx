import { Suspense } from "react";
import { StudentDetail } from "./StudentDetail";

// GOALS.md §23g: one student, at /app/alunos/detalhe?id=… — a query parameter because the site is a
// static export (§23f); useSearchParams needs this Suspense boundary for the static build.
export default function StudentDetailPage() {
  return (
    <Suspense fallback={<p>Carregando…</p>}>
      <StudentDetail />
    </Suspense>
  );
}
