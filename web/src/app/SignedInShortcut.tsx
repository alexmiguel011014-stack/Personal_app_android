"use client";

import Link from "next/link";
import { destinationFor } from "../data/session";
import { useSession } from "./SessionProvider";

// GOALS.md §23i: on the public landing, a way back in for someone whose session is still open —
// to wherever destinationFor says they belong. Nothing for a visitor, nor for an account with no
// role yet (its place is /entrar, which explains that; the header already links there).

const LABELS: Record<"/app" | "/aluno" | "/convite", string> = {
  "/app": "Ir para o painel",
  "/aluno": "Ir para as minhas fichas",
  "/convite": "Usar um código de convite",
};

export function SignedInShortcut() {
  const { session } = useSession();
  if (session.status !== "signedIn") return null;
  const destination = destinationFor(session);
  if (destination === "/entrar") return null;
  return (
    <p>
      Você já está conectado. <Link href={destination}>{LABELS[destination]}</Link>
    </p>
  );
}
