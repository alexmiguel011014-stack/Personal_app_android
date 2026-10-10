"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { destinationFor } from "../data/session";
import { formatDate, localDate } from "../domain/dates";
import { SignOutButton } from "./SignOutButton";
import { useSession } from "./SessionProvider";

// GOALS.md §23f: route-level gating — each area's layout guards itself, rather than one root
// switching on the role (the "one surface serving two audiences" §23 exists to undo). Anyone who
// belongs elsewhere is sent where destinationFor says they belong.
export function RequireArea({ area, children }: { area: "/app" | "/admin" | "/aluno"; children: ReactNode }) {
  const { session, error, refresh } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [now, setNow] = useState(() => Date.now());
  const destination = session.status === "loading" ? null : destinationFor(session);
  const billingUntil = session.status === "signedIn" ? session.profile.platformBillingUntil : null;

  useEffect(() => {
    if (area !== "/app" || billingUntil === null || billingUntil <= Date.now()) return;
    const timer = window.setTimeout(() => setNow(Date.now()), billingUntil - Date.now() + 1);
    return () => window.clearTimeout(timer);
  }, [area, billingUntil]);

  useEffect(() => {
    if (destination !== null && destination !== area) router.replace(destination);
  }, [destination, area, router]);

  if (error) {
    return (
      <main className="public-main">
        <p role="alert">{error}</p>
        <button type="button" onClick={() => void refresh()}>
          Tentar de novo
        </button>
      </main>
    );
  }
  if (destination !== area) return <p className="loading loading-screen">Carregando…</p>;
  const billingBlocked = area === "/app" && session.status === "signedIn" && session.profile.role === "TRAINER" && (
    session.profile.platformBillingStatus === "pending" ||
    session.profile.platformBillingStatus === "blocked" ||
    ((session.profile.platformBillingStatus === "trial" || session.profile.platformBillingStatus === "current") && billingUntil !== null && billingUntil <= now)
  );
  const trainerAccountRoute = pathname.replace(/\/+$/, "") === "/app/conta";
  if (billingBlocked && !trainerAccountRoute) {
    return <main className="public-main">
      <p className="eyebrow">Acesso ao personal</p>
      <h1>Conta temporariamente bloqueada</h1>
      <p>{session.profile.platformBillingStatus === "pending"
        ? "Seu plano foi cadastrado e aguarda o primeiro pagamento — ou o administrador ainda vai configurá-lo."
        : billingUntil !== null
          ? `Sua mensalidade venceu em ${formatDate(localDate(billingUntil))}. Fale com o administrador para regularizar.`
          : "Sua mensalidade venceu. Fale com o administrador para regularizar."}</p>
      <button type="button" onClick={() => void refresh()}>Verificar novamente</button>
      <SignOutButton />
    </main>;
  }
  return <>{children}</>;
}
