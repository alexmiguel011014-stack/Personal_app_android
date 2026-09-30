import type { Metadata } from "next";
import { RequireArea } from "../RequireArea";
import { AppShell, type NavItem } from "../_shared/AppShell";

// GOALS.md §23h: the student surface. Mobile-first from the first line of markup — a student is on
// a phone browser essentially always, so this layout never inherits the trainer dashboard's: one
// column, one thing at a time, the phone's two tabs (Fichas / Evolução). On a desktop the content is
// a centred column, never a stretched phone screen. §23f's gate: only a STUDENT connected to a
// trainer gets past RequireArea.
const NAV: readonly NavItem[] = [
  { href: "/aluno", label: "Fichas", icon: "clipboard", exact: true },
  { href: "/aluno/evolucao", label: "Evolução", icon: "trend" },
];

// `template` repeated: see app/app/layout.tsx.
export const metadata: Metadata = { title: { template: "%s — ALLU", default: "Minhas fichas — ALLU" } };

export default function StudentLayout({ children }: LayoutProps<"/aluno">) {
  return (
    <RequireArea area="/aluno">
      <AppShell
        area="student"
        home="/aluno"
        caption="Meu caderno de treino"
        note="Cada série registrada é um passo a mais."
        roleLabel="Aluno"
        nav={NAV}
      >
        {children}
      </AppShell>
    </RequireArea>
  );
}
