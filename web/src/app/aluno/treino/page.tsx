import { Suspense } from "react";
import { LogSession } from "./LogSession";

// GOALS.md §23h: /aluno/treino?ficha=<id> — query parameter, static export (§23f).
export default function LogSessionPage() {
  return (
    <Suspense fallback={<p>Carregando…</p>}>
      <LogSession />
    </Suspense>
  );
}
