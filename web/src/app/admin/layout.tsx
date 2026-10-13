import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RequireArea } from "../RequireArea";
import { AppShell, type NavItem } from "../_shared/AppShell";

const NAV: readonly NavItem[] = [
  { href: "/admin", label: "Visão geral", shortLabel: "Início", icon: "shield", exact: true },
  { href: "/admin/personais", label: "Personais", icon: "users" },
  { href: "/admin/mensalidades", label: "Mensalidades", shortLabel: "Mensal.", icon: "wallet" },
  { href: "/admin/planos", label: "Modelos de plano", shortLabel: "Planos", icon: "clipboard" },
  { href: "/admin/solicitacoes", label: "Solicitações", shortLabel: "Pedidos", icon: "inbox" },
  { href: "/admin/conta", label: "Minha conta", shortLabel: "Conta", icon: "account" },
];

export const metadata: Metadata = { title: { template: "%s — ALLU personal", default: "Visão geral" } };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireArea area="/admin">
      <AppShell area="admin" home="/admin" caption="Administração" note="Cuidar da plataforma também é cuidar de quem treina." roleLabel="Administrador" nav={NAV}>
        {children}
      </AppShell>
    </RequireArea>
  );
}
