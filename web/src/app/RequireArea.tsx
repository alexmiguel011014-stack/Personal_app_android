"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { destinationFor } from "../data/session";
import { useSession } from "./SessionProvider";

// GOALS.md §23f: route-level gating — each area's layout guards itself, rather than one root
// switching on the role (the "one surface serving two audiences" §23 exists to undo). Anyone who
// belongs elsewhere is sent where destinationFor says they belong.
export function RequireArea({ area, children }: { area: "/app" | "/aluno"; children: ReactNode }) {
  const { session, error, refresh } = useSession();
  const router = useRouter();
  const destination = session.status === "loading" ? null : destinationFor(session);

  useEffect(() => {
    if (destination !== null && destination !== area) router.replace(destination);
  }, [destination, area, router]);

  if (error) {
    return (
      <main>
        <p role="alert">{error}</p>
        <button type="button" onClick={() => void refresh()}>
          Tentar de novo
        </button>
      </main>
    );
  }
  if (destination !== area) return <p>Carregando…</p>;
  return <>{children}</>;
}
