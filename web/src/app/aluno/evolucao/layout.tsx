import type { Metadata } from "next";

// The tab title of this route ("Minha evolução — ALLU", from the root layout's template).
export const metadata: Metadata = { title: "Minha evolução" };

export default function Layout({ children }: LayoutProps<"/aluno/evolucao">) {
  return children;
}
