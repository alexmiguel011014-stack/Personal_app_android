import type { Metadata } from "next";
import { Suspense } from "react";
import { LogSession } from "./LogSession";

// GOALS.md §23h: /aluno/treino?ficha=<id> — query parameter, static export (§23f).
export const metadata: Metadata = { title: "Registrar treino" };

export default function LogSessionPage() {
  return (
    <Suspense fallback={<p className="loading">Carregando…</p>}>
      <LogSession />
    </Suspense>
  );
}
