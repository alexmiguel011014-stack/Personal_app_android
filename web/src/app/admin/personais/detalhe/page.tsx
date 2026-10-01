import { Suspense } from "react";
import TrainerDetailQuery from "./trainer-detail-query";

export const metadata = { title: "Detalhe do personal" };

export default function TrainerDetailPage() {
  return <Suspense fallback={<p className="loading loading-screen">Carregando…</p>}><TrainerDetailQuery /></Suspense>;
}
