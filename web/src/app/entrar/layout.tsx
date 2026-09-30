import type { Metadata } from "next";

// The tab title of this route ("Entrar — ALLU", from the root layout's template).
export const metadata: Metadata = { title: "Entrar" };

export default function Layout({ children }: LayoutProps<"/entrar">) {
  return children;
}
