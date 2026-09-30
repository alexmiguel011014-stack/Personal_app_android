import type { Metadata } from "next";
import { RequireArea } from "../RequireArea";
import { AppShell, type NavItem } from "../_shared/AppShell";

// GOALS.md §23g: the trainer surface. Its own layout, separate from /aluno's, on purpose — the
// two audiences want opposite things (density on a desktop vs one thing at a time on a phone),
// and one layout serving both is exactly the mistake §23 exists to undo. §23f's gate: only a
// TRAINER (or ADM) gets past RequireArea; anyone else is sent where they belong.
//
// The doubled "app/app" path is not a typo: the outer `app/` is Next.js's App Router directory,
// the inner one is the `/app` URL segment chosen with the user on 2026-09-22.
//
// §23k: the frame is the ALLU template's — the same AppShell as /aluno, with the trainer's
// destinations. "Hoje" is the old "Painel".
const NAV: readonly NavItem[] = [
  { href: "/app", label: "Hoje", icon: "today", exact: true },
  { href: "/app/agenda", label: "Agenda", icon: "calendar" },
  { href: "/app/alunos", label: "Alunos", icon: "users" },
  { href: "/app/registros", label: "Registros", icon: "book" },
  { href: "/app/mensalidades", label: "Mensalidades", icon: "wallet" },
];

// The tab title of the trainer area. `template` is repeated here on purpose: a segment that sets a plain
// string title ends the root layout's template for everything below it.
export const metadata: Metadata = { title: { template: "%s — ALLU", default: "Hoje — ALLU" } };

export default function TrainerLayout({ children }: LayoutProps<"/app">) {
  return (
    <RequireArea area="/app">
      <AppShell
        area="trainer"
        home="/app"
        caption="Caderno do treinador"
        note="Um bom treino começa com atenção."
        roleLabel="Treinador"
        nav={NAV}
      >
        {children}
      </AppShell>
    </RequireArea>
  );
}
