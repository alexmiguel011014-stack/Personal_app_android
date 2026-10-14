import type { Metadata } from "next";
import { Suspense } from "react";
import { MyAnamnesis } from "./MyAnamnesis";

// GOALS.md §38g: the aluno's own anamnese, at /aluno/anamnese?id=… — a query parameter because the site is a static
// export (§23f); useSearchParams needs this Suspense boundary for the static build.
export const metadata: Metadata = { title: "Minha anamnese" };

export default function MyAnamnesisPage() {
  return (
    <Suspense fallback={<p className="loading">Carregando…</p>}>
      <MyAnamnesis />
    </Suspense>
  );
}
