import { Suspense } from "react";
import { FichaEditor } from "./FichaEditor";

// GOALS.md §23g: /app/fichas/editar?aluno=<id>[&id=<ficha>] — query parameters, static export (§23f).
export default function FichaEditorPage() {
  return (
    <Suspense fallback={<p>Carregando…</p>}>
      <FichaEditor />
    </Suspense>
  );
}
