import type { Metadata } from "next";

// The tab title of this route ("Alunos — ALLU personal", from the root layout's template).
export const metadata: Metadata = { title: "Alunos" };

export default function Layout({ children }: LayoutProps<"/app/alunos">) {
  return children;
}
