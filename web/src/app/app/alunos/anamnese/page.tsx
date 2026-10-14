import type { Metadata } from "next";
import { Suspense } from "react";
import { TrainerAnamnesis } from "./TrainerAnamnesis";

// GOALS.md §38g: one anamnese as a report, at /app/alunos/anamnese?aluno=…&id=… — query parameters because the site
// is a static export (§23f); useSearchParams needs this Suspense boundary for the static build.
export const metadata: Metadata = { title: "Anamnese" };

export default function TrainerAnamnesisPage() {
  return (
    <Suspense fallback={<p className="loading">Carregando…</p>}>
      <TrainerAnamnesis />
    </Suspense>
  );
}
