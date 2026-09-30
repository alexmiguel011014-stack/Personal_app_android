import type { Metadata } from "next";

// The tab title of this route ("Registros — ALLU", from the root layout's template).
export const metadata: Metadata = { title: "Registros" };

export default function Layout({ children }: LayoutProps<"/app/registros">) {
  return children;
}
