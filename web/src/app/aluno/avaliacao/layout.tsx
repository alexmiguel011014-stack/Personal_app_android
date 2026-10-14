import type { Metadata } from "next";

// The tab title of this route ("Anamnese — ALLU personal", from the root layout's template).
export const metadata: Metadata = { title: "Anamnese" };

export default function Layout({ children }: LayoutProps<"/aluno/avaliacao">) {
  return children;
}
