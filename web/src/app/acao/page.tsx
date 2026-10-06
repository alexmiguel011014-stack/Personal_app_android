import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicShell } from "../_shared/PublicShell";
import { ActionClient } from "./ActionClient";

// GOALS.md §32e: the page a Firebase e-mail link opens (/acao/?mode=…&oobCode=…) once the console's "action
// URL" for a template points here — confirm the e-mail, set a password, confirm an e-mail change. A query
// string rather than a path for the same reason as /convite: the site is a static export, and
// useSearchParams needs the Suspense boundary for that same static build.
export const metadata: Metadata = { title: "Link do e-mail" };

export default function ActionPage() {
  return (
    <PublicShell>
      <div className="public-main">
        <div className="auth-card">
          <Suspense fallback={<p className="loading">Carregando…</p>}>
            <ActionClient />
          </Suspense>
        </div>
      </div>
    </PublicShell>
  );
}
