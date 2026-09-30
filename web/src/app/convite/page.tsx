import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicShell } from "../_shared/PublicShell";
import { InviteClaim } from "./InviteClaim";

// GOALS.md §23f: the invite link, /convite?c=CODE. A query parameter rather than /convite/CODE
// because the site is a static export (next.config.ts): a path segment with a value that isn't
// known at build time needs a server. useSearchParams needs the Suspense boundary for that same
// static build.
export const metadata: Metadata = { title: "Convite" };

export default function InvitePage() {
  return (
    <PublicShell>
      <div className="public-main">
        <div className="auth-card">
          <h1>Convite</h1>
          <Suspense fallback={<p className="loading">Carregando…</p>}>
            <InviteClaim />
          </Suspense>
        </div>
      </div>
    </PublicShell>
  );
}
